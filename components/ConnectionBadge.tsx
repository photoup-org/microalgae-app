"use client";

import { useMqttStore } from "@/hooks/useMqttStore";

function Row({ ok, onLabel, offLabel }: { ok: boolean; onLabel: string; offLabel: string }) {
    return (
        <span className="gauge-label flex items-center gap-2 text-sidebar-foreground/60">
            <span
                className={`h-2 w-2 rounded-full ${ok ? "bg-success live-dot" : "bg-danger"}`}
                aria-hidden
            />
            {ok ? onLabel : offLabel}
        </span>
    );
}

/**
 * Two independent signals: the browser's own WS link to mosquitto, and the edge
 * worker's retained LWT on gateway/{id}/status. A device can look "online" in
 * Prisma while both of these are down - this is what actually tells the operator
 * whether live telemetry/control can reach the edge at all.
 */
export function ConnectionBadge() {
    const isConnected = useMqttStore((s) => s.isConnected);
    const edgeServerStatus = useMqttStore((s) => s.edgeServerStatus);
    const edgeOnline = isConnected && edgeServerStatus === "online";

    return (
        <div className="space-y-1">
            <Row ok={isConnected} onLabel="Mosquitto ligado" offLabel="Mosquitto sem ligação" />
            <Row ok={edgeOnline} onLabel="Servidor edge ligado" offLabel="Servidor edge sem ligação" />
        </div>
    );
}
