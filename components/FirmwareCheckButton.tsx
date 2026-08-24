"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { checkFirmwareUpdatesAction } from "@/actions/devices";
import { Button } from "@/components/ui/button";

/**
 * Triggers an immediate firmware release check on the edge worker.
 *
 * No router.refresh() afterwards: the check is asynchronous and the rollout walks
 * the fleet one node at a time, so nothing in this page changes by the time the
 * action returns. The versions arrive later, as each node republishes its
 * metadata.
 */
export function FirmwareCheckButton() {
    const [pending, startTransition] = useTransition();

    function check() {
        startTransition(async () => {
            const result = await checkFirmwareUpdatesAction();
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            toast.success("Verificação pedida. As versões atualizam à medida que os nós respondem.");
        });
    }

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={check}
            disabled={pending}
            title="Pedir ao servidor local que procure uma nova versão de firmware agora"
        >
            <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} aria-hidden />
            Verificar firmware
        </Button>
    );
}
