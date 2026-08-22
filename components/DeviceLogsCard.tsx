"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { getDeviceLogsAction } from "@/actions/devices";
import { DEVICE_LOG_LIMITS } from "@/lib/device-log-limits";
import { LogsCard, type LogCardEntry } from "@/components/LogsCard";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

/**
 * Device alert card with a count selector.
 *
 * Refetches through a server action rather than router.refresh() so changing the
 * count re-runs one query instead of the whole route - the page also holds an
 * InfluxDB-free live chart and a calibration table that have no reason to
 * re-render because someone asked for five more log lines.
 */
export function DeviceLogsCard({
    deviceId,
    initialLogs,
    initialLimit,
}: {
    deviceId: string;
    initialLogs: LogCardEntry[];
    initialLimit: number;
}) {
    const [logs, setLogs] = useState(initialLogs);
    const [limit, setLimit] = useState(initialLimit);
    const [pending, startTransition] = useTransition();

    function changeLimit(next: string) {
        const parsed = Number(next);
        setLimit(parsed);
        startTransition(async () => {
            const result = await getDeviceLogsAction(deviceId, parsed);
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            setLogs(result.data ?? []);
        });
    }

    return (
        <LogsCard
            title="Alertas do dispositivo"
            emptyMessage="Sem alertas para este dispositivo."
            logs={logs}
            action={
                <Select value={String(limit)} onValueChange={changeLimit} disabled={pending}>
                    <SelectTrigger size="sm" className="w-24" aria-label="Número de alertas a mostrar">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                        {DEVICE_LOG_LIMITS.map((count) => (
                            <SelectItem key={count} value={String(count)}>
                                {count}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            }
        />
    );
}
