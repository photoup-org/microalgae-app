"use client";

import { useMqttStore } from "@/hooks/useMqttStore";
import { isDeviceOnline } from "@/lib/device-status";

/** Counts devices whose retained nodes/{id}/status LWT topic reports "online". */
export function DeviceOnlineSummary({ devices }: { devices: { serialNumber: string }[] }) {
    const status = useMqttStore((s) => s.deviceStatus);
    const online = devices.filter((d) => isDeviceOnline(d, status)).length;

    return (
        <>
            {online}
            <span className="text-lg font-normal text-muted-foreground"> / {devices.length}</span>
        </>
    );
}
