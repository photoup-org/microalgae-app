import Link from "next/link";
import { DeviceStatus } from "@prisma/client";
import { Wrench, CalendarClock, CircleCheck } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface DeviceEntry {
    id: string;
    name: string | null;
    status: DeviceStatus;
    calibrationDueDate: Date | null;
}

function formatDate(date: Date) {
    return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Merges devices under maintenance with devices past their calibration due date into one prioritized list. */
export function AttentionNeededWidget({ devices }: { devices: DeviceEntry[] }) {
    const now = new Date();
    const entries = devices
        .map((device) => ({
            device,
            maintenance: device.status === "MAINTENANCE",
            overdue: device.calibrationDueDate !== null && device.calibrationDueDate < now,
        }))
        .filter((e) => e.maintenance || e.overdue)
        .sort((a, b) => Number(b.overdue) - Number(a.overdue));

    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle className="text-base">Atenção necessária {entries.length > 0 && `(${entries.length})`}</CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto">
                {entries.length === 0 ? (
                    <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 p-4 text-sm text-success">
                        <CircleCheck className="size-4 shrink-0" aria-hidden />
                        Nenhum dispositivo carece de atenção.
                    </div>
                ) : (
                    <div className="space-y-1">
                        {entries.map(({ device, maintenance, overdue }) => (
                            <Link
                                key={device.id}
                                href={`/devices/${device.id}`}
                                className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-medium">{device.name}</p>
                                    <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                        {maintenance && (
                                            <span className="flex items-center gap-1 text-warning">
                                                <Wrench className="size-3 shrink-0" aria-hidden />
                                                Em manutenção
                                            </span>
                                        )}
                                        {overdue && device.calibrationDueDate && (
                                            <span className="flex items-center gap-1 text-danger">
                                                <CalendarClock className="size-3 shrink-0" aria-hidden />
                                                Calibração vencida em {formatDate(device.calibrationDueDate)}
                                            </span>
                                        )}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
