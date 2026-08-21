import { ExperimentStatus } from "@prisma/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const SLICES: { status: ExperimentStatus; label: string; color: string }[] = [
    { status: "RUNNING", label: "Em curso", color: "var(--brand)" },
    { status: "PLANNED", label: "Planeada", color: "var(--muted-foreground)" },
    { status: "PAUSED", label: "Pausada", color: "var(--warning)" },
    { status: "COMPLETED", label: "Concluída", color: "var(--success)" },
];

/** Experiment status breakdown across every project in the department. */
export function ExperimentStatusDonut({ counts }: { counts: Partial<Record<ExperimentStatus, number>> }) {
    const total = SLICES.reduce((sum, slice) => sum + (counts[slice.status] ?? 0), 0);

    let cursor = 0;
    const stops = SLICES.map((slice) => {
        const start = cursor;
        const pct = total > 0 ? ((counts[slice.status] ?? 0) / total) * 100 : 0;
        cursor += pct;
        return `${slice.color} ${start}% ${cursor}%`;
    });

    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle className="text-base">Experiências por estado</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 items-center gap-6">
                <div className="relative size-28 shrink-0 rounded-full" style={{ background: total > 0 ? `conic-gradient(${stops.join(", ")})` : "var(--border)" }}>
                    <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-surface">
                        <span className="tabular text-2xl font-semibold">{total}</span>
                        <span className="gauge-label text-muted-foreground">Total</span>
                    </div>
                </div>
                <div className="space-y-1.5">
                    {SLICES.map((slice) => (
                        <div key={slice.status} className="flex items-center gap-2 text-sm">
                            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} aria-hidden />
                            <span className="text-muted-foreground">{slice.label}</span>
                            <span className="tabular font-medium">{counts[slice.status] ?? 0}</span>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
