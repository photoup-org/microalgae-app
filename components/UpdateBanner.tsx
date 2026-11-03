"use client";

import { useState, useTransition } from "react";
import { Download, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useMqttStore } from "@/hooks/useMqttStore";
import { applyGatewayUpdateAction, countRunningExperimentsAction } from "@/actions/gateway";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";

/**
 * Tells the operator the Pi has new code waiting, and applies it only on request.
 *
 * Updates are never automatic while the Pi is on: rebuilding containers in the
 * middle of a run leaves a gap in the record, so the operator decides when. The
 * updater itself (edge-gateway-docker/tools/edge-updater) still applies pending
 * updates at boot, when no run can be in progress.
 */
export function UpdateBanner() {
    const update = useMqttStore((s) => s.edgeUpdate);
    const [confirming, setConfirming] = useState(false);
    const [running, setRunning] = useState(0);
    const [pending, startTransition] = useTransition();

    if (!update || !["available", "building", "applying", "failed"].includes(update.state)) return null;

    const repos = Object.entries(update.repos ?? {})
        .filter(([, r]) => (r.behind ?? 0) > 0)
        .map(([name, r]) => `${name} (${r.behind})`)
        .join(", ");

    const openConfirm = () =>
        startTransition(async () => {
            setRunning(await countRunningExperimentsAction());
            setConfirming(true);
        });

    const apply = () =>
        startTransition(async () => {
            const result = await applyGatewayUpdateAction();
            setConfirming(false);
            if (result.success) toast.success("Atualização pedida ao servidor edge.");
            else toast.error(result.error);
        });

    const tone = update.state === "failed" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-foreground";

    return (
        <div role="status" className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1.5 text-xs ${tone}`}>
            {update.state === "failed" ? (
                <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
            ) : update.state === "available" ? (
                <Download className="size-3.5 shrink-0" aria-hidden />
            ) : (
                <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
            )}
            <span>
                {update.state === "available" && <>Atualização disponível para o servidor edge{repos && `: ${repos}`}.</>}
                {update.state === "building" && <>Nova versão a ser compilada no GitHub — disponível dentro de minutos.</>}
                {update.state === "applying" && <>A atualizar o servidor edge… {update.message}</>}
                {update.state === "failed" && <>A atualização falhou: {update.message}</>}
            </span>
            {update.state === "available" && (
                <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={pending} onClick={openConfirm}>
                    Atualizar
                </Button>
            )}
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title="Atualizar o servidor edge?"
                description={
                    running > 0
                        ? `Há ${running} experiência(s) a decorrer. Os dados já gravados ficam intactos e o reator continua a funcionar, mas haverá uma falha de alguns segundos a poucos minutos no registo enquanto os contentores reiniciam.`
                        : "Os contentores do servidor edge vão ser reconstruídos e reiniciados. Sem experiências a decorrer, nada se perde."
                }
                confirmLabel="Atualizar agora"
                destructive={running > 0}
                pending={pending}
                onConfirm={apply}
            />
        </div>
    );
}
