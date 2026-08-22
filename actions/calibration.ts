"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { publishMQTTMessage } from "@/lib/core/mqtt";
import { requireUser } from "@/lib/core/auth/user";
import { SCHEMA_BY_KEY } from "@/lib/reactor-schema";
import type { ActionResult } from "@/lib/action-result";

export interface CalibrationPoint {
    /** Uncalibrated reading, taken from the /raw topic. */
    raw: number;
    /** Known value of the standard the probe is sitting in. */
    reference: number;
}

interface Segment {
    m: number;
    b: number;
    rawBoundary: number | null;
    operator: ">" | "<";
}

/** Days a calibration is considered valid, per metric. */
const VALIDITY_DAYS: Record<string, number> = { ph: 30, turbidity: 90 };

/**
 * Turns captured points into the transform the edge worker applies.
 *
 * Shape must match what device_buffer.add_reading expects: either a flat {m, b}
 * or an ordered list of piecewise segments with a rawBoundary and comparison
 * operator. Ported from app-gui's calibrateDeviceAction unchanged, because the edge
 * side is shared.
 */
function buildTransform(points: CalibrationPoint[]):
    | { ok: true; config: { m: number; b: number } | { segments: Segment[] } }
    | { ok: false; error: string } {
    if (points.length === 1) {
        // Single point can only correct offset; slope is assumed correct.
        return { ok: true, config: { m: 1, b: points[0].reference - points[0].raw } };
    }

    if (points.length < 2) return { ok: false, error: "Pontos de calibração insuficientes." };

    const sorted = [...points].sort((a, b) => a.reference - b.reference);
    const segments: Segment[] = [];

    for (let i = 0; i < sorted.length - 1; i++) {
        const p1 = sorted[i];
        const p2 = sorted[i + 1];
        const deltaRaw = p2.raw - p1.raw;

        if (deltaRaw === 0) {
            return {
                ok: false,
                error: "Dois pontos têm a mesma leitura bruta. Verifique se a sonda estabilizou entre capturas.",
            };
        }

        const m = (p2.reference - p1.reference) / deltaRaw;
        segments.push({
            m,
            b: p1.reference - m * p1.raw,
            // The last segment is open-ended so readings beyond it still map.
            rawBoundary: i === sorted.length - 2 ? null : p2.raw,
            operator: p1.raw > p2.raw ? ">" : "<",
        });
    }

    return { ok: true, config: { segments } };
}

/**
 * Applies a calibration to one metric of one device.
 *
 * Note the calibration is layered on top of the driver's Nernst temperature
 * compensation, which already ran at the edge. That ordering is what makes points
 * captured at one temperature valid at another.
 */
export async function calibrateDeviceAction(
    deviceId: string,
    metric: string,
    points: CalibrationPoint[]
): Promise<ActionResult> {
    let user;
    try {
        user = await requireUser();
    } catch {
        return { success: false, error: "Não autenticado." };
    }

    if (!SCHEMA_BY_KEY[metric]) {
        return { success: false, error: `Métrica desconhecida: ${metric}.` };
    }
    if (!points.every((p) => Number.isFinite(p.raw) && Number.isFinite(p.reference))) {
        return { success: false, error: "Pontos de calibração inválidos." };
    }

    const device = await prisma.device.findFirst({
        where: { id: deviceId, departmentId: process.env.DEPARTMENT_ID },
        include: { projects: { select: { id: true } } },
    });
    if (!device) return { success: false, error: "Dispositivo não encontrado." };

    const transform = buildTransform(points);
    if (!transform.ok) return { success: false, error: transform.error };

    const oldConfig = (device.calibrationConfig ?? {}) as Record<string, unknown>;
    const newConfig = { ...oldConfig, [metric]: transform.config };

    const now = new Date();
    const validUntil = new Date(now);
    validUntil.setDate(now.getDate() + (VALIDITY_DAYS[metric] ?? 30));

    await prisma.device.update({
        where: { id: device.id },
        data: {
            calibrationConfig: newConfig as Prisma.InputJsonObject,
            lastCalibrated: now,
            calibrationDueDate: validUntil,
        },
    });

    await prisma.calibrationRecord.create({
        data: {
            deviceId: device.id,
            userId: user.id,
            timestamp: now,
            calibratedAt: now,
            validUntil,
            metric,
            performedBy: user.name || user.email,
            pointsApplied: points as unknown as Prisma.InputJsonArray,
            oldConfig: (oldConfig[metric] ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            newConfig: transform.config as unknown as Prisma.InputJsonObject,
        },
    });

    try {
        // Addressed by serialNumber to match the db_id the worker derives from
        // deviceMap; see startContinuousRun. The worker keys device_configs by that
        // same id, so a mismatch here silently no-ops the calibration at the edge.
        await publishMQTTMessage(`cmd/devices/${device.serialNumber}/config`, {
            calibrationConfig: newConfig,
        });
    } catch (error) {
        console.error(`[calibrate] Saved but not pushed to the edge for ${device.id}:`, error);
        return {
            success: false,
            error: "Calibração guardada, mas o servidor local não foi contactado. Use Re-sincronizar.",
        };
    }

    revalidatePath(`/devices/${device.id}`);
    // A reactor can sit in several projects now, so every one of them shows stale data.
    for (const project of device.projects) revalidatePath(`/projects/${project.id}`);
    return { success: true };
}
