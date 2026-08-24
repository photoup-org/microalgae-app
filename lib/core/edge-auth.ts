import "server-only";
import { timingSafeEqual } from "crypto";

/**
 * Authenticates the edge worker on routes it calls directly.
 *
 * These routes are excluded from the proxy matcher because the worker has no
 * session cookie, so this shared secret is their only protection. Constant-time
 * comparison, since a plain !== leaks how much of the token matched.
 */
export function isEdgeAuthorized(authHeader: string | null): boolean {
    const secret = process.env.EDGE_WEBHOOK_SECRET;
    if (!secret || !authHeader) return false;

    const expected = Buffer.from(`Bearer ${secret}`);
    const received = Buffer.from(authHeader);

    // timingSafeEqual throws on a length mismatch, so compare lengths first.
    if (expected.length !== received.length) return false;
    return timingSafeEqual(expected, received);
}

/**
 * Authenticates the scheduler that refreshes the local replica.
 *
 * A separate secret from the edge worker's, because the two do unrelated jobs and
 * a replica rebuild is not something the worker has any business triggering.
 *
 * Falls back to EDGE_WEBHOOK_SECRET when unset so an existing deployment keeps
 * syncing until the new value is rolled out - but says so, because a fallback
 * nobody notices is a fallback that becomes permanent.
 */
export function isMirrorSyncAuthorized(authHeader: string | null): boolean {
    const dedicated = process.env.MIRROR_SYNC_SECRET;
    if (!dedicated) {
        console.warn("[mirror] MIRROR_SYNC_SECRET is not set; falling back to EDGE_WEBHOOK_SECRET.");
        return isEdgeAuthorized(authHeader);
    }

    if (!authHeader) return false;

    const expected = Buffer.from(`Bearer ${dedicated}`);
    const received = Buffer.from(authHeader);
    if (expected.length !== received.length) return false;
    return timingSafeEqual(expected, received);
}
