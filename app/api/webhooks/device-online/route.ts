import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { DeviceStatus } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { isEdgeAuthorized } from "@/lib/core/edge-auth";

/**
 * Called by the edge worker the first time it sees a device.
 *
 * This route is load-bearing: the worker refuses to process ANY telemetry from a
 * device until this returns 200, and only then records it as known. If this 404s,
 * that reactor stays dark. See core/processor.py.
 *
 * Reached without a session cookie, so proxy.ts excludes api/webhooks from its
 * matcher and authentication is the shared bearer token instead.
 */
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

        // The worker sends whatever id was on the wire. We provision Device.serialNumber
        // to equal that id, but match on either column so a db id also resolves.
        const idStr = String(deviceId);
        const device = await prisma.device.findFirst({
            where: { OR: [{ serialNumber: idStr }, { id: idStr }] },
        });

        if (!device) {
            console.warn(
                `[device-online] No device matches hardware id ${idStr}. ` +
                `Telemetry stays blocked until a reactor is provisioned with this serial number.`
            );
            return NextResponse.json({ error: "Device not found" }, { status: 404 });
        }

        if (device.status === DeviceStatus.PENDING_CONNECTION) {
            await prisma.device.update({
                where: { id: device.id },
                data: { status: DeviceStatus.ACTIVE },
            });
            console.log(`[device-online] ${idStr}: PENDING_CONNECTION -> ACTIVE`);

            revalidatePath("/reactors");
            return NextResponse.json({ success: true, updated: true });
        }

        return NextResponse.json({ success: true, updated: false });
    } catch (error) {
        console.error("[device-online] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
