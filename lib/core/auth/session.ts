import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { auth0 } from "@/lib/core/auth/auth0";

/**
 * Session retrieval that survives a changed AUTH0_SECRET.
 *
 * A stale cookie encrypted with an old secret throws on decrypt. From proxy.ts we
 * rethrow so the caller can return a response that clears the cookie; from a Server
 * Component we redirect, which cleanly aborts rendering.
 *
 * Deliberately free of database imports: proxy.ts imports this, and Next 16 runs
 * proxy separately from render code, so pulling Prisma in here would drag the
 * client into that bundle. Database-backed user lookup lives in ./user.ts instead.
 */
export async function getAppSession(request?: NextRequest) {
    try {
        return request ? await auth0.getSession(request) : await auth0.getSession();
    } catch (error) {
        console.warn("[Session] Failed to get session (likely JWE decryption error):", error);

        if (request) throw error;
        redirect("/auth/logout");
    }
}
