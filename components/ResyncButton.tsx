"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { resyncReactorsAction } from "@/actions/reactors";

/**
 * Re-announces every running reactor to the edge worker.
 *
 * The worker keeps its experiment buffers in memory, so after it restarts it stops
 * writing telemetry to InfluxDB even though the experiments are still RUNNING in
 * Postgres. Live values keep flowing, which makes the gap easy to miss — this is
 * the repair.
 */
export function ResyncButton() {
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    function resync() {
        startTransition(async () => {
            const result = await resyncReactorsAction();

            if (!result.success) {
                toast.error(result.error);
                return;
            }

            toast.success(
                result.data?.synced
                    ? `${result.data.synced} dispositivo(s) re-sincronizado(s).`
                    : "Nenhum dispositivo para sincronizar."
            );
            router.refresh();
        });
    }

    return (
        <button
            onClick={resync}
            disabled={pending}
            title="Re-anunciar os reatores ao servidor local após um reinício"
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-muted disabled:opacity-50"
        >
            <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} aria-hidden />
            Re-sincronizar
        </button>
    );
}
