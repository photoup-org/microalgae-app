"use client";

import { DeviceStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { useMqttStore } from "@/hooks/useMqttStore";
import { isDeviceOnline } from "@/lib/device-status";

const LABELS: Record<DeviceStatus, string> = {
    ACTIVE: "Ativo",
    MAINTENANCE: "Manutenção",
    DISABLED: "Desativado",
    PENDING_CONNECTION: "A aguardar ligação",
    UNCLAIMED: "Não reclamado",
};

const VARIANTS: Record<DeviceStatus, "default" | "secondary" | "destructive" | "outline"> = {
    ACTIVE: "default",
    MAINTENANCE: "secondary",
    DISABLED: "destructive",
    PENDING_CONNECTION: "secondary",
    UNCLAIMED: "outline",
};

/**
 * What an operator means by a reactor's status: can I reach it right now.
 *
 * ACTIVE is only the registration state and stays ACTIVE whether or not the board
 * is powered, so showing "Ativo" beside an unplugged reactor read as "it's fine".
 * An ACTIVE device shows its live link instead; every other state is shown as is,
 * since it is the more important fact. Without a broker link there is no evidence
 * either way, which is said plainly rather than guessed (see lib/device-status.ts).
 */
export function DeviceStatusBadge({ status, serialNumber }: { status: DeviceStatus; serialNumber: string }) {
    const brokerConnected = useMqttStore((s) => s.isConnected);
    const liveStatus = useMqttStore((s) => s.deviceStatus);

    if (status !== "ACTIVE") {
        return <Badge variant={VARIANTS[status]}>{LABELS[status]}</Badge>;
    }
    if (!brokerConnected) {
        return (
            <Badge variant="outline" title="Sem ligação ao broker MQTT, por isso o estado do reator é desconhecido.">
                Estado desconhecido
            </Badge>
        );
    }
    return isDeviceOnline({ serialNumber, status }, liveStatus) ? (
        <Badge variant="default">Online</Badge>
    ) : (
        <Badge variant="secondary">Offline</Badge>
    );
}
