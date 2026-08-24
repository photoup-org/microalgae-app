/**
 * A signed cookie that keeps a paired device signed in when Auth0 is unreachable.
 *
 * The LAN instance on the Pi has to work with the internet down - that is the
 * entire point of running it there. Auth0 cannot: /auth/login is a redirect to a
 * host that is not answering. So a device pairs once while online, and carries a
 * self-contained token afterwards.
 *
 * STATELESS ON PURPOSE. proxy.ts is where the check has to happen, and proxy.ts
 * must not import Prisma (Next 16 runs it separately from render code, so a
 * Prisma import drags the client into that bundle - see session.ts). A database
 * lookup per request is therefore not available, which rules out a revocable
 * per-device record.
 *
 * The consequence is the security tradeoff to know about:
 *
 *   - The cookie is a bearer credential. Anyone holding it is signed in until it
 *     expires, and it cannot be revoked individually.
 *   - Revoking everything means rotating LOCAL_SESSION_SECRET on the Pi, which
 *     forces every paired device to pair again. That is the whole revocation
 *     story. With a handful of devices it is a reasonable one; it would not be at
 *     larger scale.
 *   - Over plain http:// on the LAN the cookie travels in clear text and anyone
 *     on the same network can copy it. Serve the LAN instance over HTTPS (a
 *     Tailscale cert does this) or accept that the network is the trust boundary.
 *
 * Web Crypto rather than node:crypto because proxy.ts may run in the Edge
 * runtime, where node:crypto is not available.
 */

export const LOCAL_SESSION_COOKIE = "lanSession";

/** Identity carried in the token. Deliberately tiny - it is copied on every request. */
export interface LocalSessionClaims {
    /** Auth0 `sub`. Matches User.auth0UserId. */
    sub: string;
    email: string;
    name: string | null;
    /** Unix seconds. */
    exp: number;
}

/** Days a pairing lasts before the device has to be online again. */
export function localSessionTtlDays(): number {
    const raw = Number(process.env.LOCAL_SESSION_TTL_DAYS);
    return Number.isFinite(raw) && raw > 0 ? raw : 30;
}

/**
 * Whether this deployment accepts paired devices at all.
 *
 * Off by default, and meant to be on ONLY for the instance running on the Pi. The
 * cloud instance has no reason to accept an offline credential, and enabling it
 * there would expose one to the internet.
 */
/**
 * Anything shorter is not a key, and this token is the only thing standing between
 * the local network and full reactor control. 32 characters is the length
 * `openssl rand -hex 32` produces halved, so it accepts a real secret and rejects
 * a typed-in phrase.
 */
const MIN_SECRET_LENGTH = 32;

export function localSessionEnabled(): boolean {
    if (process.env.LOCAL_SESSION_ENABLED !== "true") return false;

    const secret = process.env.LOCAL_SESSION_SECRET;
    if (!secret || secret.length < MIN_SECRET_LENGTH) {
        // Fails closed and says why. Silently disabling would look like pairing
        // being broken; silently accepting would be worse.
        console.error(
            `[local-session] LOCAL_SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters. Pairing is disabled.`
        );
        return false;
    }
    return true;
}

function base64UrlEncode(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    // Backed by an explicit ArrayBuffer so the type is not the SharedArrayBuffer
    // union, which the Web Crypto BufferSource parameters do not accept.
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function hmacKey(): Promise<CryptoKey> {
    const secret = process.env.LOCAL_SESSION_SECRET;
    if (!secret) throw new Error("LOCAL_SESSION_SECRET is not set.");

    return crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"]
    );
}

/** Returns `<payload>.<signature>`, both base64url. */
export async function signLocalSession(claims: LocalSessionClaims): Promise<string> {
    const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(claims)));
    const signature = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(payload));
    return `${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Returns the claims, or null for anything that is not a currently valid token.
 *
 * Never throws and never distinguishes between "malformed", "bad signature" and
 * "expired" to the caller: all three mean not signed in, and telling them apart
 * only helps someone probing.
 */
export async function verifyLocalSession(token: string | undefined): Promise<LocalSessionClaims | null> {
    if (!token || !localSessionEnabled()) return null;

    const separator = token.lastIndexOf(".");
    if (separator <= 0) return null;

    const payload = token.slice(0, separator);
    const signature = token.slice(separator + 1);

    try {
        // crypto.subtle.verify is constant-time, which is why the comparison is not
        // done by re-signing and string-matching.
        const valid = await crypto.subtle.verify(
            "HMAC",
            await hmacKey(),
            base64UrlDecode(signature),
            new TextEncoder().encode(payload)
        );
        if (!valid) return null;

        const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as LocalSessionClaims;
        if (typeof claims.sub !== "string" || typeof claims.email !== "string") return null;
        if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) return null;

        return claims;
    } catch {
        return null;
    }
}

/**
 * Cookie options for the pairing cookie.
 *
 * `secure` follows the base URL rather than being hardcoded true: the LAN instance
 * may legitimately be served over http://reactor.local, and a Secure cookie is
 * silently dropped there, which would look like pairing simply not working.
 */
export function localSessionCookieOptions() {
    const baseUrl = process.env.APP_BASE_URL ?? "";
    return {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: baseUrl.startsWith("https://"),
        path: "/",
        maxAge: localSessionTtlDays() * 24 * 60 * 60,
    };
}
