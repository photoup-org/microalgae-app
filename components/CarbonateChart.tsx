"use client";

import { useMemo } from "react";
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
import { FlaskConical } from "lucide-react";
import { carbonateFromPh, DEFAULT_MEDIUM, MediumAssumptions } from "@/lib/carbonate";
import { MAX_CHART_POINTS } from "@/lib/experiment-defaults";
import { SensorReading } from "@/lib/types";

interface CarbonateChartProps {
    telemetry: SensorReading[];
    /** Enabled sensor channels for this device. Both ph and temp are required. */
    enabledMetrics: string[];
    /** Assumed until alkalinity is titrated - see lib/carbonate.ts. */
    medium?: MediumAssumptions;
}

interface Row {
    time: number;
    label: string;
    co2?: number;
    dic?: number;
}

/**
 * Dissolved CO2 and total inorganic carbon, derived from pH.
 *
 * A placeholder in the sense that its alkalinity is assumed rather than measured,
 * but not in the sense that the maths is fake: it runs the real Lueker/Weiss
 * equilibrium equations, and swapping the assumed alkalinity for a titrated value
 * changes one input. See lib/carbonate.ts.
 *
 * Derived from the telemetry the page already fetched - no second InfluxDB query.
 * There is deliberately no live tail: the inputs are two channels that have to be
 * paired at the same instant, and pairing a 1 Hz live stream would produce a line
 * that moves faster than the chemistry it describes.
 */
export function CarbonateChart({ telemetry, enabledMetrics, medium = DEFAULT_MEDIUM }: CarbonateChartProps) {
    const rows = useMemo(() => buildRows(telemetry, medium), [telemetry, medium]);

    // Both channels are required, and the requirement is already declared in
    // REACTOR_SCHEMA (ph.requires = ["temp"]) for the same reason: pH without
    // temperature cannot be compensated, let alone speciated.
    if (!enabledMetrics.includes("ph") || !enabledMetrics.includes("temp")) return null;

    return (
        <section className="rounded-lg border border-border bg-surface p-5">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">Carbono dissolvido (estimado)</h3>
                <span className="gauge-label text-muted-foreground">
                    Derivado do pH
                </span>
            </div>

            {/* States the assumption on the chart itself. Someone reading mg/L off a
                plot will not go looking for a caveat in a source file. */}
            <p className="mb-4 flex items-start gap-1.5 text-xs text-muted-foreground">
                <FlaskConical className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                    Estimativa a partir do pH e da temperatura, assumindo alcalinidade total de{" "}
                    <span className="tabular text-foreground">{medium.totalAlkalinity} µmol/kg</span> e salinidade{" "}
                    <span className="tabular text-foreground">{medium.salinity}</span>. Não é uma medição — os valores
                    mudarão quando a alcalinidade for determinada experimentalmente.
                </span>
            </p>

            {rows.length < 2 ? (
                <p className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    Sem leituras de pH e temperatura suficientes para estimar.
                </p>
            ) : (
                <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" minTickGap={40} />
                            <YAxis
                                yAxisId="co2"
                                tick={{ fontSize: 11 }}
                                stroke="var(--metric-co2)"
                                width={52}
                                label={{ value: "mg/L", angle: -90, position: "insideLeft", fontSize: 10 }}
                            />
                            <YAxis yAxisId="dic" orientation="right" tick={{ fontSize: 11 }} stroke="var(--metric-ph)" width={52} />
                            <Tooltip
                                contentStyle={{
                                    background: "var(--surface)",
                                    border: "1px solid var(--border)",
                                    borderRadius: 8,
                                    fontSize: 12,
                                }}
                                labelFormatter={(label, payload) => {
                                    const time = payload?.[0]?.payload?.time;
                                    return typeof time === "number" ? format(time, "dd/MM/yyyy HH:mm:ss") : String(label);
                                }}
                                // Dissolved CO2 sits under 1 mg/L at culture pH, so it
                                // needs more decimals than total carbon does.
                                formatter={(value, name) => [
                                    typeof value === "number"
                                        ? value.toFixed(name === "CO₂ dissolvido" ? 3 : 1)
                                        : String(value),
                                    String(name),
                                ]}
                            />
                            <Line
                                yAxisId="co2"
                                type="monotone"
                                dataKey="co2"
                                name="CO₂ dissolvido"
                                stroke="var(--metric-co2)"
                                strokeWidth={2}
                                dot={{ r: 2, fill: "var(--metric-co2)", strokeWidth: 0 }}
                                isAnimationActive={false}
                                connectNulls={false}
                            />
                            <Line
                                yAxisId="dic"
                                type="monotone"
                                dataKey="dic"
                                name="Carbono total"
                                stroke="var(--metric-ph)"
                                strokeWidth={2}
                                strokeDasharray="4 3"
                                dot={{ r: 2, fill: "var(--metric-ph)", strokeWidth: 0 }}
                                isAnimationActive={false}
                                connectNulls={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </section>
    );
}

/**
 * Pairs pH with the temperature reading at the same instant, then speciates.
 *
 * Only exact timestamp matches are used. The two channels come from one node in
 * one payload, so they share an instant by construction; interpolating instead
 * would invent input data for a calculation whose output already carries enough
 * assumption.
 */
function buildRows(telemetry: SensorReading[], medium: MediumAssumptions): Row[] {
    const paired = new Map<number, { ph?: number; temp?: number }>();

    for (const reading of telemetry) {
        if (reading.metricType !== "ph" && reading.metricType !== "temp") continue;
        const time = new Date(reading.timestamp).getTime();
        if (Number.isNaN(time)) continue;

        const entry = paired.get(time) ?? {};
        entry[reading.metricType as "ph" | "temp"] = reading.value;
        paired.set(time, entry);
    }

    const rows: Row[] = [];
    for (const [time, { ph, temp }] of [...paired.entries()].sort((a, b) => a[0] - b[0])) {
        if (ph === undefined || temp === undefined) continue;

        const result = carbonateFromPh(ph, temp, medium);
        if (!result) continue;

        rows.push({
            time,
            label: format(time, "HH:mm:ss"),
            co2: result.dissolvedCo2MgL,
            dic: result.dicMgCL,
        });
    }

    return rows.slice(-MAX_CHART_POINTS);
}
