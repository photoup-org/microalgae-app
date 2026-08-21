"use client";

import { useMqttStore } from "@/hooks/useMqttStore";

/** Whether the browser holds a live MQTT connection to the edge broker. */
export function ConnectionBadge() {
    const isConnected = useMqttStore((s) => s.isConnected);

    return (
        <span className="gauge-label flex items-center gap-2 text-sidebar-foreground/60">
            <span
                className={`h-2 w-2 rounded-full ${isConnected ? "bg-success live-dot" : "bg-danger"}`}
                aria-hidden
            />
            {isConnected ? "Ligado" : "Sem ligação"}
            <span className="sr-only">
                {isConnected ? "Ligado ao servidor local" : "Sem ligação ao servidor local"}
            </span>
        </span>
    );
}
