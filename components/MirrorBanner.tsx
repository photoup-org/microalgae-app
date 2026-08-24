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
 * Says when the page is running on the local replica instead of the cloud.
 *
 * Two things need saying at once, and both matter. The data is a copy of a known
 * age - someone must not read an experiment status that stopped being true hours
 * ago and act on it. And changes made now are queued, not saved: they are real
 * (the reactor was commanded over the local broker) but the cloud has not seen
 * them yet, so a second person looking at the cloud console will not.
 *
 * Renders nothing on the cloud instance, which has no replica configured, and
 * nothing while the cloud is answering.
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
            {/* Names the cause, not just the symptom: "sem ligação à nuvem" tells
                someone to check the internet, where "erro de ligação" does not. */}
            Sem ligação à nuvem. A trabalhar sobre uma cópia
            {syncedAt ? ` de ${ageLabel(syncedAt)}` : ""}. As alterações são guardadas
            localmente e enviadas quando a ligação voltar.
        </div>
    );
}
