"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ExperimentStatus, DeviceStatus } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { publishMQTTMessage } from "@/lib/core/mqtt";
import { requireUser } from "@/lib/core/auth/user";
import type { ActionResult } from "@/lib/action-result";

/**
 * Publishes the command that opens the worker's in-memory buffer for a set of
 * devices, which is what makes it start flushing telemetry to InfluxDB - confirmed
 * during testing that nothing is persisted without this, even though the live
 * MQTT fan-out works regardless.
 *
 * Every id in the map resolves to serialNumber, never the Prisma cuid - see the
 * long comment this was ported from (previously in actions/reactors.ts) for why:
 * the worker derives a "db_id" from these keys and uses it for the live topic
 * segments, the calibration/config key, and the InfluxDB device_id tag. Mapping
 * to the wire id keeps all of those addressable by one identity.
 */
async function publishExperimentStart(experimentId: string, serialNumbers: string[], deviceLimits?: Record<string, Record<string, number>>) {
    const deviceMap = Object.fromEntries(serialNumbers.map((sn) => [sn, sn]));
    await publishMQTTMessage(`cmd/experiments/${experimentId}/start`, {
        storageFrequency: 60,
        aggregationStrategy: "AVG",
        anchorTime: Math.floor(Date.now() / 1000),
        departmentId: process.env.DEPARTMENT_ID,
        deviceMap,
        deviceSns: deviceMap,
        // `devices` here is what the edge worker's threshold-breach check reads
        // (device_buffer.py: `{metric}Min`/`{metric}Max` per serialNumber) - without
        // it the check silently no-ops, since an empty dict has no keys to breach.
        settings: { liveInterval: 5, dbInterval: 60, devices: deviceLimits ?? {} },
    });
}

const limitSchema = z.object({ min: z.number().optional(), max: z.number().optional() });

const createExperimentSchema = z.object({
    name: z.string().trim().min(1, "O nome é obrigatório.").max(80),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional().nullable(),
    deviceIds: z.array(z.string()).min(1, "Selecione pelo menos um dispositivo."),
    /** Keyed by deviceId, then by REACTOR_SCHEMA metric key (ph/temp/turbidity/co2). */
    limits: z.record(z.string(), z.record(z.string(), limitSchema)).optional(),
});

export async function createExperimentAction(projectId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
    try {
        await requireUser();
    } catch {
        return { success: false, error: "Não autenticado." };
    }

    const parsed = createExperimentSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    }
    const { name, startDate, endDate, deviceIds, limits } = parsed.data;

    const project = await prisma.project.findFirst({
        where: { id: projectId, departmentId: process.env.DEPARTMENT_ID },
    });
    if (!project) return { success: false, error: "Projeto não encontrado." };

    // Only devices in this project's own pool, that aren't already tied up in
    // another non-terminal experiment.
    const devices = await prisma.device.findMany({
        where: { id: { in: deviceIds }, projectId },
        include: { experiments: { where: { status: { in: ["PLANNED", "RUNNING", "PAUSED"] } } } },
    });
    if (devices.length !== deviceIds.length) {
        return { success: false, error: "Um ou mais dispositivos não pertencem a este projeto." };
    }
    const offline = devices.filter((d) => d.status !== DeviceStatus.ACTIVE);
    if (offline.length > 0) {
        return { success: false, error: `Dispositivos offline ou em manutenção: ${offline.map((d) => d.name).join(", ")}.` };
    }
    const allocated = devices.filter((d) => d.experiments.length > 0);
    if (allocated.length > 0) {
        return { success: false, error: `Dispositivos já alocados a outra experiência: ${allocated.map((d) => d.name).join(", ")}.` };
    }

    // Flatten {deviceId: {metric: {min,max}}} into the {serialNumber: {metricMin,
    // metricMax}} shape the edge worker's threshold check reads. See publishExperimentStart.
    const settingsDevices: Record<string, Record<string, number>> = {};
    for (const device of devices) {
        const deviceLimits = limits?.[device.id];
        if (!deviceLimits) continue;
        const flat: Record<string, number> = {};
        for (const [metric, { min, max }] of Object.entries(deviceLimits)) {
            if (min !== undefined) flat[`${metric}Min`] = min;
            if (max !== undefined) flat[`${metric}Max`] = max;
        }
        if (Object.keys(flat).length > 0) settingsDevices[device.serialNumber] = flat;
    }

    const experiment = await prisma.experiment.create({
        data: {
            projectId,
            name,
            startDate,
            endDate: endDate ?? undefined,
            status: ExperimentStatus.PLANNED,
            devices: { connect: deviceIds.map((id) => ({ id })) },
            settings: Object.keys(settingsDevices).length > 0 ? { devices: settingsDevices } : undefined,
        },
    });

    revalidatePath(`/projects/${projectId}`);
    return { success: true, data: { id: experiment.id } };
}

/**
 * Advances an experiment's status and its time-accounting fields.
 *
 * `startDate` is user-chosen at creation and never rewritten. `lastRunAt` is the
 * wall-clock anchor of the CURRENT run segment (null while not running).
 * `accumulatedSeconds` is the sum of all finished run segments, so live elapsed
 * time is always `accumulatedSeconds + (lastRunAt ? now - lastRunAt : 0)`.
 * `endDate` is set once, server-side, when the experiment reaches COMPLETED.
 *
 * Ported from app-gui's updateExperimentLifecycle logic (the same fields, same
 * transitions), re-scoped to this app's single department.
 */
export async function updateExperimentLifecycleAction(
    experimentId: string,
    newStatus: ExperimentStatus
): Promise<ActionResult> {
    try {
        await requireUser();
    } catch {
        return { success: false, error: "Não autenticado." };
    }

    const experiment = await prisma.experiment.findFirst({
        where: { id: experimentId, project: { departmentId: process.env.DEPARTMENT_ID } },
        include: { devices: true },
    });
    if (!experiment) return { success: false, error: "Experiência não encontrada." };

    if (newStatus === ExperimentStatus.RUNNING) {
        const offline = experiment.devices.filter((d) => d.status !== DeviceStatus.ACTIVE);
        if (offline.length > 0) {
            return { success: false, error: `Dispositivos offline: ${offline.map((d) => d.name).join(", ")}.` };
        }
    }

    const now = new Date();
    const current = experiment.status;
    const data: {
        status: ExperimentStatus;
        lastRunAt?: Date | null;
        accumulatedSeconds?: { increment: number };
        endDate?: Date;
    } = { status: newStatus };

    if ((current === ExperimentStatus.PLANNED || current === ExperimentStatus.PAUSED) && newStatus === ExperimentStatus.RUNNING) {
        data.lastRunAt = now;
    }
    if (current === ExperimentStatus.RUNNING && (newStatus === ExperimentStatus.PAUSED || newStatus === ExperimentStatus.COMPLETED)) {
        const elapsed = experiment.lastRunAt ? Math.floor((now.getTime() - experiment.lastRunAt.getTime()) / 1000) : 0;
        data.accumulatedSeconds = { increment: elapsed };
        data.lastRunAt = null;
    }
    if (newStatus === ExperimentStatus.COMPLETED) {
        data.endDate = now;
        data.lastRunAt = null;
    }

    await prisma.experiment.update({ where: { id: experimentId }, data });

    try {
        if (newStatus === ExperimentStatus.RUNNING) {
            const settings = (experiment.settings ?? {}) as { devices?: Record<string, Record<string, number>> };
            await publishExperimentStart(experimentId, experiment.devices.map((d) => d.serialNumber), settings.devices);
        } else if (newStatus === ExperimentStatus.PAUSED || newStatus === ExperimentStatus.COMPLETED) {
            await publishMQTTMessage(`cmd/experiments/${experimentId}/flush`, {});
        }
    } catch (error) {
        console.error(`[experimentLifecycle] Status updated but the edge was not notified for ${experimentId}:`, error);
    }

    revalidatePath(`/projects/${experiment.projectId}`);
    revalidatePath(`/projects/${experiment.projectId}/experiments/${experimentId}`);
    return { success: true };
}

export async function deleteExperimentAction(experimentId: string): Promise<ActionResult> {
    try {
        await requireUser();
    } catch {
        return { success: false, error: "Não autenticado." };
    }

    const experiment = await prisma.experiment.findFirst({
        where: { id: experimentId, project: { departmentId: process.env.DEPARTMENT_ID } },
    });
    if (!experiment) return { success: false, error: "Experiência não encontrada." };
    if (experiment.status === ExperimentStatus.RUNNING || experiment.status === ExperimentStatus.PAUSED) {
        return { success: false, error: "Termine a experiência antes de a eliminar." };
    }

    await prisma.experiment.delete({ where: { id: experimentId } });
    revalidatePath(`/projects/${experiment.projectId}`);
    return { success: true };
}

/**
 * Re-publishes the start command for every RUNNING experiment in this department.
 *
 * The worker holds its experiment buffers in memory only, so after it restarts it
 * has forgotten every device and stops writing to InfluxDB even though the
 * experiments are still RUNNING in Postgres. This is the manual repair. Scoped by
 * department - unscoped, this would re-announce every RUNNING experiment in the
 * shared database, including app-gui's, and push config to devices this app does
 * not own.
 */
export async function resyncExperimentsAction(): Promise<ActionResult<{ synced: number }>> {
    try {
        await requireUser();
    } catch {
        return { success: false, error: "Não autenticado." };
    }

    const experiments = await prisma.experiment.findMany({
        where: {
            status: ExperimentStatus.RUNNING,
            project: { departmentId: process.env.DEPARTMENT_ID },
        },
        include: { devices: true },
    });

    let synced = 0;
    for (const experiment of experiments) {
        try {
            const settings = (experiment.settings ?? {}) as { devices?: Record<string, Record<string, number>> };
            await publishExperimentStart(experiment.id, experiment.devices.map((d) => d.serialNumber), settings.devices);
            synced++;
        } catch (error) {
            console.error(`[resync] Failed for experiment ${experiment.id}:`, error);
        }
    }

    revalidatePath("/projects");
    return { success: true, data: { synced } };
}
