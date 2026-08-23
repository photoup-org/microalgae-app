"use client";

import { Router, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMqttStore } from "@/hooks/useMqttStore";

function Row({
    icon: Icon,
    ok,
    onLabel,
    offLabel,
    collapsed,
}: {
    icon: typeof Router;
    ok: boolean;
    onLabel: string;
    offLabel: string;
    collapsed?: boolean;
}) {
    return (
        <div
            title={collapsed ? (ok ? onLabel : offLabel) : undefined}
            className={cn("flex items-center gap-2", collapsed && "justify-center")}
        >
            <Icon className={cn("size-4 shrink-0", ok ? "text-success" : "text-danger")} aria-hidden />
            {!collapsed && (
                <span className="gauge-label text-sidebar-foreground/60">{ok ? onLabel : offLabel}</span>
            )}
        </div>
    );
}

/**
 * Two independent signals: the browser's own WS link to mosquitto, and the edge
 * worker's retained LWT on gateway/{id}/status. A device can look "online" in
 * Prisma while both of these are down - this is what actually tells the operator
 * whether live telemetry/control can reach the edge at all.
 */
export function ConnectionBadge({ collapsed }: { collapsed?: boolean }) {
    const isConnected = useMqttStore((s) => s.isConnected);
    const edgeServerStatus = useMqttStore((s) => s.edgeServerStatus);
    const edgeOnline = isConnected && edgeServerStatus === "online";

    return (
        <div className="space-y-1.5">
            <Row icon={Router} ok={isConnected} onLabel="Mosquitto ligado" offLabel="Mosquitto sem ligação" collapsed={collapsed} />
            <Row icon={Server} ok={edgeOnline} onLabel="Servidor edge ligado" offLabel="Servidor edge sem ligação" collapsed={collapsed} />
        </div>
    );
}
