"use client";

import Link from "next/link";
import { DeviceStatus } from "@prisma/client";
import { Droplets } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DeviceStatusBadge } from "@/components/DeviceStatusBadge";
import { Badge } from "@/components/ui/badge";
import { useMqttStore } from "@/hooks/useMqttStore";
import { isDeviceOnline } from "@/lib/device-status";

interface DeviceEntry {
    id: string;
    name: string | null;
    serialNumber: string;
    status: DeviceStatus;
}

/** Every reactor node registered to this department, regardless of project assignment. */
export function DeviceListWidget({ devices }: { devices: DeviceEntry[] }) {
    const liveStatus = useMqttStore((s) => s.deviceStatus);
    const online = devices.filter((d) => isDeviceOnline(d, liveStatus)).length;

    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle className="text-base">
                    Sensores Online ({online}/{devices.length})
                </CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                {devices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum dispositivo registado.</p>
                ) : (
                    devices.slice(0, 5).map((device) => {
                        const offline = device.status === "ACTIVE" && !isDeviceOnline(device, liveStatus);
                        return (
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
                                {offline ? <Badge variant="secondary">Offline</Badge> : <DeviceStatusBadge status={device.status} />}
                            </Link>
                        );
                    })
                )}
            </CardContent>
        </Card>
    );
}
