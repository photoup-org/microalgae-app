"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { LogLevel } from "@prisma/client";
import { acknowledgeIncidentAction, acknowledgeAllIncidentsAction } from "@/actions/incidents";
import { Button } from "@/components/ui/button";

/**
 * Closes one incident.
 *
 * Acknowledging is not dismissing: it ends the deduplication group, so if the
 * condition recurs a new row opens instead of silently incrementing this one. The
 * title text says so, because "reconhecer" on its own reads like "hide".
 */
export function AcknowledgeButton({ logId }: { logId: string }) {
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    function acknowledge() {
        startTransition(async () => {
            const result = await acknowledgeIncidentAction(logId);
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            router.refresh();
        });
    }

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={acknowledge}
            disabled={pending}
            aria-label="Reconhecer incidente"
            title="Marcar como tratado. Se voltar a acontecer, abre um novo incidente."
        >
            <Check className="size-4" aria-hidden />
        </Button>
    );
}

/** Acknowledges every open incident under the level filter currently applied. */
export function AcknowledgeAllButton({ levels, openCount }: { levels: LogLevel[]; openCount: number }) {
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    function acknowledgeAll() {
        startTransition(async () => {
            const result = await acknowledgeAllIncidentsAction(levels);
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            toast.success(`${result.data ?? 0} incidente(s) reconhecido(s).`);
            router.refresh();
        });
    }

    return (
        <Button variant="outline" size="sm" onClick={acknowledgeAll} disabled={pending || openCount === 0}>
            <Check className="size-4" aria-hidden />
            Reconhecer {openCount}
        </Button>
    );
}
