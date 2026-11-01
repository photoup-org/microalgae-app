"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useMqttStore } from "@/hooks/useMqttStore";
import { isDeviceOnline } from "@/lib/device-status";

interface StatusStripProps {
    devices: { serialNumber: string; status: string }[];
    runningCount: number;
    openIncidents: number;
    calibrationsDue: number;
}

/**
 * The page's one-line answer: one slim panel, four readings that each link to
 * where you would act on them. Deliberately not four big stat cards - the
 * numbers here are small (one reactor, a couple of runs) and do not deserve
 * hero treatment; the reactors below do.
 */
export function StatusStrip({ devices, runningCount, openIncidents, calibrationsDue }: StatusStripProps) {
    const brokerConnected = useMqttStore((s) => s.isConnected);
    const liveStatus = useMqttStore((s) => s.deviceStatus);
    const online = devices.filter((d) => isDeviceOnline(d, liveStatus)).length;

    const items = [
        {
            href: "/devices",
            label: "Reatores online",
            value: brokerConnected ? `${online}/${devices.length}` : `?/${devices.length}`,
            hint: brokerConnected ? null : "sem ligação ao broker",
            tone: brokerConnected && online < devices.length ? "warning" : null,
        },
        { href: "/projects", label: "Experiências a correr", value: String(runningCount), hint: null, tone: null },
        {
            href: "/incidents",
            label: "Incidentes por tratar",
            value: String(openIncidents),
            hint: null,
            tone: openIncidents > 0 ? "danger" : null,
        },
        {
            href: "/devices",
            label: "Calibrações a fazer",
            value: String(calibrationsDue),
            hint: "expiradas ou nos próximos 14 dias",
            tone: calibrationsDue > 0 ? "warning" : null,
        },
    ] as const;

    return (
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-surface lg:grid-cols-4">
            {items.map((item, i) => (
                <Link
                    key={item.label}
                    href={item.href}
                    className={cn(
                        "flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                        i % 2 === 1 && "border-l border-border",
                        i >= 2 && "border-t border-border lg:border-t-0",
                        i === 2 && "lg:border-l"
                    )}
                >
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                    <span
                        className={cn(
                            "tabular text-xl leading-none font-semibold",
                            item.tone === "danger" && "text-danger",
                            item.tone === "warning" && "text-warning"
                        )}
                    >
                        {item.value}
                    </span>
                    {item.hint && <span className="text-xs text-muted-foreground">{item.hint}</span>}
                </Link>
            ))}
        </div>
    );
}
