import { ExperimentStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

const LABELS: Record<ExperimentStatus, string> = {
    PLANNED: "Planeada",
    RUNNING: "Em curso",
    PAUSED: "Pausada",
    COMPLETED: "Concluída",
};

const VARIANTS: Record<ExperimentStatus, "default" | "secondary" | "destructive" | "outline"> = {
    PLANNED: "outline",
    RUNNING: "default",
    PAUSED: "secondary",
    COMPLETED: "secondary",
};

export function ExperimentStatusBadge({ status }: { status: ExperimentStatus }) {
    return <Badge variant={VARIANTS[status]}>{LABELS[status]}</Badge>;
}
