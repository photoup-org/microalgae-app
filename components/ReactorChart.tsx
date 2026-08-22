"use client";

import { useEffect, useMemo, useState } from "react";
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
import { getExperimentTelemetryAction } from "@/actions/experiments";
import { useMqttStore } from "@/hooks/useMqttStore";
import { REACTOR_SCHEMA, SchemaItem } from "@/lib/reactor-schema";
import { SensorReading } from "@/lib/types";

interface ReactorChartProps {
    /** Hardware id, which is how the live store keys devices. */
    serialNumber: string;
    /** Server-fetched history from InfluxDB - the recorded series. */
    telemetry: SensorReading[];
    /** Channels this reactor was provisioned with. Empty means all. */
    enabledMetrics: string[];
    /**
     * Whether to draw the live MQTT stream at all. Defaults to true for the
     * standalone device page. The experiment page passes
     * `experiment.status === "RUNNING"` - live telemetry flows independent of any
     * experiment (see CLAUDE.md), so without this an experiment chart keeps
     * plotting after it's stopped, or shows points before it's ever started.
     */
    live?: boolean;
    /**
     * Experiment this chart belongs to. Together with `dbInterval` it turns on
     * polling of the recorded series; omit both on the standalone device page,
     * which has no experiment to scope a query to.
     */
    experimentId?: string;
    /**
     * The experiment's storage frequency in seconds. The recorded series is
     * re-fetched on exactly this cadence, so a point appears as soon as the worker
     * writes it instead of the line sitting frozen until a manual reload.
     */
    dbInterval?: number;
}

interface WideRow {
    time: number;
    label: string;
    [metric: string]: number | string;
}

const MAX_POINTS = 1000;
/** Suffix for the not-yet-recorded companion series of each metric. */
const LIVE_SUFFIX = "__live";
/** Dots stop being readable past this many recorded points. */
const MAX_DOTTED_POINTS = 150;

/**
 * All four channels on one time axis.
 *
 * The four metrics have incompatible ranges (pH 0-14, °C 0-50, NTU 0-100,
 * ppm 0-2000), so each gets its OWN Y axis and is scaled independently. Drawing
 * four axis gutters would eat the plot, so only the two leading visible metrics
 * render their axis; the rest stay hidden but still scale their line correctly.
 *
 * Two series per metric, deliberately: the solid line is what InfluxDB actually
 * holds (one point per acquisition interval), and the faded dashed line is only
 * the live tail past the newest recorded point - readings the worker has not
 * flushed yet. That keeps the experiment chart a picture of the record rather
 * than of the 1s live stream, while still moving between flushes so a running
 * reactor never looks dead. The gauges above already carry the 1s liveness duty.
 */
export function ReactorChart({
    serialNumber,
    telemetry,
    enabledMetrics,
    live: liveEnabled = true,
    experimentId,
    dbInterval,
}: ReactorChartProps) {
    const available = useMemo(
        () =>
            REACTOR_SCHEMA.filter(
                (m) => enabledMetrics.length === 0 || enabledMetrics.includes(m.key)
            ),
        [enabledMetrics]
    );

    const [visible, setVisible] = useState<Set<string>>(() => new Set(available.map((m) => m.key)));
    const chartSeries = useMqttStore((s) => s.chartSeries[serialNumber]);
    const liveSeries = liveEnabled ? chartSeries : undefined;

    const shown = available.filter((m) => visible.has(m.key));

    // Polling advances the recorded series between server renders; the prop stays
    // the source of truth, so a real render (navigation, status change) resets to
    // it. Adjusting state during render is React's documented pattern for this -
    // an effect would paint one frame of stale data first.
    const [recorded, setRecorded] = useState(telemetry);
    const [lastProp, setLastProp] = useState(telemetry);
    if (telemetry !== lastProp) {
        setLastProp(telemetry);
        setRecorded(telemetry);
    }

    useEffect(() => {
        if (!liveEnabled || !experimentId || !dbInterval) return;

        let cancelled = false;
        const id = setInterval(async () => {
            const result = await getExperimentTelemetryAction(experimentId, serialNumber);
            if (!cancelled && result.success && result.data) setRecorded(result.data);
        }, dbInterval * 1000);

        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [liveEnabled, experimentId, dbInterval, serialNumber]);

    const { rows, savedCount, hasLiveTail } = useMemo(
        () => buildRows(recorded, liveSeries ?? [], shown),
        [recorded, liveSeries, shown]
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

    const showDots = savedCount > 0 && savedCount <= MAX_DOTTED_POINTS;

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

                {dbInterval !== undefined && (
                    <span className="gauge-label ml-auto shrink-0 text-muted-foreground" title="Frequência com que os dados são gravados na base de dados">
                        Gravação: <span className="tabular text-foreground">{dbInterval}s</span>
                    </span>
                )}
            </div>

            {rows.length < 2 ? (
                <EmptyPlot />
            ) : (
                <>
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
                                        const raw = String(name);
                                        const isLive = raw.endsWith(LIVE_SUFFIX);
                                        const key = isLive ? raw.slice(0, -LIVE_SUFFIX.length) : raw;
                                        const metric = REACTOR_SCHEMA.find((m) => m.key === key);
                                        const numeric = Number(value);
                                        const text = Number.isNaN(numeric) ? "—" : numeric.toFixed(2);

                                        return [
                                            `${text}${metric?.unit ? ` ${metric.unit}` : ""}`,
                                            `${metric?.label ?? key}${isLive ? " (por gravar)" : ""}`,
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
                                        dot={showDots ? { r: 2, fill: metric.color, strokeWidth: 0 } : false}
                                        // A dropped channel leaves a gap rather than a
                                        // straight line through missing data.
                                        connectNulls={false}
                                        isAnimationActive={false}
                                    />
                                ))}
                                {shown.map((metric) => (
                                    <Line
                                        key={`${metric.key}${LIVE_SUFFIX}`}
                                        yAxisId={metric.key}
                                        type="monotone"
                                        dataKey={`${metric.key}${LIVE_SUFFIX}`}
                                        stroke={metric.color}
                                        strokeOpacity={0.3}
                                        strokeWidth={1.5}
                                        strokeDasharray="4 3"
                                        dot={false}
                                        connectNulls={false}
                                        isAnimationActive={false}
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    {hasLiveTail && (
                        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="inline-block h-0 w-6 border-t-2 border-dashed border-muted-foreground/40" aria-hidden />
                            Tracejado: leituras em direto ainda por gravar na base de dados.
                        </p>
                    )}
                </>
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
 * Pivots long-form readings into the wide rows recharts wants, keeping the
 * recorded series and the not-yet-recorded live tail as separate keys.
 *
 * Only live points NEWER than the newest recorded point become the tail. Drawing
 * the whole live buffer faded would double every line, since after each flush the
 * same instants exist in both sources. The newest recorded row also carries the
 * live key so the dashed tail starts where the solid line ends instead of
 * floating detached.
 *
 * Rows are keyed by exact timestamp so a metric arriving twice at one instant
 * does not create a flat step, and sorted by time rather than trusting arrival
 * order.
 */
function buildRows(
    historical: SensorReading[],
    live: SensorReading[],
    metrics: SchemaItem[]
): { rows: WideRow[]; savedCount: number; hasLiveTail: boolean } {
    const wanted = new Set(metrics.map((m) => m.key));
    const byTime = new Map<number, WideRow>();
    const savedTimes = new Set<number>();

    function rowAt(time: number): WideRow {
        let row = byTime.get(time);
        if (!row) {
            row = { time, label: format(time, "HH:mm:ss") };
            byTime.set(time, row);
        }
        return row;
    }

    let newestSaved = -Infinity;
    for (const reading of historical) {
        const time = new Date(reading.timestamp).getTime();
        if (!Number.isNaN(time) && time > newestSaved) newestSaved = time;
    }

    for (const reading of historical) {
        if (!wanted.has(reading.metricType)) continue;
        const time = new Date(reading.timestamp).getTime();
        if (Number.isNaN(time)) continue;

        const row = rowAt(time);
        row[reading.metricType] = reading.value;
        savedTimes.add(time);
        if (time === newestSaved) row[`${reading.metricType}${LIVE_SUFFIX}`] = reading.value;
    }

    let hasLiveTail = false;
    for (const reading of live) {
        if (!wanted.has(reading.metricType)) continue;
        const time = new Date(reading.timestamp).getTime();
        if (Number.isNaN(time) || time <= newestSaved) continue;

        rowAt(time)[`${reading.metricType}${LIVE_SUFFIX}`] = reading.value;
        hasLiveTail = true;
    }

    const rows = [...byTime.values()].sort((a, b) => a.time - b.time).slice(-MAX_POINTS);
    return {
        rows,
        savedCount: rows.filter((r) => savedTimes.has(r.time)).length,
        hasLiveTail,
    };
}
