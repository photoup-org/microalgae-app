"use server";

import { z } from "zod";
import { prisma } from "@/lib/core/prisma";
import { requireUser } from "@/lib/core/auth/user";
import { sendPushToDepartment } from "@/lib/services/push";
import type { ActionResult } from "@/lib/action-result";

/**
 * Shape of a serialised browser PushSubscription. Validated rather than trusted:
 * these values are written straight into a table the notification sender reads,
 * and the endpoint is a URL this server will later make requests to.
 */
const subscriptionSchema = z.object({
    endpoint: z.string().url().max(1000),
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
