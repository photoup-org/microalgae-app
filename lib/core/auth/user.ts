import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/core/prisma";
import { getAppSession } from "@/lib/core/auth/session";
import { LOCAL_SESSION_COOKIE, verifyLocalSession } from "@/lib/core/auth/local-session";

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
    const identity = await resolveIdentity();
    if (!identity) return null;

    const departmentId = process.env.DEPARTMENT_ID;
    if (!departmentId) {
        throw new Error("DEPARTMENT_ID is not set. See .env.example.");
    }

    const { sub, email, name, picture } = identity;

    const existing = await prisma.user.findUnique({
        where: { auth0UserId: sub },
    });
    if (existing) return existing;

    // First login. A row may already exist by email if the account was provisioned
    // elsewhere, so adopt it rather than colliding on the unique index.
    return prisma.user.upsert({
        where: { email },
        update: { auth0UserId: sub },
        create: {
            email,
            auth0UserId: sub,
            name: name ?? null,
            image: picture ?? null,
            departmentId,
        },
    });
}

interface Identity {
    sub: string;
    email: string;
    name?: string | null;
    picture?: string | null;
}

/**
 * Auth0 first, then a paired device.
 *
 * The fallback is what makes the LAN instance usable offline: proxy.ts already
 * let the request through on the strength of the pairing cookie, so refusing to
 * name a user here would leave every Server Action failing with "Unauthorized"
 * behind a page that rendered fine.
 *
 * Auth0 always wins when present - a live session is better evidence than a token
 * signed weeks ago.
 */
async function resolveIdentity(): Promise<Identity | null> {
    const session = await getAppSession();
    if (session?.user?.sub) {
        if (!session.user.email) {
            throw new Error(`Auth0 profile ${session.user.sub} has no email claim.`);
        }
        return {
            sub: session.user.sub,
            email: session.user.email,
            name: session.user.name,
            picture: session.user.picture,
        };
    }

    const paired = await verifyLocalSession((await cookies()).get(LOCAL_SESSION_COOKIE)?.value);
    if (!paired) return null;

    return { sub: paired.sub, email: paired.email, name: paired.name };
}

/** Same as getCurrentUser but throws instead of returning null. For Server Actions. */
export async function requireUser() {
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");
    return user;
}
