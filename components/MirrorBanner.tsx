import { DatabaseZap } from "lucide-react";
import { mirrorClient, recentlyDegraded } from "@/lib/core/prisma";
import { mirrorSyncedAt } from "@/lib/services/mirror";

function ageLabel(syncedAt: Date): string {
    const minutes = Math.floor((Date.now() - syncedAt.getTime()) / 60_000);
    if (minutes < 1) return "há menos de um minuto";
    if (minutes < 60) return `há ${minutes} minuto(s)`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `há ${hours} hora(s)`;
    return `há ${Math.floor(hours / 24)} dia(s)`;
}

/**
 * Says when the page is showing a copy rather than live data.
 *
 * This is the whole justification for the mirror being acceptable. A read-only
 * copy silently standing in for the primary would be worse than an error page:
 * someone would read a gauge, a valve state or an experiment status that stopped
 * being true hours ago and act on it. Stating the age turns a lie into a
 * qualified answer.
 *
 * Renders nothing on the LAN instance, which has no mirror configured, and nothing
 * when the primary is answering.
 */
export async function MirrorBanner() {
    const mirror = mirrorClient();
    if (!mirror || !recentlyDegraded()) return null;

    const syncedAt = await mirrorSyncedAt(mirror);

    return (
        <div
            role="status"
            className="flex items-center justify-center gap-2 bg-danger/15 px-4 py-1.5 text-xs text-danger"
        >
            <DatabaseZap className="size-3.5 shrink-0" aria-hidden />
            {/* Names the cause, not just the symptom: "servidor local inacessível"
                tells someone to go look at the Pi, where "erro de ligação" does not. */}
            Servidor local inacessível. A mostrar uma cópia
            {syncedAt ? ` de ${ageLabel(syncedAt)}` : ""}. Não é possível guardar alterações.
        </div>
    );
}
