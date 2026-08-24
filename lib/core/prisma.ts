import { PrismaClient, Prisma } from "@prisma/client";
import { enqueue, isReplayable } from "@/lib/services/outbox";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
    mirrorPrisma: PrismaClient | undefined;
};

/**
 * Errors that mean "this database is not answering", as opposed to "this query is
 * wrong". Only these justify falling back to the replica - a constraint violation
 * or a bad query must surface, not be queued and retried somewhere else.
 *
 * P1001 unreachable, P1002 timed out, P1008 operation timed out,
 * P1017 server closed the connection.
 */
const UNREACHABLE_CODES = new Set(["P1001", "P1002", "P1008", "P1017"]);

const WRITE_OPERATIONS = new Set([
    "create",
    "createMany",
    "createManyAndReturn",
    "update",
    "updateMany",
    "upsert",
    "delete",
    "deleteMany",
    "executeRaw",
    "executeRawUnsafe",
]);

function isUnreachable(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientInitializationError) return true;
    if (error instanceof Prisma.PrismaClientKnownRequestError) return UNREACHABLE_CODES.has(error.code);
    return false;
}

function createClient(url?: string): PrismaClient {
    return new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
        ...(url ? { datasources: { db: { url } } } : {}),
    });
}

/**
 * The LAN instance's local replica of the authoritative cloud database.
 *
 * Null unless MIRROR_DATABASE_URL is set, which is how the feature stays off on
 * the cloud instance - Neon is reachable from Vercel by definition, and a replica
 * there would answer for an outage that cannot happen.
 */
const mirror: PrismaClient | null = process.env.MIRROR_DATABASE_URL
    ? (globalForPrisma.mirrorPrisma ?? createClient(process.env.MIRROR_DATABASE_URL))
    : null;

/**
 * Marks the most recent moment a query had to fall back. AppShell reads it to
 * decide whether to warn, rather than health-checking the primary a second time.
 *
 * Module scope, so it is per server instance and resets on redeploy. That is fine:
 * the banner only needs to reflect the recent past, and the next failed query
 * refreshes it immediately.
 */
let lastFallbackAt = 0;

/** Whether a query fell back to the replica within the given window. */
export function recentlyDegraded(withinMs = 60_000): boolean {
    return lastFallbackAt > 0 && Date.now() - lastFallbackAt < withinMs;
}

export function mirrorClient(): PrismaClient | null {
    return mirror;
}

/**
 * The cloud client, extended so an unreachable cloud keeps the LAN console working.
 *
 * Done as an extension rather than at each call site because there are dozens of
 * call sites and one of them being forgotten is exactly the bug this is meant to
 * prevent - a page that throws while its neighbour degrades gracefully.
 *
 * Reads are served from the replica. Writes are queued in the outbox AND applied
 * to the replica, so the UI reflects them immediately and the cloud receives them
 * on reconnect.
 *
 * Queueing a write is only safe because the reactor has already been told by the
 * time we get here: setValveAction and updateExperimentLifecycleAction both
 * publish over MQTT to the local broker first - which works offline - and only
 * then touch the database. The queued row is the record of a command that already
 * happened, not a promise to issue one later.
 */
const basePrisma = globalForPrisma.prisma ?? createClient();

export const prisma = (
    mirror
        ? basePrisma.$extends({
              query: {
                  async $allOperations({ model, operation, args, query }) {
                      try {
                          return await query(args);
                      } catch (error) {
                          if (!isUnreachable(error) || !model) throw error;

                          lastFallbackAt = Date.now();

                          // The extension has no typed handle on the replica's
                          // delegates, so this indexes them by name. Shapes match
                          // because both databases are built from the same schema.
                          const key = model.charAt(0).toLowerCase() + model.slice(1);
                          const delegate = (mirror as unknown as Record<string, Record<string, (a: unknown) => unknown>>)[key];

                          if (WRITE_OPERATIONS.has(operation)) {
                              if (!isReplayable(operation)) {
                                  // Raw writes carry SQL we cannot re-dispatch by
                                  // model and operation on reconnect.
                                  throw new Error(
                                      "Sem ligação à nuvem: esta operação não pode ser guardada localmente."
                                  );
                              }

                              await enqueue(mirror, { model: key, operation, args });
                              console.warn(`[db] Cloud unreachable; ${key}.${operation} queued and applied locally.`);
                              // Apply to the replica too, or the UI would show the
                              // change as having failed until the link returns.
                              return delegate[operation](args);
                          }

                          console.warn(`[db] Cloud unreachable; serving ${key}.${operation} from the replica.`);
                          return delegate[operation](args);
                      }
                  },
              },
          })
        : basePrisma
) as PrismaClient;

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = basePrisma;
    if (mirror) globalForPrisma.mirrorPrisma = mirror;
}
