import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LogLevel, LogCategory, Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { isEdgeAuthorized } from "@/lib/core/edge-auth";

/**
 * SystemLog sink for the edge worker: threshold-breach alerts (device_buffer.py)
 * and hardware online/offline transitions (device_tracker.py). Both derive this
 * URL from the same NEXTJS_API_URL/telemetry base as app/api/telemetry - see that
 * route's comment for why only one app can own it at a time.
 *
 * `id` is generated edge-side and the worker retries up to 3x on failure, so this
 * upserts on it instead of always creating - a retried delivery must not produce
 * duplicate rows.
 *
 * `deviceId` on the wire is the hardware id (serialNumber) - the edge never knows
 * the Prisma cuid (see CLAUDE.md's note on hw_id vs Device.id). But app-gui's real
 * schema has a genuine Postgres FK from SystemLog.deviceId to Device.id, even
 * though this mirror doesn't model it as a relation() - writing the raw serial
 * into that column violates the FK and 500s. Resolve it to the real id first, and
 * degrade to null (never hard-fail the log write) if it doesn't resolve.
 */
const bodySchema = z.object({
    id: z.string().uuid(),
    timestamp: z.coerce.date(),
    level: z.nativeEnum(LogLevel),
    category: z.nativeEnum(LogCategory),
    action: z.string().trim().min(1).max(80),
    message: z.string().trim().min(1).max(2000),
    metadata: z.unknown().optional(),
    deviceId: z.string().max(64).nullish(),
    experimentId: z.string().max(64).nullish(),
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
    const { id, timestamp, level, category, action, message, metadata, deviceId, experimentId } = parsed.data;

    const device = deviceId
        ? await prisma.device.findFirst({ where: { serialNumber: deviceId, departmentId }, select: { id: true } })
        : null;

    await prisma.systemLog.upsert({
        where: { id },
        create: {
            id,
            timestamp,
            level,
            category,
            action,
            message,
            metadata: metadata === undefined ? Prisma.JsonNull : (metadata as Prisma.InputJsonValue),
            // Never trust the caller's own departmentId - this is a shared, edge-authenticated
            // route, not a per-tenant session; the deployment's own env var is the only source of truth.
            departmentId,
            deviceId: device?.id ?? null,
            experimentId: experimentId ?? null,
        },
        update: {},
    });

    return NextResponse.json({ success: true }, { status: 201 });
}
