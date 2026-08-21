"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ExperimentStatus } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { publishMQTTMessage } from "@/lib/core/mqtt";
import { requireUser } from "@/lib/core/auth/user";
import { REACTOR_SCHEMA, unmetRequirements } from "@/lib/reactor-schema";
import { deriveLinearPhApprox } from "@/lib/calibration-approx";
import type { ActionResult } from "@/lib/action-result";

/** Scopes every device lookup to this deployment's single department. */
function deviceWhere(id: string) {
    return { id, departmentId: process.env.DEPARTMENT_ID };
}

/**
 * Gates valve ACTIVATION (opening, or arming automatic dosing) on a RUNNING
 * experiment. The live MQTT telemetry fan-out works with no experiment at all
 * (see CLAUDE.md), so without this check the valve could fire off nothing but
 * passive monitoring. Closing the valve is never gated - see the call sites.
 */
async function hasRunningExperiment(deviceId: string): Promise<boolean> {
    const experiment = await prisma.experiment.findFirst({
        where: { status: ExperimentStatus.RUNNING, devices: { some: { id: deviceId } } },
        select: { id: true },
    });
    return experiment !== null;
}

const updateDeviceSchema = z.object({
    name: z.string().trim().min(1, "O nome é obrigatório.").max(80),
    description: z.string().trim().max(500).optional(),
    sensors: z.array(z.enum(["ph", "temp", "turbidity", "co2"])).min(1, "Selecione pelo menos um canal."),
});

/**
 * Renames/configures an auto-discovered device. There is no create action - a
 * Device row is minted by app/api/webhooks/device-online/route.ts the instant a
 * node first connects, since it must exist by serialNumber for that route to
 * succeed at all. This is the only mutation the registry needs afterward.
 */
export async function updateDeviceAction(deviceId: string, input: unknown): Promise<ActionResult> {
    try {
        await requireUser();
    } catch {
        return { success: false, error: "Não autenticado." };
    }

    const parsed = updateDeviceSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    }
    const { name, description, sensors } = parsed.data;

    // Refuse a sensor set the edge would silently degrade. A pH probe with no
    // temperature channel cannot be Nernst-compensated, so the driver drops it.
    const unmet = unmetRequirements(sensors);
    if (Object.keys(unmet).length > 0) {
        const detail = Object.entries(unmet)
            .map(([metric, deps]) => {
                const label = REACTOR_SCHEMA.find((m) => m.key === metric)?.label ?? metric;
                const depLabels = deps.map((d) => REACTOR_SCHEMA.find((m) => m.key === d)?.label ?? d).join(", ");
                return `${label} requer ${depLabels}`;
            })
            .join("; ");
        return { success: false, error: `Configuração inválida: ${detail}.` };
    }

    const device = await prisma.device.findFirst({ where: deviceWhere(deviceId) });
    if (!device) return { success: false, error: "Dispositivo não encontrado." };

    const config = (device.config ?? {}) as Record<string, unknown>;
    await prisma.device.update({
        where: { id: device.id },
        data: { name, config: { ...config, sensors, description: description ?? null } },
    });

    revalidatePath("/devices");
    revalidatePath(`/devices/${deviceId}`);
    return { success: true };
}

/**
 * Opens or closes the CO2 electrovalve.
 *
 * Publishes to cmd/devices/{serialNumber}/config; the edge worker encrypts it and
 * relays it to nodes/{id}/config. The AES key stays at the edge, so this app never
 * holds it. `open` must be a real boolean - both the worker and the firmware
 * reject anything else rather than coercing truthiness.
 *
 * This is the manual on/off command only. It is independent of the safety
 * parameters (max-open time / automatic thresholds) pushed by
 * setValveControlAction - those are configured separately and enforced by the
 * firmware regardless of whether this command is ever sent again.
 */
export async function setValveAction(deviceId: string, open: boolean): Promise<ActionResult> {
    try {
        await requireUser();
    } catch {
        return { success: false, error: "Não autenticado." };
    }

    if (typeof open !== "boolean") {
        return { success: false, error: "Estado da válvula inválido." };
    }

    const device = await prisma.device.findFirst({ where: deviceWhere(deviceId) });
    if (!device) return { success: false, error: "Dispositivo não encontrado." };

    if (open && !(await hasRunningExperiment(device.id))) {
        return { success: false, error: "A válvula só pode ser aberta com uma experiência em curso." };
    }

    try {
        await publishMQTTMessage(`cmd/devices/${device.serialNumber}/config`, { valve: open });
    } catch (error) {
        console.error(`[setValve] Publish failed for ${deviceId}:`, error);
        return { success: false, error: "Não foi possível contactar o servidor local." };
    }

    // Intent, not confirmation. The truth is the valve_open telemetry channel,
    // which the UI reconciles against.
    const config = (device.config ?? {}) as Record<string, unknown>;
    await prisma.device.update({
        where: { id: device.id },
        data: { config: { ...config, valveOpen: open } },
    });

    revalidatePath(`/devices/${deviceId}`);
    if (device.projectId) revalidatePath(`/projects/${device.projectId}`);
    return { success: true };
}

const valveControlSchema = z.discriminatedUnion("mode", [
    z.object({
        mode: z.literal("manual"),
        manual: z.object({
            // App-level sanity cap in addition to the firmware's own hard limit -
            // never trust the client for the number that actually reaches hardware.
            maxOpenSeconds: z.number().int().min(1).max(120),
        }),
    }),
    z.object({
        mode: z.literal("automatic"),
        automatic: z
            .object({
                phOpenThreshold: z.number(),
                phCloseThreshold: z.number(),
                burstGainSeconds: z.number().positive(),
                minBurstSeconds: z.number().positive(),
                maxBurstSeconds: z.number().positive().max(60),
                dwellSeconds: z.number().min(0),
            })
            .refine((v) => v.phCloseThreshold < v.phOpenThreshold, {
                message: "O limite inferior tem de ser menor que o limite superior.",
                path: ["phCloseThreshold"],
            })
            .refine((v) => v.minBurstSeconds <= v.maxBurstSeconds, {
                message: "A duração mínima não pode exceder a máxima.",
                path: ["minBurstSeconds"],
            }),
    }),
]);

/**
 * Configures the valve's control mode and safety parameters (Part 2B).
 *
 * This does NOT toggle the valve - it pushes the setpoints the firmware enforces
 * locally. See esp32-sensor-firmware/src/lib/drivers/microalgae_reactor.py for the
 * state machine that actually executes these: the safety limits hold even if the
 * network is unreachable, because they run on the device against its own pH
 * reading, not on a timer in this server action.
 */
export async function setValveControlAction(deviceId: string, input: unknown): Promise<ActionResult> {
    try {
        await requireUser();
    } catch {
        return { success: false, error: "Não autenticado." };
    }

    const parsed = valveControlSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message ?? "Configuração inválida." };
    }

    const device = await prisma.device.findFirst({ where: deviceWhere(deviceId) });
    if (!device) return { success: false, error: "Dispositivo não encontrado." };

    // The firmware has no calibration data of its own and never receives the
    // piecewise transform used for the logged pH - the automatic loop needs a
    // local, if approximate, estimate to compare against a real pH threshold
    // without depending on the network. Without one on file, refuse rather than
    // publish a control config the device cannot safely evaluate.
    let payload: typeof parsed.data | (typeof parsed.data & { calibration: { m: number; b: number } });
    if (parsed.data.mode === "automatic") {
        if (!(await hasRunningExperiment(device.id))) {
            return { success: false, error: "O modo automático só pode ser ativado com uma experiência em curso." };
        }
        const calibrationConfig = (device.calibrationConfig ?? {}) as Record<string, unknown>;
        const approx = deriveLinearPhApprox(calibrationConfig.ph);
        if (!approx) {
            return {
                success: false,
                error: "Calibre o sensor de pH antes de ativar o modo automático.",
            };
        }
        payload = { ...parsed.data, calibration: approx };
    } else {
        payload = parsed.data;
    }

    try {
        await publishMQTTMessage(`cmd/devices/${device.serialNumber}/config`, { control: payload });
    } catch (error) {
        console.error(`[setValveControl] Publish failed for ${deviceId}:`, error);
        return { success: false, error: "Não foi possível contactar o servidor local." };
    }

    const config = (device.config ?? {}) as Record<string, unknown>;
    await prisma.device.update({
        where: { id: device.id },
        data: { config: { ...config, control: payload } },
    });

    revalidatePath(`/devices/${deviceId}`);
    if (device.projectId) revalidatePath(`/projects/${device.projectId}`);
    return { success: true };
}
