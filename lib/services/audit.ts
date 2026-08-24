import "server-only";
import { LogLevel, LogCategory, Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";

/**
 * Records an irreversible action in the log the operator already reads.
 *
 * Until now nothing in actions/ wrote a SystemLog at all - the only writer was
 * the edge worker through app/api/system-logs. So a project could disappear and
 * leave no trace anywhere: no row, no actor, no time. That is not a theoretical
 * gap, it cost a real investigation that ended in "cannot tell".
 *
 * INFO on purpose. These are facts about the timeline, not conditions anyone must
 * act on, and lib/incident-dedup.ts deliberately never folds INFO - two deletions
 * a week apart are two events, and collapsing them would destroy the very history
 * this exists to keep.
 *
 * Never throws. An audit write that fails must not turn a successful deletion
 * into an error the user retries; the console.error is the fallback record.
 */
export async function recordAudit(input: {
    action: string;
    message: string;
    actor: string;
    category?: LogCategory;
    projectId?: string | null;
    experimentId?: string | null;
    deviceId?: string | null;
    metadata?: Record<string, unknown>;
}): Promise<void> {
    const departmentId = process.env.DEPARTMENT_ID;
    if (!departmentId) {
        console.error("[audit] DEPARTMENT_ID is not set; not recording:", input.action);
        return;
    }

    try {
        await prisma.systemLog.create({
            data: {
                level: LogLevel.INFO,
                category: input.category ?? LogCategory.SYSTEM,
                action: input.action,
                message: input.message,
                departmentId,
                projectId: input.projectId ?? null,
                experimentId: input.experimentId ?? null,
                deviceId: input.deviceId ?? null,
                metadata: { ...(input.metadata ?? {}), actor: input.actor } as Prisma.InputJsonValue,
            },
        });
    } catch (error) {
        console.error(`[audit] Failed to record ${input.action}:`, error);
    }
}
