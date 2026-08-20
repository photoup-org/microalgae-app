"use client";

import { useMqttStore } from "@/hooks/useMqttStore";
import { REACTOR_SCHEMA, VALVE_METRIC } from "@/lib/reactor-schema";

interface ReactorTileProps {
    name: string;
    serialNumber: string | null;
    deviceStatus: string | null;
    metrics: string[];
}

/**
 * Live summary for one reactor.
 *
 * Values come from the browser MQTT connection, keyed by the device's hardware id
 * (which we provision to equal serialNumber). Presence comes from the retained
 * nodes/{id}/status LWT topic, which is the edge's own view of the node.
 */
export function ReactorTile({ name, serialNumber, deviceStatus, metrics }: ReactorTileProps) {
    const live = useMqttStore((s) => (serialNumber ? s.liveValues[serialNumber] : undefined));
    const presence = useMqttStore((s) => (serialNumber ? s.deviceStatus[serialNumber] : undefined));

    const isOnline = presence === "online" || (presence === undefined && Boolean(live));
    const shown = REACTOR_SCHEMA.filter((m) => metrics.length === 0 || metrics.includes(m.key));
    const valveOpen = live?.[VALVE_METRIC];

    return (
        <article className="h-full rounded-lg border border-border bg-surface p-5 transition-colors hover:border-accent">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="truncate font-medium">{name}</h2>
                    <p className="tabular mt-0.5 truncate text-xs text-muted-foreground">
                        {serialNumber ?? "sem dispositivo"}
                    </p>
                </div>
                <StatusPill online={isOnline} pending={deviceStatus === "PENDING_CONNECTION"} />
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                {shown.map((metric) => {
                    const raw = live?.[metric.key];
                    const value = typeof raw === "number" ? raw : null;

                    return (
                        <div key={metric.key}>
                            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{ backgroundColor: metric.color }}
                                    aria-hidden
                                />
                                {metric.label}
                            </dt>
                            <dd className="tabular mt-0.5 text-lg">
                                {value === null ? (
                                    <span className="text-muted-foreground">—</span>
                                ) : (
                                    <>
                                        {formatValue(value, metric.key)}
                                        <span className="ml-1 text-xs text-muted-foreground">{metric.unit}</span>
                                    </>
                                )}
                            </dd>
                        </div>
                    );
                })}
            </dl>

            {valveOpen !== undefined && valveOpen !== null && (
                <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                    Válvula CO2{" "}
                    <span className={Number(valveOpen) === 1 ? "text-success" : "text-foreground"}>
                        {Number(valveOpen) === 1 ? "aberta" : "fechada"}
                    </span>
                </p>
            )}
        </article>
    );
}

function StatusPill({ online, pending }: { online: boolean; pending: boolean }) {
    if (pending && !online) {
        return (
            <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-warning">
                à espera
            </span>
        );
    }

    return (
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span
                className={`h-1.5 w-1.5 rounded-full ${online ? "bg-success live-dot" : "bg-muted-foreground"}`}
                aria-hidden
            />
            {online ? "online" : "offline"}
        </span>
    );
}

/** pH deserves more precision than ppm. */
function formatValue(value: number, metricKey: string): string {
    if (metricKey === "co2") return value.toFixed(0);
    if (metricKey === "ph") return value.toFixed(2);
    return value.toFixed(1);
}
