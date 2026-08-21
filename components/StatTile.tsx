import { cn } from "@/lib/utils";

interface StatTileProps {
    label: string;
    value: React.ReactNode;
    accent?: string;
    className?: string;
}

/** Console-style summary tile: tracked caption, mono readout, colored accent bar. Pairs with MetricGauge. */
export function StatTile({ label, value, accent = "var(--brand)", className }: StatTileProps) {
    return (
        <div className={cn("relative overflow-hidden rounded-md border border-border bg-surface p-4", className)}>
            <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: accent }} aria-hidden />
            <p className="gauge-label pl-2 text-muted-foreground">{label}</p>
            <p className="tabular mt-1.5 pl-2 text-3xl leading-none font-semibold">{value}</p>
        </div>
    );
}
