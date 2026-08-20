"use client";

import { useMemo, useState } from "react";
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { format } from "date-fns";
import { useMqttStore } from "@/hooks/useMqttStore";
import { REACTOR_SCHEMA, SchemaItem } from "@/lib/reactor-schema";
import { SensorReading } from "@/lib/types";

interface ReactorChartProps {
    /** Hardware id, which is how the live store keys devices. */
    serialNumber: string;
    /** Server-fetched history from InfluxDB. */
    telemetry: SensorReading[];
    /** Channels this reactor was provisioned with. Empty means all. */
    enabledMetrics: string[];
}

interface WideRow {
    time: number;
    label: string;
    [metric: string]: number | string;
}

const MAX_POINTS = 1000;

/**
 * All four channels on one time axis.
 *
 * The four metrics have incompatible ranges (pH 0-14, °C 0-50, NTU 0-100,
 * ppm 0-2000), so each gets its OWN Y axis and is scaled independently. Drawing
 * four axis gutters would eat the plot, so only the two leading visible metrics
 * render their axis; the rest stay hidden but still scale their line correctly.
 */
export function ReactorChart({ serialNumber, telemetry, enabledMetrics }: ReactorChartProps) {
    const available = useMemo(
        () =>
            REACTOR_SCHEMA.filter(
                (m) => enabledMetrics.length === 0 || enabledMetrics.includes(m.key)
            ),
        [enabledMetrics]
    );

    const [visible, setVisible] = useState<Set<string>>(() => new Set(available.map((m) => m.key)));
    const liveSeries = useMqttStore((s) => s.chartSeries[serialNumber]);

    const shown = available.filter((m) => visible.has(m.key));

    const rows = useMemo(
        () => buildRows(telemetry, liveSeries ?? [], shown),
        [telemetry, liveSeries, shown]
    );

    function toggle(key: string) {
        setVisible((current) => {
            const next = new Set(current);
            // Keep at least one series on screen.
            if (next.has(key)) {
                if (next.size > 1) next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }

    return (
        <section className="rounded-lg border border-border bg-surface p-5">
            <div className="mb-4 flex flex-wrap items-center gap-2">
                {available.map((metric) => {
                    const isOn = visible.has(metric.key);
                    return (
                        <button
                            key={metric.key}
                            onClick={() => toggle(metric.key)}
                            aria-pressed={isOn}
                            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-opacity ${
                                isOn ? "border-border" : "border-transparent bg-surface-muted opacity-50"
                            }`}
                        >
                            <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: metric.color }}
                                aria-hidden
                            />
                            {metric.label}
                        </button>
                    );
                })}
            </div>

            {rows.length < 2 ? (
                <EmptyPlot />
            ) : (
                <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis
                                dataKey="label"
                                minTickGap={40}
                                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                                stroke="var(--border)"
                            />
                            {shown.map((metric, index) => (
                                <YAxis
                                    key={metric.key}
                                    yAxisId={metric.key}
                                    domain={[metric.min, metric.max]}
                                    orientation={index === 1 ? "right" : "left"}
                                    // Only the first two get a gutter; the others scale invisibly.
                                    hide={index > 1}
                                    width={48}
                                    tick={{ fontSize: 11, fill: metric.color }}
                                    stroke="var(--border)"
                                />
                            ))}
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: "var(--surface)",
                                    border: "1px solid var(--border)",
                                    borderRadius: "0.5rem",
                                    fontSize: "0.8rem",
                                }}
                                formatter={(value, name) => {
                                    const key = String(name);
                                    const metric = REACTOR_SCHEMA.find((m) => m.key === key);
                                    const numeric = Number(value);
                                    const shown = Number.isNaN(numeric) ? "—" : numeric.toFixed(2);

                                    return [
                                        `${shown}${metric?.unit ? ` ${metric.unit}` : ""}`,
                                        metric?.label ?? key,
                                    ];
                                }}
                            />
                            {shown.map((metric) => (
                                <Line
                                    key={metric.key}
                                    yAxisId={metric.key}
                                    type="monotone"
                                    dataKey={metric.key}
                                    stroke={metric.color}
                                    strokeWidth={2}
                                    dot={false}
                                    // A dropped channel leaves a gap rather than a
                                    // straight line through missing data.
                                    connectNulls={false}
                                    isAnimationActive={false}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </section>
    );
}

function EmptyPlot() {
    return (
        <div className="flex h-80 items-center justify-center rounded-md border border-dashed border-border">
            <p className="max-w-xs text-center text-sm text-muted-foreground">
                Ainda sem dados suficientes. Os valores aparecem assim que o nó publicar
                telemetria.
            </p>
        </div>
    );
}

/**
 * Merges server history with the live stream and pivots long-form readings into the
 * wide rows recharts wants.
 *
 * Live points can be older than the end of the fetched range, so the result is
 * sorted by time rather than trusting arrival order. Rows are keyed by exact
 * timestamp so a metric arriving twice at one instant does not create a flat step.
 */
function buildRows(
    historical: SensorReading[],
    live: SensorReading[],
    metrics: SchemaItem[]
): WideRow[] {
    const wanted = new Set(metrics.map((m) => m.key));
    const byTime = new Map<number, WideRow>();

    for (const reading of [...historical, ...live]) {
        if (!wanted.has(reading.metricType)) continue;

        const time = new Date(reading.timestamp).getTime();
        if (Number.isNaN(time)) continue;

        let row = byTime.get(time);
        if (!row) {
            row = { time, label: format(time, "HH:mm:ss") };
            byTime.set(time, row);
        }
        row[reading.metricType] = reading.value;
    }

    return [...byTime.values()].sort((a, b) => a.time - b.time).slice(-MAX_POINTS);
}
