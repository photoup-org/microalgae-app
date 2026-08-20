"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { resyncExperimentsAction } from "@/actions/experiments";
import { Button } from "@/components/ui/button";

/**
 * Re-announces every running experiment to the edge worker.
 *
 * The worker keeps its experiment buffers in memory, so after it restarts it
 * stops writing telemetry to InfluxDB even though the experiments are still
 * RUNNING in Postgres. Live values keep flowing, which makes the gap easy to
 * miss - this is the repair.
 */
export function ResyncButton() {
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    function resync() {
        startTransition(async () => {
            const result = await resyncExperimentsAction();
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            toast.success(
                result.data?.synced
                    ? `${result.data.synced} experiência(s) re-sincronizada(s).`
                    : "Nenhuma experiência em curso para sincronizar."
            );
            router.refresh();
        });
    }

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={resync}
            disabled={pending}
            title="Re-anunciar as experiências em curso ao servidor local após um reinício"
        >
            <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} aria-hidden />
            Re-sincronizar
        </Button>
    );
}
