"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ExperimentStatus, DeviceStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { publishMQTTMessage } from "@/lib/core/mqtt";
import { requireUser } from "@/lib/core/auth/user";
import { getDeviceTelemetry } from "@/lib/db/influx";
import { experimentQueryWindow } from "@/lib/experiment-window";
import type { SensorReading } from "@/lib/types";
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
const DEFAULT_DB_INTERVAL_SECONDS = 60;

/**
 * `liveInterval` is fixed at 1s, not configurable - live/alert-detection telemetry
 * always samples every second. `dbInterval` is the only tunable rate: how often
 * the worker flushes its buffer to InfluxDB (device_buffer.py's storage_frequency,
 * read from settings.dbInterval - see main.py's cmd/experiments/+/start handler).
 * Faster live sampling without a matching storage rate would otherwise silently
 * write every sample to Influx, which is what dbInterval exists to prevent.
 */
async function publishExperimentStart(
    experimentId: string,
    devices: { serialNumber: string; name: string | null }[],
    deviceLimits?: Record<string, Record<string, number>>,
    dbInterval = DEFAULT_DB_INTERVAL_SECONDS
) {
    const deviceMap = Object.fromEntries(devices.map((d) => [d.serialNumber, d.serialNumber]));
    // The worker writes the alert text itself and only knows the names we send
    // here: device_buffer.py falls back to the literal "Dispositivo Desconhecido"
    // for any db_id missing from deviceLabels, which is what every threshold alert
    // read before this. Keyed by serialNumber to match deviceMap's db_id.
    const deviceLabels = Object.fromEntries(
        devices.map((d) => [d.serialNumber, d.name ?? d.serialNumber])
    );
    await publishMQTTMessage(`cmd/experiments/${experimentId}/start`, {
        storageFrequency: dbInterval,
        aggregationStrategy: "AVG",
        anchorTime: Math.floor(Date.now() / 1000),
        departmentId: process.env.DEPARTMENT_ID,
        deviceMap,
        deviceSns: deviceMap,
        deviceLabels,
        deviceNames: deviceLabels,
        // `devices` here is what the edge worker's threshold-breach check reads
        // (device_buffer.py: `{metric}Min`/`{metric}Max` per serialNumber) - without
        // it the check silently no-ops, since an empty dict has no keys to breach.
        settings: { liveInterval: 1, dbInterval, devices: deviceLimits ?? {} },
    });
}

const limitSchema = z.object({ min: z.number().optional(), max: z.number().optional() });

const createExperimentSchema = z.object({
    name: z.string().trim().min(1, "O nome é obrigatório.").max(80),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional().nullable(),
    deviceIds: z.array(z.string()).min(1, "Selecione pelo menos um dispositivo."),
    /** How often (seconds) the edge worker flushes to InfluxDB. Live sampling stays fixed at 1s regardless. */
    dbInterval: z.number().int().min(5, "Mínimo 5 segundos.").max(3600, "Máximo 3600 segundos.").optional(),
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
    const { name, startDate, endDate, deviceIds, dbInterval, limits } = parsed.data;

    const project = await prisma.project.findFirst({
        where: { id: projectId, departmentId: process.env.DEPARTMENT_ID },
    });
    if (!project) return { success: false, error: "Projeto não encontrado." };

    // Only devices in this project's own pool, that aren't already tied up in
    // another non-terminal experiment.
    //
    // Membership is many-to-many now, so `projects: { some: ... }` replaces the old
    // projectId equality - the reactor may also belong to other projects. The
    // allocation check below is deliberately NOT project-scoped: it looks at every
    // non-terminal experiment the device is attached to, anywhere, which is what
    // stops two projects from driving the same reactor at once.
    const devices = await prisma.device.findMany({
        where: { id: { in: deviceIds }, projects: { some: { id: projectId } } },
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

    const settings: { devices?: Record<string, Record<string, number>>; dbInterval?: number } = {};
    if (Object.keys(settingsDevices).length > 0) settings.devices = settingsDevices;
    if (dbInterval !== undefined) settings.dbInterval = dbInterval;

    const experiment = await prisma.experiment.create({
        data: {
            projectId,
            name,
            startDate,
            endDate: endDate ?? undefined,
            status: ExperimentStatus.PLANNED,
            devices: { connect: deviceIds.map((id) => ({ id })) },
            settings: Object.keys(settings).length > 0 ? settings : undefined,
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
            const settings = (experiment.settings ?? {}) as { devices?: Record<string, Record<string, number>>; dbInterval?: number };
            await publishExperimentStart(experimentId, experiment.devices, settings.devices, settings.dbInterval);
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

/**
 * One device's recorded telemetry for one experiment, for the chart's polling.
 *
 * Deliberately NOT a router.refresh(): the chart polls on the experiment's own
 * storage frequency, which can be as low as 5s, and re-rendering the whole route
 * on that cadence would re-run the Prisma reads, the Auth0 session lookup and
 * every sibling panel just to move one line forward. This returns only the series.
 *
 * Reuses experimentQueryWindow so a poll can never read back a differently-scoped
 * window than the initial server render.
 */
export async function getExperimentTelemetryAction(
    experimentId: string,
    serialNumber: string
): Promise<ActionResult<SensorReading[]>> {
    try {
        await requireUser();
    } catch {
        return { success: false, error: "Não autenticado." };
    }

    const experiment = await prisma.experiment.findFirst({
        where: { id: experimentId, project: { departmentId: process.env.DEPARTMENT_ID } },
        include: { devices: { select: { serialNumber: true } } },
    });
    if (!experiment) return { success: false, error: "Experiência não encontrada." };

    // Every exported "use server" function is callable over the action wire
    // protocol regardless of where it is imported, so the device has to be tied to
    // THIS experiment here - the page rendering it is not a substitute check.
    if (!experiment.devices.some((d) => d.serialNumber === serialNumber)) {
        return { success: false, error: "Dispositivo não pertence a esta experiência." };
    }

    const window = experimentQueryWindow(experiment);
    if (!window) return { success: true, data: [] };

    try {
        return { success: true, data: await getDeviceTelemetry(serialNumber, window.start, window.end) };
    } catch (error) {
        console.error(`[experimentTelemetry] InfluxDB read failed for ${serialNumber}:`, error);
        return { success: false, error: "Não foi possível ler a telemetria." };
    }
}

const updateExperimentSchema = z.object({
    name: z.string().trim().min(1, "O nome é obrigatório.").max(80),
    /** Only accepted while PLANNED - see below. */
    dbInterval: z.number().int().min(5, "Mínimo 5 segundos.").max(3600, "Máximo 3600 segundos.").optional(),
});

/**
 * Renames an experiment, and re-sets its storage frequency while it is still
 * PLANNED.
 *
 * dbInterval is deliberately frozen once a run has started: the worker reads it
 * only from the cmd/experiments/{id}/start payload, so editing it mid-run would
 * change what the UI claims without changing what the edge actually does until
 * the next start. Name is safe to change at any point - nothing keys off it.
 */
export async function updateExperimentAction(experimentId: string, input: unknown): Promise<ActionResult> {
    try {
        await requireUser();
    } catch {
        return { success: false, error: "Não autenticado." };
    }

    const parsed = updateExperimentSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    }
    const { name, dbInterval } = parsed.data;

    const experiment = await prisma.experiment.findFirst({
        where: { id: experimentId, project: { departmentId: process.env.DEPARTMENT_ID } },
    });
    if (!experiment) return { success: false, error: "Experiência não encontrada." };

    const settings = (experiment.settings ?? {}) as Record<string, unknown>;
    const nextSettings =
        dbInterval !== undefined && experiment.status === ExperimentStatus.PLANNED
            ? { ...settings, dbInterval }
            : settings;

    await prisma.experiment.update({
        where: { id: experimentId },
        data: { name, settings: nextSettings as Prisma.InputJsonValue },
    });

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
            const settings = (experiment.settings ?? {}) as { devices?: Record<string, Record<string, number>>; dbInterval?: number };
            await publishExperimentStart(experiment.id, experiment.devices, settings.devices, settings.dbInterval);
            synced++;
        } catch (error) {
            console.error(`[resync] Failed for experiment ${experiment.id}:`, error);
        }
    }

    revalidatePath("/projects");
    return { success: true, data: { synced } };
}
