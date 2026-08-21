import Link from "next/link";
import { DeviceStatus } from "@prisma/client";
import { Droplets } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DeviceStatusBadge } from "@/components/DeviceStatusBadge";

interface DeviceEntry {
    id: string;
    name: string | null;
    serialNumber: string;
    status: DeviceStatus;
}

/** Every reactor node registered to this department, regardless of project assignment. */
export function DeviceListWidget({ devices }: { devices: DeviceEntry[] }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Sensores Online ({devices.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
                {devices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum dispositivo registado.</p>
                ) : (
                    devices.slice(0, 5).map((device) => (
                        <Link
                            key={device.id}
                            href={`/devices/${device.id}`}
                            className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                        >
                            <Droplets className="size-4 shrink-0 text-metric-ph" aria-hidden />
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-medium">{device.name}</p>
                                <p className="tabular truncate text-xs text-muted-foreground">{device.serialNumber}</p>
                            </div>
                            <DeviceStatusBadge status={device.status} />
                        </Link>
                    ))
                )}
            </CardContent>
        </Card>
    );
}
