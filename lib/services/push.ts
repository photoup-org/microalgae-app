import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/core/prisma";

export interface PushPayload {
    title: string;
    body: string;
    /** Collapses repeats of one condition into a single notification. */
    tag?: string;
    /** Where a click lands. Defaults to /incidents in the service worker. */
    url?: string;
    requireInteraction?: boolean;
}

let configured = false;

/**
 * Returns false when the deployment has no VAPID keys, so every caller can treat
 * push as optional rather than crashing an ingest path over a missing env var.
 */
function ensureConfigured(): boolean {
    if (configured) return true;

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) return false;

    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", publicKey, privateKey);
    configured = true;
    return true;
}

/**
 * Fans one notification out to every browser subscribed for this department.
 *
 * Never throws. It is called from the edge worker's log ingest, and a push
 * service being slow or a subscription being stale must not fail the write that
 * recorded the incident - the row in Postgres is the record, the notification is
 * only the courier.
 *
 * A 404 or 410 means the browser discarded the subscription (permission revoked,
 * app uninstalled, endpoint rotated). That is the only reliable signal we get,
 * so it is what prunes the table.
 */
export async function sendPushToDepartment(departmentId: string, payload: PushPayload): Promise<number> {
    if (!ensureConfigured()) {
        console.warn("[push] VAPID keys are not set; skipping notification.");
        return 0;
    }

    const subscriptions = await prisma.pushSubscription.findMany({
        where: { departmentId },
        select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    if (subscriptions.length === 0) return 0;

    const body = JSON.stringify(payload);
    const expired: string[] = [];
    let delivered = 0;

    await Promise.all(
        subscriptions.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    body
                );
                delivered += 1;
            } catch (error) {
                const status = (error as { statusCode?: number }).statusCode;
                if (status === 404 || status === 410) {
                    expired.push(sub.id);
                } else {
                    console.error(`[push] Delivery failed (${status ?? "no status"}):`, error);
                }
            }
        })
    );

    if (expired.length > 0) {
        await prisma.pushSubscription.deleteMany({ where: { id: { in: expired } } });
        console.log(`[push] Pruned ${expired.length} expired subscription(s).`);
    }

    if (delivered > 0) {
        await prisma.pushSubscription.updateMany({
            where: { departmentId, id: { notIn: expired } },
            data: { lastUsedAt: new Date() },
        });
    }

    return delivered;
}
