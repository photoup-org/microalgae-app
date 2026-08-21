"use client";

import { useMemo } from "react";
import { useMqttStore } from "@/hooks/useMqttStore";
import { REACTOR_SCHEMA } from "@/lib/reactor-schema";
import { SensorReading } from "@/lib/types";
import { MetricGauge } from "@/components/MetricGauge";

interface ReactorGaugesProps {
    /** Hardware id, which is how the live store keys devices. */
    serialNumber: string;
    /** Server-fetched history from InfluxDB, used until a live value arrives. */
    telemetry: SensorReading[];
    /** Channels this reactor was provisioned with. Empty means all. */
    enabledMetrics: string[];
    /**
     * Whether to merge the live MQTT stream on top of `telemetry`. Defaults to true
     * for the standalone device page. The experiment page passes
     * `experiment.status === "RUNNING"` - live telemetry flows independent of any
     * experiment (see CLAUDE.md), so without this an experiment view keeps updating
     * after it's stopped, or shows readings before it's ever started.
     */
    live?: boolean;
}

/** Current-value readout row, fed by the live MQTT stream with a fallback to the last saved point. */
export function ReactorGauges({ serialNumber, telemetry, enabledMetrics, live: liveEnabled = true }: ReactorGaugesProps) {
    const metrics = REACTOR_SCHEMA.filter(
        (m) => enabledMetrics.length === 0 || enabledMetrics.includes(m.key)
    );
    const liveValues = useMqttStore((s) => s.liveValues[serialNumber]);
    const live = liveEnabled ? liveValues : undefined;

    const lastSaved = useMemo(() => {
        const latest: Record<string, number> = {};
        for (const reading of telemetry) {
            latest[reading.metricType] = reading.value;
        }
        return latest;
    }, [telemetry]);

    if (metrics.length === 0) return null;

    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {metrics.map((metric) => {
                const raw = live?.[metric.key] ?? lastSaved[metric.key] ?? null;
                const numeric = raw === null ? null : Number(raw);
                const value = numeric === null || Number.isNaN(numeric) ? null : numeric;

                return (
                    <MetricGauge
                        key={metric.key}
                        label={metric.label}
                        unit={metric.unit}
                        value={value}
                        min={metric.min}
                        max={metric.max}
                        color={metric.color}
                    />
                );
            })}
        </div>
    );
}
