"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExperimentStatus } from "@prisma/client";
import { updateExperimentLifecycleAction, deleteExperimentAction } from "@/actions/experiments";
import { Button } from "@/components/ui/button";

export function ExperimentControls({ experimentId, status }: { experimentId: string; status: ExperimentStatus }) {
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    function transition(next: ExperimentStatus) {
        startTransition(async () => {
            const result = await updateExperimentLifecycleAction(experimentId, next);
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            router.refresh();
        });
    }

    function remove() {
        startTransition(async () => {
            const result = await deleteExperimentAction(experimentId);
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            toast.success("Experiência eliminada.");
            router.back();
        });
    }

    if (status === ExperimentStatus.COMPLETED) return null;

    return (
        <div className="flex items-center gap-2">
            {status === ExperimentStatus.PLANNED && (
                <>
                    <Button size="sm" onClick={() => transition(ExperimentStatus.RUNNING)} disabled={pending}>Iniciar</Button>
                    <Button size="sm" variant="outline" onClick={remove} disabled={pending}>Eliminar</Button>
                </>
            )}
            {status === ExperimentStatus.RUNNING && (
                <>
                    <Button size="sm" variant="outline" onClick={() => transition(ExperimentStatus.PAUSED)} disabled={pending}>Pausar</Button>
                    <Button size="sm" variant="destructive" onClick={() => transition(ExperimentStatus.COMPLETED)} disabled={pending}>Terminar</Button>
                </>
            )}
            {status === ExperimentStatus.PAUSED && (
                <>
                    <Button size="sm" onClick={() => transition(ExperimentStatus.RUNNING)} disabled={pending}>Retomar</Button>
                    <Button size="sm" variant="destructive" onClick={() => transition(ExperimentStatus.COMPLETED)} disabled={pending}>Terminar</Button>
                </>
            )}
        </div>
    );
}
