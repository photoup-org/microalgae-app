import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { isEdgeAuthorized } from "@/lib/core/edge-auth";
import { refreshMirror } from "@/lib/services/mirror";

/**
 * Refreshes the read-only cloud mirror. Meant to be called on a schedule.
 *
 * A pull, not a push: the cloud instance is the side with reliable uptime, and it
 * already holds a connection to the Pi's database over the tailnet. Having the Pi
 * push would mean giving it a schedule of its own and credentials it does not
 * otherwise need.
 *
 * Deliberately does NOT use the shared `prisma` export. That one falls back to the
 * mirror when the primary is unreachable, which here would mean copying the mirror
 * onto itself and stamping it with a fresh timestamp - presenting stale data as
 * newly synced. This needs the real primary or nothing.
 *
 * Authenticated with EDGE_WEBHOOK_SECRET rather than a session: it is called by a
 * scheduler, not a person. Excluded from the proxy matcher for the same reason.
 */
export async function POST(req: NextRequest) {
    if (!isEdgeAuthorized(req.headers.get("authorization"))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const mirrorUrl = process.env.MIRROR_DATABASE_URL;
    if (!mirrorUrl) {
        return NextResponse.json({ error: "MIRROR_DATABASE_URL is not set." }, { status: 501 });
    }
    const primaryUrl = process.env.DATABASE_URL;
    if (!primaryUrl) {
        return NextResponse.json({ error: "DATABASE_URL is not set." }, { status: 500 });
    }

    const primary = new PrismaClient({ datasources: { db: { url: primaryUrl } } });
    const mirror = new PrismaClient({ datasources: { db: { url: mirrorUrl } } });

    try {
        const result = await refreshMirror(primary, mirror);
        console.log(`[mirror] Refreshed at ${result.syncedAt.toISOString()}:`, result.rowCounts);
        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        // The expected failure is the Pi being unreachable, which is not an
        // incident - it is the exact situation the mirror exists for. The previous
        // copy stays in place, with its previous (honest) timestamp.
        console.error("[mirror] Refresh failed:", error);
        return NextResponse.json({ error: "Mirror refresh failed." }, { status: 502 });
    } finally {
        await Promise.all([primary.$disconnect(), mirror.$disconnect()]);
    }
}
