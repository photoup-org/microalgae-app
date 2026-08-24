"use server";

import { z } from "zod";
import { prisma } from "@/lib/core/prisma";
import { requireUser } from "@/lib/core/auth/user";
import { sendPushToDepartment } from "@/lib/services/push";
import type { ActionResult } from "@/lib/action-result";

/**
 * The hosts a browser push endpoint is allowed to live on.
 *
 * Without this the endpoint is a server-side request forgery hole: it is a URL,
 * supplied by whoever is signed in, that this server will later POST to on a
 * schedule of the attacker's choosing. Pointed at 169.254.169.254 or an address
 * inside the tailnet it becomes a probe of the network the app runs in - and one
 * that survives in the database until someone notices it.
 *
 * An allowlist rather than a private-IP blocklist, because the set of legitimate
 * values here is tiny and known: there are only a handful of push services in the
 * world, and a subscription pointing anywhere else is not a subscription.
 */
const PUSH_HOSTS = [
    "fcm.googleapis.com",
    "android.googleapis.com",
    "updates.push.services.mozilla.com",
    "web.push.apple.com",
];
const PUSH_HOST_SUFFIXES = [".push.services.mozilla.com", ".notify.windows.com"];

function isAllowedPushEndpoint(raw: string): boolean {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return false;
    }

    // https only: the payload is encrypted, but the endpoint itself identifies a
    // device and must not travel in clear text.
    if (url.protocol !== "https:") return false;
    // A port or credentials in a push endpoint means someone is aiming it
    // somewhere it does not belong.
    if (url.port !== "" || url.username !== "" || url.password !== "") return false;

    const host = url.hostname.toLowerCase();
    return PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * Shape of a serialised browser PushSubscription. Validated rather than trusted:
 * these values are written straight into a table the notification sender reads,
 * and the endpoint is a URL this server will later make requests to.
 */
const subscriptionSchema = z.object({
    endpoint: z.string().url().max(1000).refine(isAllowedPushEndpoint, {
        message: "Endpoint de notificações não reconhecido.",
    }),
    keys: z.object({
        p256dh: z.string().min(1).max(200),
        auth: z.string().min(1).max(200),
    }),
});

export async function subscribeToPushAction(
    subscription: unknown,
    userAgent?: string
): Promise<ActionResult> {
    let user;
    try {
        user = await requireUser();
    } catch {
        return { success: false, error: "Não autenticado." };
    }

    const parsed = subscriptionSchema.safeParse(subscription);
    if (!parsed.success) {
        return { success: false, error: "Subscrição inválida." };
    }

    const departmentId = process.env.DEPARTMENT_ID;
    if (!departmentId) {
        return { success: false, error: "DEPARTMENT_ID não está definido." };
    }

    const { endpoint, keys } = parsed.data;

    // Upsert on endpoint: a browser that re-subscribes (permission re-granted, keys
    // rotated) must replace its row, not add a second one that would deliver the
    // same alert twice to the same device.
    await prisma.pushSubscription.upsert({
        where: { endpoint },
        create: {
            endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth,
            departmentId,
            userId: user.id,
            userAgent: userAgent?.slice(0, 300) ?? null,
        },
        update: {
            p256dh: keys.p256dh,
            auth: keys.auth,
            userId: user.id,
            userAgent: userAgent?.slice(0, 300) ?? null,
        },
    });

    return { success: true };
}

export async function unsubscribeFromPushAction(endpoint: string): Promise<ActionResult> {
    try {
        await requireUser();
    } catch {
        return { success: false, error: "Não autenticado." };
    }

    // Scoped by department as well as endpoint: without it, any signed-in user
    // could delete a subscription belonging to another deployment sharing this
    // database.
    await prisma.pushSubscription.deleteMany({
        where: { endpoint, departmentId: process.env.DEPARTMENT_ID },
    });

    return { success: true };
}

/**
 * Sends a test notification to every subscribed browser in this department.
 *
 * Worth having as a first-class action rather than a debug script: the failure
 * mode of push is silence, and the only way to know the chain works is to make it
 * fire on demand.
 */
export async function sendTestPushAction(): Promise<ActionResult<number>> {
    try {
        await requireUser();
    } catch {
        return { success: false, error: "Não autenticado." };
    }

    const departmentId = process.env.DEPARTMENT_ID;
    if (!departmentId) {
        return { success: false, error: "DEPARTMENT_ID não está definido." };
    }

    const delivered = await sendPushToDepartment(departmentId, {
        title: "Teste de notificação",
        body: "As notificações estão a funcionar. Um alerta crítico chegará assim.",
        url: "/incidents",
    });

    return { success: true, data: delivered };
}
