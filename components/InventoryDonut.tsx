import { DeviceStatus } from "@prisma/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const SLICES: { statuses: DeviceStatus[]; label: string; color: string }[] = [
    { statuses: ["ACTIVE"], label: "Ativo", color: "var(--brand)" },
    { statuses: ["MAINTENANCE"], label: "Manutenção", color: "var(--warning)" },
    { statuses: ["PENDING_CONNECTION", "UNCLAIMED", "DISABLED"], label: "Offline", color: "var(--muted-foreground)" },
];

/** Device status breakdown across the department's whole registered fleet. */
export function InventoryDonut({ devices }: { devices: { status: DeviceStatus }[] }) {
    const total = devices.length;
    const counts = SLICES.map((slice) => devices.filter((d) => slice.statuses.includes(d.status)).length);

    let cursor = 0;
    const stops = counts.map((count, i) => {
        const start = cursor;
        const pct = total > 0 ? (count / total) * 100 : 0;
        cursor += pct;
        return `${SLICES[i].color} ${start}% ${cursor}%`;
    });

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Inventário</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-6">
                <div className="relative size-28 shrink-0 rounded-full" style={{ background: total > 0 ? `conic-gradient(${stops.join(", ")})` : "var(--border)" }}>
                    <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-surface">
                        <span className="tabular text-2xl font-semibold">{total}</span>
                        <span className="gauge-label text-muted-foreground">Sensores</span>
                    </div>
                </div>
                <div className="space-y-1.5">
                    {SLICES.map((slice, i) => (
                        <div key={slice.label} className="flex items-center gap-2 text-sm">
                            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} aria-hidden />
                            <span className="text-muted-foreground">{slice.label}</span>
                            <span className="tabular font-medium">{counts[i]}</span>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
