import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { publishMQTTMessage } from "@/lib/core/mqtt";

/**
 * GitHub webhook -> "check for updates now" on the Pi.
 *
 * Configure on edge-gateway-docker and microalgae-app (Settings -> Webhooks):
 *   URL:          https://<cloud app>/api/webhooks/github
 *   Content type: application/json
 *   Secret:       GITHUB_WEBHOOK_SECRET
 *   Events:       "Pushes" and "Workflow runs"
 *
 * A push makes the Pi's updater fetch at once instead of on its 5-minute poll.
 * The completed "Build edge worker image" run matters as much: until CI has
 * published the image the updater reports "building", and this is what flips it
 * to "available" seconds after the build ends.
 *
 * Carries no code and no commit to deploy: the updater fetches from GitHub itself
 * and only ever fast-forwards main, so a forged call can at worst cause a check.
 * proxy.ts already excludes api/webhooks from the session gate.
 */
function validSignature(body: string, header: string | null, secret: string): boolean {
    if (!header?.startsWith("sha256=")) return false;
    const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`);
    const given = Buffer.from(header);
    return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function POST(req: NextRequest) {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
        console.error("[github-webhook] GITHUB_WEBHOOK_SECRET is not set.");
        return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }

    const body = await req.text();
    if (!validSignature(body, req.headers.get("x-hub-signature-256"), secret)) {
        return NextResponse.json({ error: "Bad signature" }, { status: 401 });
    }

    const event = req.headers.get("x-github-event");
    let payload: { ref?: string; action?: string; repository?: { full_name?: string } };
    try {
        payload = JSON.parse(body);
    } catch {
        return NextResponse.json({ error: "Bad payload" }, { status: 400 });
    }

    const relevant =
        (event === "push" && payload.ref === "refs/heads/main") ||
        (event === "workflow_run" && payload.action === "completed");
    if (!relevant) return NextResponse.json({ ignored: event });

    try {
        await publishMQTTMessage("cmd/gateway/update/check", {
            reason: event,
            repo: payload.repository?.full_name ?? null,
        });
    } catch (error) {
        console.error("[github-webhook] could not reach the broker:", error);
        return NextResponse.json({ error: "Broker unreachable" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
}
