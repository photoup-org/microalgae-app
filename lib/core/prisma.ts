import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
    mirrorPrisma: PrismaClient | undefined;
};

/**
 * Errors that mean "this database is not answering", as opposed to "this query is
 * wrong". Only these justify falling back to the mirror - a constraint violation
 * or a bad query must surface, not be retried somewhere else.
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
 * The read-only copy the cloud instance falls back to when the Pi is unreachable.
 *
 * Null unless MIRROR_DATABASE_URL is set, which is how the whole feature stays off
 * for the LAN instance - it IS the primary, so a fallback there would be a copy of
 * itself.
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

/** Whether a query fell back to the mirror within the given window. */
export function recentlyDegraded(withinMs = 60_000): boolean {
    return lastFallbackAt > 0 && Date.now() - lastFallbackAt < withinMs;
}

export function mirrorClient(): PrismaClient | null {
    return mirror;
}

/**
 * The primary client, extended so an unreachable primary transparently reads from
 * the mirror.
 *
 * Done as an extension rather than at each call site because there are dozens of
 * call sites and one of them being forgotten is exactly the bug this is meant to
 * prevent - a page that throws while its neighbour degrades gracefully.
 *
 * Writes are NOT redirected. A mutation against the mirror would be silently lost
 * on the next sync, and worse, would report success for a valve command that never
 * reached the reactor. It throws instead, and the UI surfaces the error.
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

                          if (WRITE_OPERATIONS.has(operation)) {
                              throw new Error(
                                  "O servidor local está inacessível, por isso não é possível guardar alterações. " +
                                      "Os dados mostrados são uma cópia."
                              );
                          }

                          lastFallbackAt = Date.now();
                          console.warn(`[db] Primary unreachable; serving ${model}.${operation} from the mirror.`);

                          // The extension has no typed handle on the mirror's delegates,
                          // so this indexes them by name. Shapes match because both
                          // databases are built from the same schema.
                          const delegate = (mirror as unknown as Record<string, Record<string, (a: unknown) => unknown>>)[
                              model.charAt(0).toLowerCase() + model.slice(1)
                          ];
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
