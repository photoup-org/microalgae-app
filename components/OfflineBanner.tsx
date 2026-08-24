"use client";

import { useOffline } from "next/offline";
import { CloudOff } from "lucide-react";

/**
 * Says so when the browser cannot reach the app.
 *
 * Without it the failure is invisible in the worst possible way: with
 * experimental.useOffline enabled, a blocked navigation or Server Action is held
 * and retried rather than thrown, so the UI sits in a loading state that looks
 * exactly like a slow server. A gauge that stopped updating because the network
 * died must not read as a reactor that stopped changing.
 */
export function OfflineBanner() {
    const isOffline = useOffline();
    if (!isOffline) return null;

    return (
        <div
            role="status"
            className="flex items-center justify-center gap-2 bg-warning/15 px-4 py-1.5 text-xs text-warning"
        >
            <CloudOff className="size-3.5 shrink-0" aria-hidden />
            Sem ligação. Os valores mostrados podem estar desatualizados.
        </div>
    );
}
