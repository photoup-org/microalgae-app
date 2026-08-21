import { TriangleAlert } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { REACTOR_SCHEMA, unmetRequirements } from "@/lib/reactor-schema";

interface DeviceEntry {
    id: string;
    config: unknown;
}

function deviceSensors(config: unknown): string[] {
    if (config === null || typeof config !== "object") return [];
    const sensors = (config as Record<string, unknown>).sensors;
    return Array.isArray(sensors) ? sensors.filter((s): s is string => typeof s === "string") : [];
}

/** Which metric channels are provisioned across the fleet, and how many devices have an unmet dependency. */
export function SensorChannelsWidget({ devices }: { devices: DeviceEntry[] }) {
    const total = devices.length;
    const sensorsByDevice = devices.map((d) => deviceSensors(d.config));
    const counts = Object.fromEntries(REACTOR_SCHEMA.map((m) => [m.key, sensorsByDevice.filter((s) => s.includes(m.key)).length]));
    const gaps = sensorsByDevice.filter((s) => Object.keys(unmetRequirements(s)).length > 0).length;

    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle className="text-base">Canais de sensores</CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto">
                {total === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum dispositivo registado.</p>
                ) : (
                    <>
                        <div className="space-y-2.5">
                            {REACTOR_SCHEMA.map((metric) => {
                                const count = counts[metric.key] ?? 0;
                                const pct = total > 0 ? (count / total) * 100 : 0;
                                return (
                                    <div key={metric.key} className="space-y-1">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">{metric.label}</span>
                                            <span className="tabular font-medium">
                                                {count}/{total}
                                            </span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-muted">
                                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: metric.color }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {gaps > 0 && (
                            <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-2 py-1.5 text-xs text-warning">
                                <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                                {gaps} dispositivo{gaps !== 1 ? "s" : ""} com dependência de canal por cumprir
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
