import { Auth0Client } from "@auth0/nextjs-auth0/server";

/**
 * Auth0 v4 client.
 *
 * Unlike app-gui this app has no Organizations: every authenticated user has full
 * access to every reactor, so there is no org claim to inject and no
 * beforeSessionSaved hook.
 */
export const auth0 = new Auth0Client({
    routes: {
        login: "/auth/login",
        callback: "/auth/callback",
    },
});
