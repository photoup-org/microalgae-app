/**
 * Provisions one reactor for the local simulator, without going through Auth0.
 *
 * Mirrors createReactorAction so the edge-facing behaviour is identical; it exists
 * only so the telemetry pipeline can be verified from a terminal. Not part of the
 * app, and it deliberately refuses to run against anything but a local broker.
 *
 *   npx tsx --env-file=.env --env-file=.env.local scripts/seed-dev-reactor.ts
 */
import { PrismaClient, DeviceStatus, ExperimentStatus } from "@prisma/client";
import mqtt from "mqtt";

const prisma = new PrismaClient();

const SERIAL = process.env.SEED_SERIAL ?? "cmp4f4kbq0007ycsxa1w2n3r5";
const NAME = process.env.SEED_NAME ?? "Reator de teste";
const METRICS = ["ph", "temp", "turbidity", "co2"];

function publish(topic: string, payload: unknown): Promise<void> {
    const url = process.env.MQTT_CONNECTION_URL!;
    if (!/localhost|127\.0\.0\.1/.test(url)) {
        throw new Error(`Refusing to seed against a non-local broker: ${url}`);
    }

    return new Promise((resolve, reject) => {
        const client = mqtt.connect(url);
        const timer = setTimeout(() => {
            client.end(true);
            reject(new Error("MQTT timeout"));
        }, 5000);

        client.on("connect", () => {
            client.publish(topic, JSON.stringify(payload), (err) => {
                clearTimeout(timer);
                if (err) {
                    client.end(true);
                    reject(err);
                    return;
                }
                // Graceful close: a forced end drops the QoS 0 packet before it
                // reaches the broker. See lib/core/mqtt.ts.
                client.end(false, {}, () => resolve());
            });
        });
        client.on("error", (err) => {
            clearTimeout(timer);
            client.end(true);
            reject(err);
        });
    });
}

async function main() {
    const departmentId = process.env.DEPARTMENT_ID!;
    const sku = process.env.REACTOR_PRODUCT_SKU!;

    const product = await prisma.hardwareProduct.findUnique({ where: { sku } });
    if (!product) throw new Error(`No HardwareProduct with sku ${sku}`);

    const user = await prisma.user.findFirst({ where: { departmentId } });
    if (!user) throw new Error(`No user in department ${departmentId}`);

    const existing = await prisma.device.findUnique({
        where: { serialNumber: SERIAL },
        include: { project: { include: { experiments: true } } },
    });

    let deviceId: string;
    let experimentId: string;

    if (existing?.project) {
        deviceId = existing.id;
        experimentId = existing.project.experiments[0]?.id ?? "";
        console.log(`Reusing reactor "${existing.project.name}" (${existing.project.id})`);
    } else {
        if (existing) throw new Error(`Device ${SERIAL} exists but has no project; clean it up first.`);

        const created = await prisma.$transaction(async (tx) => {
            const project = await tx.project.create({
                data: { name: NAME, departmentId, createdById: user.id, settings: { metrics: METRICS } },
            });
            const device = await tx.device.create({
                data: {
                    name: NAME,
                    serialNumber: SERIAL,
                    status: DeviceStatus.PENDING_CONNECTION,
                    productId: product.id,
                    departmentId,
                    projectId: project.id,
                    config: { valveOpen: false },
                },
            });
            const experiment = await tx.experiment.create({
                data: {
                    name: "continuous",
                    projectId: project.id,
                    status: ExperimentStatus.RUNNING,
                    devices: { connect: { id: device.id } },
                },
            });
            return { project, device, experiment };
        });

        deviceId = created.device.id;
        experimentId = created.experiment.id;
        console.log(`Created reactor "${NAME}" -> project ${created.project.id}, device ${deviceId}`);
    }

    // Same payload as startContinuousRun: every id resolves to serialNumber.
    await publish(`cmd/experiments/${experimentId}/start`, {
        storageFrequency: 60,
        aggregationStrategy: "AVG",
        anchorTime: Math.floor(Date.now() / 1000),
        departmentId,
        deviceMap: { [SERIAL]: SERIAL },
        deviceSns: { [SERIAL]: SERIAL },
        settings: { liveInterval: 5, dbInterval: 60 },
    });

    console.log(`Published cmd/experiments/${experimentId}/start`);
    console.log(`Serial ${SERIAL} is now the identity used for MQTT topics and InfluxDB.`);
}

main()
    .catch((e) => {
        console.error(e.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
