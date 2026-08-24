/**
 * Copies one department's data out of the shared Neon database into this app's
 * own database.
 *
 * Run once, when the reactor database moves onto the Pi. app-gui keeps Neon and is
 * never touched - this only reads from it.
 *
 * Ids are preserved, not regenerated. They appear in InfluxDB tags, in the edge
 * worker's device_map, and in the SQLite first-seen set on the Pi; regenerating
 * them would orphan every existing telemetry series.
 *
 * Idempotent: every insert skips duplicates, so a partial run can be repeated.
 *
 * Usage:
 *   SOURCE_DATABASE_URL=<neon> TARGET_DATABASE_URL=<pi> DEPARTMENT_ID=<id> \
 *     npx tsx scripts/copy-department.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";

const SOURCE_URL = process.env.SOURCE_DATABASE_URL;
const TARGET_URL = process.env.TARGET_DATABASE_URL;
const DEPARTMENT_ID = process.env.DEPARTMENT_ID;

function client(url: string) {
    return new PrismaClient({ datasources: { db: { url } } });
}

/**
 * Prisma reads a null Json column as `null` but will not take one back: createMany
 * wants the Prisma.DbNull sentinel, which is what distinguishes a SQL NULL from a
 * JSON `null` on the way in.
 *
 * The call sites cast the result, because the substitution happens at runtime and
 * the read type still says `JsonValue | null`. The cast asserts what this function
 * has just made true.
 */
function jsonNulls<T extends Record<string, unknown>>(rows: T[], fields: string[]): T[] {
    return rows.map((row) => {
        const copy: Record<string, unknown> = { ...row };
        for (const field of fields) {
            if (copy[field] === null) copy[field] = Prisma.DbNull;
        }
        return copy as T;
    });
}

async function main() {
    if (!SOURCE_URL || !TARGET_URL || !DEPARTMENT_ID) {
        throw new Error("SOURCE_DATABASE_URL, TARGET_DATABASE_URL and DEPARTMENT_ID must all be set.");
    }
    if (SOURCE_URL === TARGET_URL) {
        throw new Error("SOURCE_DATABASE_URL and TARGET_DATABASE_URL are the same database.");
    }

    const source = client(SOURCE_URL);
    const target = client(TARGET_URL);

    try {
        const where = { departmentId: DEPARTMENT_ID };

        // Read everything first, so a failure partway through reading cannot leave
        // the target with half a department written.
        const [users, projects, devices, logs, pushSubscriptions] = await Promise.all([
            source.user.findMany({ where }),
            source.project.findMany({ where, include: { devices: { select: { id: true } } } }),
            source.device.findMany({ where }),
            source.systemLog.findMany({ where }),
            source.pushSubscription.findMany({ where }),
        ]);

        const deviceIds = devices.map((d) => d.id);
        const [experiments, calibrations, products] = await Promise.all([
            source.experiment.findMany({
                where: { project: { departmentId: DEPARTMENT_ID } },
                include: { devices: { select: { id: true } } },
            }),
            source.calibrationRecord.findMany({ where: { deviceId: { in: deviceIds } } }),
            // Products are global, not per-department, but only the ones this
            // department's devices point at are worth carrying over - Device.productId
            // is NOT NULL with a foreign key, so each one must exist before its device.
            source.hardwareProduct.findMany({
                where: { id: { in: [...new Set(devices.map((d) => d.productId))] } },
            }),
        ]);

        console.log(
            `Read: ${products.length} product(s), ${users.length} user(s), ${projects.length} project(s), ` +
                `${devices.length} device(s), ${experiments.length} experiment(s), ` +
                `${calibrations.length} calibration(s), ${logs.length} log(s), ` +
                `${pushSubscriptions.length} push subscription(s).`
        );

        // Insert order follows the foreign keys: products and users before the rows
        // that reference them, projects before experiments, devices before calibrations.
        await target.hardwareProduct.createMany({ data: products, skipDuplicates: true });
        await target.user.createMany({ data: users, skipDuplicates: true });

        await target.project.createMany({
            data: jsonNulls(projects.map(({ devices: _devices, ...project }) => project), [
                "settings",
            ]) as Prisma.ProjectCreateManyInput[],
            skipDuplicates: true,
        });
        await target.device.createMany({
            data: jsonNulls(devices, ["config", "calibrationConfig"]) as Prisma.DeviceCreateManyInput[],
            skipDuplicates: true,
        });
        await target.experiment.createMany({
            data: jsonNulls(experiments.map(({ devices: _devices, ...experiment }) => experiment), [
                "settings",
            ]) as Prisma.ExperimentCreateManyInput[],
            skipDuplicates: true,
        });

        // The two implicit many-to-many join tables have no Prisma model, so they are
        // written by connecting the rows that already exist on both sides.
        for (const project of projects) {
            if (project.devices.length === 0) continue;
            await target.project.update({
                where: { id: project.id },
                data: { devices: { connect: project.devices.map((d) => ({ id: d.id })) } },
            });
        }
        for (const experiment of experiments) {
            if (experiment.devices.length === 0) continue;
            await target.experiment.update({
                where: { id: experiment.id },
                data: { devices: { connect: experiment.devices.map((d) => ({ id: d.id })) } },
            });
        }

        await target.calibrationRecord.createMany({
            data: jsonNulls(calibrations, [
                "pointsApplied",
                "oldConfig",
                "newConfig",
            ]) as Prisma.CalibrationRecordCreateManyInput[],
            skipDuplicates: true,
        });
        await target.systemLog.createMany({
            data: jsonNulls(logs, ["metadata"]) as Prisma.SystemLogCreateManyInput[],
            skipDuplicates: true,
        });
        await target.pushSubscription.createMany({ data: pushSubscriptions, skipDuplicates: true });

        const counts = {
            products: await target.hardwareProduct.count(),
            users: await target.user.count(),
            projects: await target.project.count(),
            devices: await target.device.count(),
            experiments: await target.experiment.count(),
            calibrations: await target.calibrationRecord.count(),
            logs: await target.systemLog.count(),
            pushSubscriptions: await target.pushSubscription.count(),
        };
        console.log("Target now holds:", counts);
    } finally {
        await source.$disconnect();
        await target.$disconnect();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
