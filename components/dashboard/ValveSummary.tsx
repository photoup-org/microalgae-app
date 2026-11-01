"use client";

import Link from "next/link";
import { Wind } from "lucide-react";
import { useMqttStore } from "@/hooks/useMqttStore";
import { VALVE_METRIC } from "@/lib/reactor-schema";
import type { ValveControl } from "@/components/ValvePanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ValveSummaryProps {
    reactors: { id: string; serialNumber: string; name: string | null; control: ValveControl | null }[];
}

function modeText(control: ValveControl | null): string {
    if (!control || control.mode === "manual") {
        const seconds = control?.mode === "manual" ? control.manual.maxOpenSeconds : null;
        return seconds ? `Manual, fecha sozinha após ${seconds} s` : "Manual";
    }
    const { phOpenThreshold, phCloseThreshold } = control.automatic;
    return `Automático: abre acima de pH ${phOpenThreshold}, fecha abaixo de ${phCloseThreshold}`;
}

/**
 * Read-only on purpose. Opening a CO2 valve from a dashboard tile is one stray
 * click from dosing a culture; the controls stay on the reactor page, next to
 * the readings and safety limits that give the action its context.
 */
export function ValveSummary({ reactors }: ValveSummaryProps) {
    const liveValues = useMqttStore((s) => s.liveValues);

    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Wind className="size-4 text-metric-co2" aria-hidden />
                    Válvula de CO₂
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {reactors.map((reactor) => {
                    const reported = liveValues[reactor.serialNumber]?.[VALVE_METRIC];
                    const state =
                        reported === undefined || reported === null ? null : Number(reported) === 1 ? "open" : "closed";
                    return (
                        <Link
                            key={reactor.id}
                            href={`/devices/${reactor.id}`}
                            className="-mx-2 block rounded-md px-2 py-1.5 hover:bg-accent"
                        >
                            <span className="flex items-center justify-between gap-2">
                                <span className="truncate font-medium">{reactor.name ?? reactor.serialNumber}</span>
                                <span
                                    className={
                                        state === "open"
                                            ? "font-medium text-metric-co2"
                                            : state === "closed"
                                              ? "text-foreground"
                                              : "text-muted-foreground"
                                    }
                                >
                                    {state === "open" ? "Aberta" : state === "closed" ? "Fechada" : "Sem leitura"}
                                </span>
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">{modeText(reactor.control)}</span>
                        </Link>
                    );
                })}
            </CardContent>
        </Card>
    );
}
