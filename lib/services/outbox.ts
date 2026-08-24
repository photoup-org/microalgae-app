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

/**
 * Models an entry may target. `drain` looks the delegate up by name on the client,
 * so without this an `action` string could reach any property on it. Nothing can
 * write these rows but this app, which makes it defence in depth rather than a
 * control - but the cost is one array.
 */
const REPLAYABLE_MODELS = new Set([
    "user",
    "project",
    "experiment",
    "device",
    "calibrationRecord",
    "systemLog",
    "pushSubscription",
]);

export function isReplayable(operation: string): boolean {
    return REPLAYABLE.has(operation);
}

/**
 * Prisma's null sentinels do not survive a JSON round trip.
 *
 * `Prisma.JsonNull` and `Prisma.DbNull` both stringify to `{}`, so a queued write
 * that meant "this JSON column is null" would replay as an empty object instead -
 * silently, and only for rows written while offline. These two functions swap the
 * sentinels for a marker on the way in and restore them on the way out.
 */
const NULL_MARKER = "__prismaNull";

function encodeSentinels(value: unknown): unknown {
    if (value === Prisma.JsonNull) return { [NULL_MARKER]: "JsonNull" };
    if (value === Prisma.DbNull) return { [NULL_MARKER]: "DbNull" };
    if (value === Prisma.AnyNull) return { [NULL_MARKER]: "AnyNull" };
    if (Array.isArray(value)) return value.map(encodeSentinels);
    if (value && typeof value === "object" && !(value instanceof Date)) {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encodeSentinels(v)]));
    }
    return value;
}

function decodeSentinels(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(decodeSentinels);
    if (value && typeof value === "object") {
        const marker = (value as Record<string, unknown>)[NULL_MARKER];
        if (marker === "JsonNull") return Prisma.JsonNull;
        if (marker === "DbNull") return Prisma.DbNull;
        if (marker === "AnyNull") return Prisma.AnyNull;
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decodeSentinels(v)]));
    }
    return value;
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
            payload: encodeSentinels(op.args ?? {}) as Prisma.InputJsonValue,
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
            if (!model || !operation || !isReplayable(operation) || !REPLAYABLE_MODELS.has(model)) {
                throw new Error(`Not replayable: ${entry.action}`);
            }

            const delegate = (cloud as unknown as Record<string, Record<string, (a: unknown) => unknown>>)[model];
            if (!delegate?.[operation]) throw new Error(`Unknown operation: ${entry.action}`);

            await delegate[operation](decodeSentinels(entry.payload));
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
