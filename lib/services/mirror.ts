import "server-only";
import { PrismaClient, Prisma } from "@prisma/client";

export interface MirrorResult {
    syncedAt: Date;
    rowCounts: Record<string, number>;
}

/**
 * Refreshes the LAN instance's local replica from the authoritative cloud
 * database.
 *
 * Direction matters and is easy to get backwards: the cloud (Neon) is the single
 * writer, and the Pi's Postgres is a read-only copy that exists so the LAN console
 * keeps rendering when the internet is down. Nothing here ever writes toward the
 * cloud - that is the outbox's job, and it must drain BEFORE this runs (see the
 * guard in the caller), because a refresh is a full delete-and-insert and would
 * otherwise discard pending offline writes.
 *
 * A full copy, not a diff. At this scale (tens of projects, thousands of logs) a
 * changed-since query plus tombstone handling would be more machinery than the
 * whole table is worth, and a full copy cannot drift - every run reconciles
 * everything, including deletes.
 */
export async function refreshMirror(cloud: PrismaClient, local: PrismaClient): Promise<MirrorResult> {
    const [products, users, projects, devices, experiments, calibrations, logs] = await Promise.all([
        cloud.hardwareProduct.findMany(),
        cloud.user.findMany(),
        cloud.project.findMany({ include: { devices: { select: { id: true } } } }),
        cloud.device.findMany(),
        cloud.experiment.findMany({ include: { devices: { select: { id: true } } } }),
        cloud.calibrationRecord.findMany(),
        // Logs are the one unbounded table. The replica exists so someone at the
        // reactor can see recent history while the link is down - a year of rows
        // would make every sync slower for no added answer.
        cloud.systemLog.findMany({ orderBy: { timestamp: "desc" }, take: 2000 }),
    ]);

    // Replace wholesale inside one transaction: readers of the replica either see
    // the previous complete copy or the new one, never a half-written mixture.
    // Delete order is the reverse of insert order, so no foreign key is ever left
    // dangling mid-transaction.
    await local.$transaction([
        local.systemLog.deleteMany(),
        local.calibrationRecord.deleteMany(),
        local.experiment.deleteMany(),
        local.project.deleteMany(),
        local.device.deleteMany(),
        local.user.deleteMany(),
        local.hardwareProduct.deleteMany(),

        local.hardwareProduct.createMany({ data: products }),
        local.user.createMany({ data: users }),
        local.project.createMany({
            data: projects.map(({ devices: _d, ...project }) => project) as Prisma.ProjectCreateManyInput[],
        }),
        local.device.createMany({ data: devices as Prisma.DeviceCreateManyInput[] }),
        local.experiment.createMany({
            data: experiments.map(({ devices: _d, ...experiment }) => experiment) as Prisma.ExperimentCreateManyInput[],
        }),
        local.calibrationRecord.createMany({ data: calibrations as Prisma.CalibrationRecordCreateManyInput[] }),
        local.systemLog.createMany({ data: logs as Prisma.SystemLogCreateManyInput[] }),
    ]);

    // The implicit many-to-many join tables cannot be written by createMany, so
    // they are connected after both sides exist. Outside the transaction above
    // because connect() needs the rows committed.
    for (const project of projects) {
        if (project.devices.length === 0) continue;
        await local.project.update({
            where: { id: project.id },
            data: { devices: { connect: project.devices.map((d) => ({ id: d.id })) } },
        });
    }
    for (const experiment of experiments) {
        if (experiment.devices.length === 0) continue;
        await local.experiment.update({
            where: { id: experiment.id },
            data: { devices: { connect: experiment.devices.map((d) => ({ id: d.id })) } },
        });
    }

    const syncedAt = new Date();
    const rowCounts = {
        hardwareProduct: products.length,
        user: users.length,
        project: projects.length,
        device: devices.length,
        experiment: experiments.length,
        calibrationRecord: calibrations.length,
        systemLog: logs.length,
    };

    await local.mirrorSync.upsert({
        where: { id: "singleton" },
        create: { id: "singleton", syncedAt, rowCounts },
        update: { syncedAt, rowCounts },
    });

    return { syncedAt, rowCounts };
}

/** When the local replica was last refreshed, or null if it never has been. */
export async function mirrorSyncedAt(local: PrismaClient): Promise<Date | null> {
    try {
        const row = await local.mirrorSync.findUnique({ where: { id: "singleton" } });
        return row?.syncedAt ?? null;
    } catch (error) {
        console.error("[mirror] Could not read the sync marker:", error);
        return null;
    }
}
