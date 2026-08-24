import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { isEdgeAuthorized } from "@/lib/core/edge-auth";
import { refreshMirror } from "@/lib/services/mirror";
import { drain, pendingCount } from "@/lib/services/outbox";

/**
 * Reconciles the LAN instance with the cloud. Meant to be called on a schedule
 * from the Pi.
 *
 * Order is the whole point and must not be swapped: drain the outbox first, then
 * refresh the replica. `refreshMirror` is a full delete-and-insert, so refreshing
 * with entries still pending would erase the local rows those entries describe and
 * replace them with cloud rows that have never heard of them — losing exactly the
 * offline work this machinery exists to protect. If the drain does not finish, the
 * refresh is skipped entirely rather than run on a partial result.
 *
 * Deliberately does NOT use the shared `prisma` export. That one falls back to the
 * replica when the cloud is unreachable, so a drain through it would push the
 * replica's rows back into the replica and mark them applied without the cloud ever
 * seeing them.
 *
 * Authenticated with EDGE_WEBHOOK_SECRET rather than a session: it is called by a
 * scheduler, not a person. Excluded from the proxy matcher for the same reason.
 */
export async function POST(req: NextRequest) {
    if (!isEdgeAuthorized(req.headers.get("authorization"))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const localUrl = process.env.MIRROR_DATABASE_URL;
    if (!localUrl) {
        return NextResponse.json({ error: "MIRROR_DATABASE_URL is not set." }, { status: 501 });
    }
    const cloudUrl = process.env.DATABASE_URL;
    if (!cloudUrl) {
        return NextResponse.json({ error: "DATABASE_URL is not set." }, { status: 500 });
    }

    // The realistic disaster is a copy-pasted env var. refreshMirror opens with
    // deleteMany() on seven tables, so pointing both at the authoritative database
    // would erase production. refreshMirror carries its own check against the live
    // connections for the case where two different URLs reach one database; this
    // one is deterministic and costs nothing.
    if (cloudUrl === localUrl) {
        console.error("[sync] DATABASE_URL and MIRROR_DATABASE_URL are identical. Refusing to run.");
        return NextResponse.json(
            { error: "DATABASE_URL and MIRROR_DATABASE_URL point at the same database." },
            { status: 500 }
        );
    }

    const cloud = new PrismaClient({ datasources: { db: { url: cloudUrl } } });
    const local = new PrismaClient({ datasources: { db: { url: localUrl } } });

    try {
        const drainResult = await drain(local, cloud);
        const stillPending = await pendingCount(local);

        if (stillPending > 0) {
            console.error(`[sync] ${stillPending} entry(ies) still pending; skipping the replica refresh.`);
            return NextResponse.json(
                { success: false, ...drainResult, pending: stillPending, refreshed: false },
                { status: 409 }
            );
        }

        const refresh = await refreshMirror(cloud, local);
        console.log(`[sync] Drained ${drainResult.drained}, refreshed at ${refresh.syncedAt.toISOString()}.`);
        return NextResponse.json({ success: true, ...drainResult, refreshed: true, ...refresh });
    } catch (error) {
        // The expected failure is the cloud being unreachable, which is not an
        // incident - it is the situation all of this exists for. The replica and
        // the outbox both stay exactly as they were.
        console.error("[sync] Failed:", error);
        return NextResponse.json({ error: "Sync failed." }, { status: 502 });
    } finally {
        await Promise.all([cloud.$disconnect(), local.$disconnect()]);
    }
}
