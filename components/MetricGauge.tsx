import { cn } from "@/lib/utils";

interface MetricGaugeProps {
    label: string;
    unit: string;
    value: number | null;
    min: number;
    max: number;
    color: string;
    /** Recent values, oldest first, drawn as a trace behind the reading. Fewer than two draws none. */
    series?: number[];
    className?: string;
}

const TRACE_W = 120;
const TRACE_H = 32;

/**
 * Scaled to the series' own spread, not the safe range: a reactor holding pH 7.1
 * would otherwise draw a flat line, and the drift an operator watches for is
 * exactly the small movement inside the range.
 */
function tracePath(series: number[]): string {
    const lo = Math.min(...series);
    const hi = Math.max(...series);
    const span = hi - lo || 1;
    return series
        .map((v, i) => {
            const x = (i / (series.length - 1)) * TRACE_W;
            const y = TRACE_H - 2 - ((v - lo) / span) * (TRACE_H - 4);
            return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
}

/**
 * One instrument readout: caption, a large tabular numeral, a trace of the last
 * few minutes in the channel's own hue, and a level bar showing where the value
 * sits in its safe range. Reused on the dashboard, device and experiment pages so
 * a reading always looks like it came off the same rig.
 */
export function MetricGauge({ label, unit, value, min, max, color, series, className }: MetricGaugeProps) {
    const pct = value === null ? null : Math.min(1, Math.max(0, (value - min) / (max - min)));
    const trace = series && series.length >= 2 ? tracePath(series) : null;

    return (
        <div className={cn("rounded-lg border border-border bg-surface p-3.5", className)}>
            <div className="flex items-baseline justify-between gap-2">
                <p className="gauge-label text-muted-foreground">{label}</p>
                {unit && <p className="text-xs text-muted-foreground">{unit}</p>}
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
                <p className="tabular text-2xl leading-none font-semibold" style={{ color }}>
                    {value === null ? "—" : value.toFixed(2)}
                </p>
                {trace && (
                    <svg
                        viewBox={`0 0 ${TRACE_W} ${TRACE_H}`}
                        className="h-8 w-24 shrink-0 overflow-visible"
                        preserveAspectRatio="none"
                        aria-hidden
                    >
                        <path d={trace} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                    </svg>
                )}
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                {pct !== null && (
                    <div
                        className="h-full rounded-full transition-[width] motion-reduce:transition-none"
                        style={{ width: `${pct * 100}%`, backgroundColor: color }}
                    />
                )}
            </div>
        </div>
    );
}
