import "server-only";
import { PrismaClient, Prisma } from "@prisma/client";

/**
 * Writes made on the LAN instance while the cloud was unreachable, replayed once
 * it comes back.
 *
 * The entries are recorded as *Prisma operations*, not as server actions: by the
 * time a write fails, the action has already done its validation, its permission
 * check and — crucially — its MQTT publish. The reactor has already been told. All
 * that is left is the database row, so that is all that needs queueing.
 *
 * Replay ordering is by creation time and strictly sequential. Two edits to one
 * device made minutes apart must land in that order, and a parallel drain would
 * not guarantee it.
 */

export interface OutboxOperation {
    model: string;
    operation: string;
    args: unknown;
}

/** Only these operations may be queued. Anything else fails loudly instead. */
const REPLAYABLE = new Set(["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]);

export function isReplayable(operation: string): boolean {
    return REPLAYABLE.has(operation);
}

/**
 * Records one deferred write. Called from the failover path in lib/core/prisma.ts.
 *
 * `action` is `<model>.<operation>` so a drain can dispatch without parsing the
 * payload, and so a stuck entry is legible in the database to a human.
 */
export async function enqueue(local: PrismaClient, op: OutboxOperation): Promise<void> {
    await local.outboxEntry.create({
        data: {
            action: `${op.model}.${op.operation}`,
            payload: (op.args ?? {}) as Prisma.InputJsonValue,
        },
    });
    console.warn(`[outbox] Queued ${op.model}.${op.operation} for replay.`);
}

/** How many writes are waiting. A refresh of the replica must not run while this is non-zero. */
export async function pendingCount(local: PrismaClient): Promise<number> {
    return local.outboxEntry.count({ where: { appliedAt: null } });
}

export interface DrainResult {
    drained: number;
    failed: number;
}

/**
 * Pushes every pending entry to the cloud, oldest first.
 *
 * Stops at the first failure rather than skipping past it. Entries are ordered
 * edits to the same rows, so applying entry 5 after entry 3 failed would build
 * state on a foundation that was never laid.
 *
 * Applied entries are marked, never deleted, so a drain interrupted halfway cannot
 * re-apply what it already pushed. A create replayed twice would violate a primary
 * key; an increment replayed twice would silently double.
 */
export async function drain(local: PrismaClient, cloud: PrismaClient): Promise<DrainResult> {
    const pending = await local.outboxEntry.findMany({
        where: { appliedAt: null },
        orderBy: { createdAt: "asc" },
    });
    if (pending.length === 0) return { drained: 0, failed: 0 };

    console.log(`[outbox] Draining ${pending.length} entry(ies) to the cloud.`);
    let drained = 0;

    for (const entry of pending) {
        const [model, operation] = entry.action.split(".");

        try {
            if (!model || !operation || !isReplayable(operation)) {
                throw new Error(`Not replayable: ${entry.action}`);
            }

            const delegate = (cloud as unknown as Record<string, Record<string, (a: unknown) => unknown>>)[model];
            if (!delegate?.[operation]) throw new Error(`Unknown operation: ${entry.action}`);

            await delegate[operation](entry.payload);
            await local.outboxEntry.update({
                where: { id: entry.id },
                data: { appliedAt: new Date(), lastError: null },
            });
            drained += 1;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await local.outboxEntry.update({ where: { id: entry.id }, data: { lastError: message } });
            console.error(`[outbox] Entry ${entry.id} (${entry.action}) failed; stopping drain:`, message);
            return { drained, failed: pending.length - drained };
        }
    }

    return { drained, failed: 0 };
}
