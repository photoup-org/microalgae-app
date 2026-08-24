import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/core/prisma";
import { isEdgeAuthorized } from "@/lib/core/edge-auth";

/**
 * Records the firmware version a node reports on nodes/{id}/metadata.
 *
 * The worker already reads that topic to decide which nodes an OTA rollout should
 * skip, but it kept the answer in memory, and device_registrar.handle_metadata
 * returns early for a device it already knows - so after the first registration a
 * version change was invisible to the cloud, including the one an OTA had just
 * produced.
 *
 * Under api/edge, which proxy.ts already excludes from the session gate: the
 * worker has a bearer token and no cookie. Same shape as api/edge/resync.
 *
 * `deviceId` on the wire is the hardware id (serialNumber), never the Prisma cuid
 * - see the note in app/api/system-logs. An unknown device is not an error worth
 * shouting about: it means metadata arrived before registration finished, and the
 * node republishes on every reconnect.
 */
const bodySchema = z.object({
    deviceId: z.string().trim().min(1).max(64),
    firmwareVersion: z.string().trim().min(1).max(32),
});

export async function POST(req: NextRequest) {
    if (!isEdgeAuthorized(req.headers.get("authorization"))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const departmentId = process.env.DEPARTMENT_ID;
    if (!departmentId) {
        throw new Error("DEPARTMENT_ID must be set.");
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    const { deviceId, firmwareVersion } = parsed.data;

    const { count } = await prisma.device.updateMany({
        where: { serialNumber: deviceId, departmentId },
        data: { firmwareVersion, firmwareReportedAt: new Date() },
    });

    if (count === 0) {
        console.warn(`[firmware] No device matched ${deviceId}; ignoring.`);
        return NextResponse.json({ success: true, matched: false });
    }

    return NextResponse.json({ success: true, matched: true });
}
