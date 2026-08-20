import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { DeviceStatus } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { isEdgeAuthorized } from "@/lib/core/edge-auth";

/**
 * Called by the edge worker the first time it sees a device.
 *
 * This route is load-bearing and doubles as device discovery: the worker refuses
 * to process ANY telemetry from a device until this returns 200, and only then
 * records it as known (see core/processor.py). Rather than requiring an operator
 * to type a serial number in by hand before hardware exists, an unknown serial is
 * auto-registered here with a placeholder name — it then shows up in "Dispositivos"
 * immediately, and the operator names/configures it from there.
 *
 * Reached without a session cookie, so proxy.ts excludes api/webhooks from its
 * matcher and authentication is the shared bearer token instead.
 */

// Same character class the worker validates device ids against before publishing to them.
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// Fail-safe default control config: mirrors the firmware's own baked-in default
// (manual mode, a conservative max-open time) so a freshly-discovered device is
// never silently unlimited before an operator has configured it.
const DEFAULT_CONFIG = {
    sensors: ["ph", "temp", "turbidity", "co2"],
    valveOpen: false,
    control: { mode: "manual" as const, manual: { maxOpenSeconds: 15 } },
};

export async function POST(req: NextRequest) {
    if (!isEdgeAuthorized(req.headers.get("authorization"))) {
        console.error("[device-online] Unauthorized: missing or mismatched bearer token.");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { deviceId } = await req.json();

        if (deviceId === undefined || deviceId === null) {
            return NextResponse.json({ error: "Missing deviceId" }, { status: 400 });
        }

        const idStr = String(deviceId);
        if (!DEVICE_ID_RE.test(idStr)) {
            return NextResponse.json({ error: "Malformed deviceId" }, { status: 400 });
        }

        const departmentId = process.env.DEPARTMENT_ID;
        const productSku = process.env.REACTOR_PRODUCT_SKU;
        if (!departmentId || !productSku) {
            throw new Error("DEPARTMENT_ID and REACTOR_PRODUCT_SKU must be set.");
        }

        const existing = await prisma.device.findFirst({
            where: { OR: [{ serialNumber: idStr }, { id: idStr }] },
        });

        if (existing) {
            if (existing.status === DeviceStatus.PENDING_CONNECTION) {
                await prisma.device.update({
                    where: { id: existing.id },
                    data: { status: DeviceStatus.ACTIVE },
                });
                console.log(`[device-online] ${idStr}: PENDING_CONNECTION -> ACTIVE`);
                revalidatePath("/devices");
                return NextResponse.json({ success: true, updated: true });
            }
            return NextResponse.json({ success: true, updated: false });
        }

        const product = await prisma.hardwareProduct.findUnique({ where: { sku: productSku } });
        if (!product) {
            // A real configuration problem, not a client error - the worker should retry.
            throw new Error(`No HardwareProduct with sku "${productSku}".`);
        }

        // upsert on the unique serialNumber sidesteps a race between two
        // near-simultaneous first-contact pings for the same device: the worker's
        // own known-device cache isn't volume-mounted, so it resets on every
        // `docker compose down` and can produce bursts of "first contact" retries.
        const created = await prisma.device.upsert({
            where: { serialNumber: idStr },
            update: {},
            create: {
                serialNumber: idStr,
                name: `Novo dispositivo (${idStr.slice(-4)})`,
                status: DeviceStatus.ACTIVE, // it just proved it can talk to the broker
                productId: product.id,
                departmentId,
                config: DEFAULT_CONFIG,
            },
        });
        console.log(`[device-online] Discovered new device ${created.serialNumber}.`);

        revalidatePath("/devices");
        return NextResponse.json({ success: true, updated: true, discovered: true });
    } catch (error) {
        console.error("[device-online] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
