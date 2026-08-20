"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DeviceStatus, ExperimentStatus } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { publishMQTTMessage } from "@/lib/core/mqtt";
import { requireUser } from "@/lib/core/auth/user";
import { REACTOR_SCHEMA, unmetRequirements } from "@/lib/reactor-schema";

/** Name of the single perpetual experiment per reactor. Never shown in the UI. */
const CONTINUOUS_RUN = "continuous";

const createReactorSchema = z.object({
    name: z.string().trim().min(1, "O nome do reator é obrigatório.").max(80),
    // Must equal the ESP32's on-wire device_id, which is what the worker uses to
    // address nodes/{id}/config. Same character class the worker validates against.
    serialNumber: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9_-]{1,64}$/, "Número de série inválido."),
    metrics: z.array(z.string()).min(1, "Selecione pelo menos um canal."),
});

export type ActionResult<T = undefined> =
    | { success: true; data?: T }
    | { success: false; error: string };

/**
 * Publishes the experiment-start command that opens the worker's buffer for a
 * device. Without this the worker keeps fanning out live values over MQTT but
 * never flushes anything to InfluxDB, so the reactor charts stay empty.
 *
 * Payload shape mirrors app-gui's experiments/actions.ts, which is what the
 * worker's cmd/experiments/+/start handler parses.
 */
async function startContinuousRun(experimentId: string, serialNumber: string, deviceId: string) {
    await publishMQTTMessage(`cmd/experiments/${experimentId}/start`, {
        storageFrequency: 60,
        aggregationStrategy: "AVG",
        anchorTime: Math.floor(Date.now() / 1000),
        departmentId: process.env.DEPARTMENT_ID,
        // Everything resolves to serialNumber, NOT the Prisma cuid. This is
        // deliberate and load-bearing.
        //
        // The worker derives a "db_id" from this map and then uses it for four
        // different things: the ui/live/.../device/{db_id}/sync and /raw topic
        // segments, the device_configs calibration key, the InfluxDB device_id tag,
        // and the deviceId it POSTs back. app-gui maps to the cuid, which means its
        // topics change identity the moment an experiment starts, and differ again
        // after a worker restart when the map is lost and the hardware id is used
        // as a fallback.
        //
        // Mapping to serialNumber makes that fallback a no-op, so one id addresses
        // the device everywhere: MQTT topics, InfluxDB queries, and commands.
        //
        // Only the serial is listed. The worker iterates these keys to push config
        // down to nodes/{key}/config, so adding the Prisma cuid would register a
        // phantom device and publish to a topic no node subscribes to.
        deviceMap: { [serialNumber]: serialNumber },
        deviceSns: { [serialNumber]: serialNumber },
        settings: { liveInterval: 5, dbInterval: 60 },
    });
}

export async function createReactorAction(input: unknown): Promise<ActionResult<{ id: string }>> {
    let user;
    try {
        user = await requireUser();
    } catch {
        return { success: false, error: "Não autenticado." };
    }

    const parsed = createReactorSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    }
    const { name, serialNumber, metrics } = parsed.data;

    // Refuse a sensor set the edge would silently degrade. A pH probe with no
    // temperature channel cannot be Nernst-compensated, so the driver drops it.
    const unmet = unmetRequirements(metrics);
    if (Object.keys(unmet).length > 0) {
        const detail = Object.entries(unmet)
            .map(([metric, deps]) => {
                const label = REACTOR_SCHEMA.find((m) => m.key === metric)?.label ?? metric;
                const depLabels = deps
                    .map((d) => REACTOR_SCHEMA.find((m) => m.key === d)?.label ?? d)
                    .join(", ");
                return `${label} requer ${depLabels}`;
            })
            .join("; ");
        return { success: false, error: `Configuração inválida: ${detail}.` };
    }

    const departmentId = process.env.DEPARTMENT_ID;
    const productSku = process.env.REACTOR_PRODUCT_SKU;
    if (!departmentId || !productSku) {
        return { success: false, error: "DEPARTMENT_ID e REACTOR_PRODUCT_SKU têm de estar definidos." };
    }

    // Device.productId is NOT NULL with a foreign key and this app never creates
    // products, so an existing row has to be resolved up front.
    const product = await prisma.hardwareProduct.findUnique({ where: { sku: productSku } });
    if (!product) {
        return { success: false, error: `Nenhum HardwareProduct com o SKU "${productSku}".` };
    }

    const taken = await prisma.device.findUnique({ where: { serialNumber } });
    if (taken) {
        return { success: false, error: `O número de série "${serialNumber}" já está em uso.` };
    }

    const created = await prisma.$transaction(async (tx) => {
        const project = await tx.project.create({
            data: {
                name,
                departmentId,
                createdById: user.id,
                settings: { metrics },
            },
        });

        const device = await tx.device.create({
            data: {
                name,
                serialNumber,
                // The worker's device-online webhook flips this to ACTIVE on first
                // contact, which is how the UI learns the node is really there.
                status: DeviceStatus.PENDING_CONNECTION,
                productId: product.id,
                departmentId,
                projectId: project.id,
                config: { valveOpen: false },
            },
        });

        const experiment = await tx.experiment.create({
            data: {
                name: CONTINUOUS_RUN,
                projectId: project.id,
                status: ExperimentStatus.RUNNING,
                devices: { connect: { id: device.id } },
            },
        });

        return { project, device, experiment };
    });

    // Outside the transaction: a broker hiccup must not roll back a created reactor.
    // resyncReactorAction re-publishes this if it fails or after a worker restart.
    try {
        await startContinuousRun(created.experiment.id, serialNumber, created.device.id);
    } catch (error) {
        console.error(`[createReactor] Reactor ${created.project.id} created but the edge was not notified:`, error);
    }

    revalidatePath("/reactors");
    return { success: true, data: { id: created.project.id } };
}

/**
 * Re-publishes the experiment-start command for every reactor.
 *
 * The worker holds its experiment buffers in memory only, so after it restarts it
 * has forgotten every device and stops writing to InfluxDB even though the
 * experiments are still RUNNING in Postgres. This is the manual repair.
 */
export async function resyncReactorsAction(): Promise<ActionResult<{ synced: number }>> {
    try {
        await requireUser();
    } catch {
        return { success: false, error: "Não autenticado." };
    }

    // Scoped through the project's department. Unscoped, this would re-announce
    // every RUNNING experiment in the shared database — including app-gui's — and
    // push interval config to devices this app does not own.
    const experiments = await prisma.experiment.findMany({
        where: {
            status: ExperimentStatus.RUNNING,
            project: { departmentId: process.env.DEPARTMENT_ID },
        },
        include: { devices: true },
    });

    let synced = 0;
    for (const experiment of experiments) {
        for (const device of experiment.devices) {
            try {
                await startContinuousRun(experiment.id, device.serialNumber, device.id);
                synced++;
            } catch (error) {
                console.error(`[resync] Failed for device ${device.id}:`, error);
            }
        }
    }

    revalidatePath("/reactors");
    return { success: true, data: { synced } };
}

/**
 * Opens or closes the CO2 electrovalve.
 *
 * Publishes to cmd/devices/{id}/config; the edge worker encrypts it and relays it
 * to nodes/{id}/config. The AES key stays at the edge, so this app never holds it.
 *
 * `open` must be a real boolean — both the worker and the firmware reject anything
 * else rather than coercing truthiness.
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

    // Scoped by department: without it any authenticated user could actuate a
    // device belonging to another tenant by passing its id.
    const device = await prisma.device.findFirst({
        where: { id: deviceId, departmentId: process.env.DEPARTMENT_ID },
    });
    if (!device) return { success: false, error: "Dispositivo não encontrado." };

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

    revalidatePath("/reactors");
    revalidatePath(`/reactors/${device.projectId}`);
    return { success: true };
}
