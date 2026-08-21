import { cn } from "@/lib/utils";

interface MetricGaugeProps {
    label: string;
    unit: string;
    value: number | null;
    min: number;
    max: number;
    color: string;
    className?: string;
}

/**
 * One instrument-panel readout: a tracked caption, a large tabular numeral,
 * and a level bar showing where the value sits in its safe range - the
 * signature element reused across the dashboard, device, and experiment
 * pages so a reading always looks like it came off the same rig.
 */
export function MetricGauge({ label, unit, value, min, max, color, className }: MetricGaugeProps) {
    const pct = value === null ? null : Math.min(1, Math.max(0, (value - min) / (max - min)));

    return (
        <div className={cn("rounded-md border border-border bg-surface p-3.5", className)}>
            <p className="gauge-label text-muted-foreground">
                {label}
                {unit && <span className="ml-1 normal-case">({unit})</span>}
            </p>
            <p className="tabular mt-1.5 text-2xl leading-none font-semibold" style={{ color }}>
                {value === null ? "—" : value.toFixed(2)}
            </p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                {pct !== null && (
                    <div
                        className="h-full rounded-full transition-[width]"
                        style={{ width: `${pct * 100}%`, backgroundColor: color }}
                    />
                )}
            </div>
        </div>
    );
}
