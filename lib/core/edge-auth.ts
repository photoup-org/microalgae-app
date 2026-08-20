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
