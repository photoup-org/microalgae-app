"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pause, Square } from "lucide-react";
import { ExperimentStatus } from "@prisma/client";
import { updateExperimentLifecycleAction } from "@/actions/experiments";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";

/**
 * Pause / terminate straight from the dashboard's running-experiments row, for
 * the common "stop that run" case that otherwise costs a page navigation.
 *
 * Terminating asks first - unlike the experiment page's own button, this one sits
 * one careless click away from a link, and COMPLETED is terminal (see
 * ExperimentControls, which renders nothing for it: there is no way back).
 * Pausing is reversible, so it fires immediately.
 */
export function ExperimentQuickControls({ experimentId, name }: { experimentId: string; name: string }) {
    const [stopOpen, setStopOpen] = useState(false);
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    function transition(next: ExperimentStatus) {
        startTransition(async () => {
            const result = await updateExperimentLifecycleAction(experimentId, next);
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            toast.success(next === ExperimentStatus.PAUSED ? "Experiência pausada." : "Experiência terminada.");
            setStopOpen(false);
            router.refresh();
        });
    }

    return (
        <>
            <Button
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                title="Pausar"
                aria-label={`Pausar ${name}`}
                onClick={() => transition(ExperimentStatus.PAUSED)}
            >
                <Pause className="size-4" aria-hidden />
            </Button>
            <Button
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                title="Terminar"
                aria-label={`Terminar ${name}`}
                className="text-danger hover:text-danger"
                onClick={() => setStopOpen(true)}
            >
                <Square className="size-4" aria-hidden />
            </Button>

            <ConfirmDialog
                open={stopOpen}
                onOpenChange={setStopOpen}
                title={`Terminar "${name}"?`}
                description="A experiência é concluída e deixa de poder ser retomada."
                confirmLabel="Terminar"
                pending={pending}
                onConfirm={() => transition(ExperimentStatus.COMPLETED)}
            />
        </>
    );
}
