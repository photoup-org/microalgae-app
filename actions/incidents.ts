"use server";

import { revalidatePath } from "next/cache";
import { LogLevel } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { requireUser } from "@/lib/core/auth/user";
import type { ActionResult } from "@/lib/action-result";

/**
 * Marks one incident as handled.
 *
 * Acknowledging is what closes a deduplication group: ingest only folds a repeat
 * into a row nobody has acknowledged yet (app/api/system-logs), so the next
 * occurrence after this opens a fresh row. That is the intended meaning - "I have
 * dealt with this; tell me again if it comes back" - and it is why acknowledging
 * is not the same as dismissing.
 *
 * INFO rows are history, never a condition, so they are not acknowledgeable.
 */
export async function acknowledgeIncidentAction(logId: string): Promise<ActionResult> {
    let user;
    try {
        user = await requireUser();
    } catch {
        return { success: false, error: "Não autenticado." };
    }

    // updateMany, not update: it takes the department and level guards in the same
    // statement, so a log belonging to another department cannot be acknowledged
    // from here even with a valid session.
    const { count } = await prisma.systemLog.updateMany({
        where: {
            id: logId,
            departmentId: process.env.DEPARTMENT_ID,
            level: { not: LogLevel.INFO },
            acknowledgedAt: null,
        },
        data: {
            acknowledgedAt: new Date(),
            acknowledgedBy: user.name || user.email,
        },
    });

    if (count === 0) {
        return { success: false, error: "Incidente não encontrado ou já reconhecido." };
    }

    revalidatePath("/incidents");
    revalidatePath("/dashboard");
    return { success: true };
}

/**
 * Acknowledges every open incident currently matching the given levels.
 *
 * Exists because the realistic case after a weekend outage is twenty open rows,
 * and clearing them one at a time is the reason people stop using an alert feed at
 * all. Scoped by the same level filter the user is looking at, so it can never
 * silence something off-screen.
 */
export async function acknowledgeAllIncidentsAction(levels: LogLevel[]): Promise<ActionResult<number>> {
    let user;
    try {
        user = await requireUser();
    } catch {
        return { success: false, error: "Não autenticado." };
    }

    const actionable = levels.filter((level) => level !== LogLevel.INFO);
    if (actionable.length === 0) return { success: true, data: 0 };

    const { count } = await prisma.systemLog.updateMany({
        where: {
            departmentId: process.env.DEPARTMENT_ID,
            level: { in: actionable },
            acknowledgedAt: null,
        },
        data: {
            acknowledgedAt: new Date(),
            acknowledgedBy: user.name || user.email,
        },
    });

    revalidatePath("/incidents");
    revalidatePath("/dashboard");
    return { success: true, data: count };
}
