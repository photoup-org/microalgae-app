import "server-only";
import { prisma } from "@/lib/core/prisma";
import { getAppSession } from "@/lib/core/auth/session";

/**
 * Resolves the Auth0 session to a row in the User table, creating it on first login.
 *
 * Every authenticated user is a full-access operator here, so there is no role or
 * membership check beyond "is signed in". Who may sign in at all is governed in
 * Auth0 (invite only).
 *
 * Kept out of session.ts because that file is imported by proxy.ts, which must not
 * pull in Prisma.
 */
export async function getCurrentUser() {
    const session = await getAppSession();
    if (!session?.user?.sub) return null;

    const departmentId = process.env.DEPARTMENT_ID;
    if (!departmentId) {
        throw new Error("DEPARTMENT_ID is not set. See .env.example.");
    }

    const email = session.user.email;
    if (!email) {
        throw new Error(`Auth0 profile ${session.user.sub} has no email claim.`);
    }

    const existing = await prisma.user.findUnique({
        where: { auth0UserId: session.user.sub },
    });
    if (existing) return existing;

    // First login. A row may already exist by email if the account was provisioned
    // from app-gui, so adopt it rather than colliding on the unique index.
    return prisma.user.upsert({
        where: { email },
        update: { auth0UserId: session.user.sub },
        create: {
            email,
            auth0UserId: session.user.sub,
            name: session.user.name ?? null,
            image: session.user.picture ?? null,
            departmentId,
        },
    });
}

/** Same as getCurrentUser but throws instead of returning null. For Server Actions. */
export async function requireUser() {
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");
    return user;
}
