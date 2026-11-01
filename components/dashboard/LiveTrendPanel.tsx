"use client";

import { useState } from "react";
import { ReactorChart } from "@/components/ReactorChart";

interface LiveTrendPanelProps {
    reactors: { serialNumber: string; name: string | null; sensors: string[]; calibrated: string[] }[];
}

/**
 * The live stream for one reactor at a time, with a picker once there is more
 * than one. Live only, like the device page: the recorded series belongs to an
 * experiment, which is where it is shown.
 */
export function LiveTrendPanel({ reactors }: LiveTrendPanelProps) {
    const [serial, setSerial] = useState(reactors[0]?.serialNumber ?? "");
    const reactor = reactors.find((r) => r.serialNumber === serial) ?? reactors[0];
    if (!reactor) return null;

    const heading = (
        <div className="mr-auto flex items-center gap-2">
            <h2 className="font-heading text-base font-medium">Tendência em direto</h2>
            {reactors.length > 1 ? (
                <select
                    value={reactor.serialNumber}
                    onChange={(e) => setSerial(e.target.value)}
                    aria-label="Reator"
                    className="rounded-md border border-input bg-surface px-2 py-1 text-sm"
                >
                    {reactors.map((r) => (
                        <option key={r.serialNumber} value={r.serialNumber}>
                            {r.name ?? r.serialNumber}
                        </option>
                    ))}
                </select>
            ) : (
                <span className="text-sm text-muted-foreground">{reactor.name ?? reactor.serialNumber}</span>
            )}
        </div>
    );

    return (
        // Keyed so switching reactors resets the chart's own metric toggles.
        <ReactorChart
            key={reactor.serialNumber}
            serialNumber={reactor.serialNumber}
            telemetry={[]}
            enabledMetrics={reactor.sensors}
            calibrated={reactor.calibrated}
            liveOnly
            heading={heading}
        />
    );
}
