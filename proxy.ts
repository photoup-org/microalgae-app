import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/core/auth/auth0";
import { getAppSession } from "@/lib/core/auth/session";

const AUTH_ROUTES_PREFIX = "/auth";

/**
 * Route guard. Next 16 uses proxy.ts rather than middleware.ts.
 *
 * This app is deny-by-default: everything the matcher covers requires a session.
 * That is the opposite of app-gui, which allowlists a few PROTECTED_ROUTES, and it
 * is deliberate — there is no marketing site here, and no anonymous surface.
 *
 * Access control ends at "is signed in". Every authenticated user may view and
 * control every reactor, so there is no org or role check. Who may sign in at all
 * is governed in Auth0 (invite only).
 */
function clearSessionAndRedirect(request: NextRequest) {
    const target = new URL(`${AUTH_ROUTES_PREFIX}/login`, request.url);
    const response = NextResponse.redirect(target);

    request.cookies.getAll().forEach((cookie) => {
        if (
            cookie.name.startsWith("appSession") ||
            cookie.name.startsWith("__session") ||
            cookie.name.startsWith("__txn")
        ) {
            response.cookies.delete(cookie.name);
            request.cookies.delete(cookie.name);
        }
    });

    return response;
}

export default async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Let the SDK own its own routes (login, logout, callback).
    if (pathname.startsWith(AUTH_ROUTES_PREFIX)) {
        return await auth0.middleware(request);
    }

    let session;
    try {
        session = await getAppSession(request);
    } catch {
        // Stale cookie from a rotated AUTH0_SECRET; clear it rather than looping.
        console.warn("[Proxy] Session decryption failed. Clearing cookies.");
        return clearSessionAndRedirect(request);
    }

    if (!session) {
        const loginUrl = new URL(`${AUTH_ROUTES_PREFIX}/login`, request.url);
        loginUrl.searchParams.set("returnTo", pathname);
        return NextResponse.redirect(loginUrl);
    }

    return await auth0.middleware(request);
}

export const config = {
    matcher: [
        /*
         * Everything except the edge-facing API routes and static assets.
         *
         * api/webhooks, api/telemetry, and api/system-logs are called by the edge
         * worker, which has a bearer token but no session cookie. Left in the
         * matcher they would be redirected to /auth/login, so the worker would see
         * a redirect instead of its endpoint and retry into its dead-letter queue.
         * They authenticate themselves against EDGE_WEBHOOK_SECRET instead.
         */
        "/((?!api/webhooks|api/telemetry|api/system-logs|_next/static|_next/image|favicon.ico).*)",
    ],
};
