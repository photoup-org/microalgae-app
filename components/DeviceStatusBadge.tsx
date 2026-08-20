import { DeviceStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

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

export function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
    return <Badge variant={VARIANTS[status]}>{LABELS[status]}</Badge>;
}
