"use client";

import { DeviceStatus } from "@prisma/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useMqttStore } from "@/hooks/useMqttStore";

const SLICES = [
    { key: "active", label: "Ativo", color: "var(--brand)" },
    { key: "maintenance", label: "Manutenção", color: "var(--warning)" },
    { key: "offline", label: "Offline", color: "var(--muted-foreground)" },
] as const;

interface DeviceEntry {
    status: DeviceStatus;
    serialNumber: string;
}

/** Device status breakdown across the department's whole registered fleet - a persisted ACTIVE device whose retained MQTT status reports offline counts as Offline, not Ativo. */
export function InventoryDonut({ devices }: { devices: DeviceEntry[] }) {
    const liveStatus = useMqttStore((s) => s.deviceStatus);

    function sliceKey(device: DeviceEntry): (typeof SLICES)[number]["key"] {
        if (device.status === "MAINTENANCE") return "maintenance";
        if (device.status === "ACTIVE" && liveStatus[device.serialNumber] !== "offline") return "active";
        return "offline";
    }

    const total = devices.length;
    const counts = SLICES.map((slice) => devices.filter((d) => sliceKey(d) === slice.key).length);

    let cursor = 0;
    const stops = counts.map((count, i) => {
        const start = cursor;
        const pct = total > 0 ? (count / total) * 100 : 0;
        cursor += pct;
        return `${SLICES[i].color} ${start}% ${cursor}%`;
    });

    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle className="text-base">Inventário</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 items-center gap-6">
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
