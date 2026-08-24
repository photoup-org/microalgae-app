"use server";

import { cookies } from "next/headers";
import { getAppSession } from "@/lib/core/auth/session";
import {
    LOCAL_SESSION_COOKIE,
    localSessionCookieOptions,
    localSessionEnabled,
    localSessionTtlDays,
    signLocalSession,
} from "@/lib/core/auth/local-session";
import type { ActionResult } from "@/lib/action-result";

/**
 * Pairs the current browser with this instance, so it stays signed in offline.
 *
 * Only useful on the LAN instance, and only reachable there: the cookie is
 * per-origin, so pairing has to be done against the Pi's own URL while the
 * internet is still up. Pairing against the cloud instance would issue a cookie
 * that the Pi never sees.
 *
 * Requires a live Auth0 session. That is the whole security model: Auth0 decides
 * who may ever be paired, and the pairing only extends an identity that was
 * already proven, for a bounded time.
 */
export async function pairThisDeviceAction(): Promise<ActionResult<number>> {
    if (!localSessionEnabled()) {
        return { success: false, error: "Esta instância não aceita dispositivos emparelhados." };
    }

    const session = await getAppSession();
    if (!session?.user?.sub || !session.user.email) {
        return { success: false, error: "Não autenticado." };
    }

    const days = localSessionTtlDays();
    const token = await signLocalSession({
        sub: session.user.sub,
        email: session.user.email,
        name: session.user.name ?? null,
        exp: Math.floor(Date.now() / 1000) + days * 24 * 60 * 60,
    });

    (await cookies()).set(LOCAL_SESSION_COOKIE, token, localSessionCookieOptions());
    return { success: true, data: days };
}

/** Drops this browser's pairing. Local to this device - see the note in local-session.ts on revocation. */
export async function unpairThisDeviceAction(): Promise<ActionResult> {
    (await cookies()).delete(LOCAL_SESSION_COOKIE);
    return { success: true };
}
