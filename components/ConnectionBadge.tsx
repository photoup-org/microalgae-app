"use client";

import { Router, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMqttStore } from "@/hooks/useMqttStore";

/**
 * `unknown` is a genuinely distinct state, not a shade of `down`: when the
 * browser has no link to the broker, the edge worker's retained status cannot
 * reach us, so we know nothing about it. Reporting that as a fault would blame
 * the worker for the broker's failure.
 */
type LinkState = "live" | "down" | "unknown";

interface LinkProps {
    icon: typeof Router;
    name: string;
    state: LinkState;
    /** Shown only when the link is not live - see the exception-reporting note below. */
    fault: string;
    collapsed?: boolean;
    /** Draws the spine segment descending to the next node. */
    connector?: LinkState;
}

const CHIP: Record<LinkState, string> = {
    live: "bg-success/10 text-success",
    down: "bg-danger/10 text-danger",
    unknown: "bg-surface-muted text-muted-foreground",
};

const NAME: Record<LinkState, string> = {
    live: "text-sidebar-foreground/70",
    down: "text-danger",
    unknown: "text-muted-foreground",
};

function Link({ icon: Icon, name, state, fault, collapsed, connector }: LinkProps) {
    const summary = state === "live" ? `${name}: ligado` : `${name}: ${fault}`;

    return (
        <li className={cn("relative flex flex-col", collapsed && "items-center")}>
            <div
                className={cn("flex items-center gap-2.5", collapsed && "justify-center")}
                title={collapsed ? summary : undefined}
            >
                <span
                    className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-md",
                        CHIP[state],
                        // Only a live node breathes. Stillness is what makes a fault
                        // legible at a glance, so it must never animate.
                        state === "live" && "live-dot"
                    )}
                    aria-hidden
                >
                    <Icon className="size-3.5" />
                </span>

                {!collapsed && (
                    <span className={cn("gauge-label truncate", NAME[state])}>{name}</span>
                )}
                <span className="sr-only">{summary}</span>
            </div>

            {!collapsed && state !== "live" && (
                <span className={cn("pl-8.5 text-[10px] leading-tight", state === "down" ? "text-danger/80" : "text-muted-foreground")}>
                    {fault}
                </span>
            )}

            {connector && (
                <span
                    aria-hidden
                    className={cn(
                        // Anchored to the chip and stretched to the next one, so the
                        // spine still meets it when a fault line makes this row taller.
                        "absolute top-6 -bottom-3 w-px",
                        collapsed ? "left-1/2 -translate-x-1/2" : "left-[11.5px]",
                        connector === "live" ? "bg-success/40" : "bg-border"
                    )}
                />
            )}
        </li>
    );
}

/**
 * The two links between this browser and the reactors, drawn as the single chain
 * they actually are.
 *
 * They are not independent lamps: telemetry reaches the page only through the
 * broker, and the worker's own status arrives the same way, so the second node
 * depends on the first. The spine connecting them says that - it goes inert when
 * the broker is unreachable, because nothing downstream can be known.
 *
 * Faults are reported by exception: a healthy link shows its name and nothing
 * else. That keeps the common case quiet, and means anything that catches the eye
 * here is genuinely worth reading.
 */
export function ConnectionBadge({ collapsed }: { collapsed?: boolean }) {
    const isConnected = useMqttStore((s) => s.isConnected);
    const edgeServerStatus = useMqttStore((s) => s.edgeServerStatus);

    const broker: LinkState = isConnected ? "live" : "down";
    const edge: LinkState = !isConnected
        ? "unknown"
        : edgeServerStatus === "online"
          ? "live"
          : "down";

    return (
        // The 12px gap is load-bearing: the spine segment is stretched against it.
        <ul className="space-y-3">
            <Link
                icon={Router}
                name="Broker MQTT"
                state={broker}
                fault="sem ligação"
                collapsed={collapsed}
                connector={broker}
            />
            <Link
                icon={Server}
                name="Servidor edge"
                state={edge}
                // "sem resposta", not "sem ligação": the broker is reachable, so the
                // worker is silent rather than unreachable - a different repair.
                fault={edge === "unknown" ? "estado desconhecido" : "sem resposta"}
                collapsed={collapsed}
            />
        </ul>
    );
}
