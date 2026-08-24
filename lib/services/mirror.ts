import "server-only";
import { PrismaClient, Prisma } from "@prisma/client";

export interface MirrorResult {
    syncedAt: Date;
    rowCounts: Record<string, number>;
}

/**
 * Refreshes the read-only cloud mirror from the Pi's database.
 *
 * A full copy, not a diff. At this scale (tens of projects, thousands of logs) a
 * changed-since query plus tombstone handling would be more machinery than the
 * whole table is worth, and a full copy cannot drift - every run reconciles
 * everything, including deletes.
 *
 * The Pi is the only writer, always. Nothing here ever writes back, which is what
 * makes this safe where bidirectional sync would not be: there is no second writer
 * to conflict with, so no merge policy to get wrong.
 */
export async function refreshMirror(primary: PrismaClient, mirror: PrismaClient): Promise<MirrorResult> {
    const [products, users, projects, devices, experiments, calibrations, logs] = await Promise.all([
        primary.hardwareProduct.findMany(),
        primary.user.findMany(),
        primary.project.findMany({ include: { devices: { select: { id: true } } } }),
        primary.device.findMany(),
        primary.experiment.findMany({ include: { devices: { select: { id: true } } } }),
        primary.calibrationRecord.findMany(),
        // Logs are the one unbounded table. The mirror exists so someone can check
        // what happened while the Pi is down, and that means recent history - a
        // year of rows would make every sync slower for no added answer.
        primary.systemLog.findMany({ orderBy: { timestamp: "desc" }, take: 2000 }),
    ]);

    // Replace wholesale inside one transaction: readers of the mirror either see
    // the previous complete copy or the new one, never a half-written mixture.
    // Delete order is the reverse of insert order, so no foreign key is ever left
    // dangling mid-transaction.
    await mirror.$transaction([
        mirror.systemLog.deleteMany(),
        mirror.calibrationRecord.deleteMany(),
        mirror.experiment.deleteMany(),
        mirror.project.deleteMany(),
        mirror.device.deleteMany(),
        mirror.user.deleteMany(),
        mirror.hardwareProduct.deleteMany(),

        mirror.hardwareProduct.createMany({ data: products }),
        mirror.user.createMany({ data: users }),
        mirror.project.createMany({
            data: projects.map(({ devices: _d, ...project }) => project) as Prisma.ProjectCreateManyInput[],
        }),
        mirror.device.createMany({ data: devices as Prisma.DeviceCreateManyInput[] }),
        mirror.experiment.createMany({
            data: experiments.map(({ devices: _d, ...experiment }) => experiment) as Prisma.ExperimentCreateManyInput[],
        }),
        mirror.calibrationRecord.createMany({ data: calibrations as Prisma.CalibrationRecordCreateManyInput[] }),
        mirror.systemLog.createMany({ data: logs as Prisma.SystemLogCreateManyInput[] }),
    ]);

    // The implicit many-to-many join tables cannot be written by createMany, so
    // they are connected after both sides exist. Outside the transaction above
    // because connect() needs the rows committed.
    for (const project of projects) {
        if (project.devices.length === 0) continue;
        await mirror.project.update({
            where: { id: project.id },
            data: { devices: { connect: project.devices.map((d) => ({ id: d.id })) } },
        });
    }
    for (const experiment of experiments) {
        if (experiment.devices.length === 0) continue;
        await mirror.experiment.update({
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

    await mirror.mirrorSync.upsert({
        where: { id: "singleton" },
        create: { id: "singleton", syncedAt, rowCounts },
        update: { syncedAt, rowCounts },
    });

    return { syncedAt, rowCounts };
}

/** When the mirror was last refreshed, or null if it never has been. */
export async function mirrorSyncedAt(mirror: PrismaClient): Promise<Date | null> {
    try {
        const row = await mirror.mirrorSync.findUnique({ where: { id: "singleton" } });
        return row?.syncedAt ?? null;
    } catch (error) {
        console.error("[mirror] Could not read the sync marker:", error);
        return null;
    }
}
