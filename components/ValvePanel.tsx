"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Wind } from "lucide-react";
import { setValveAction } from "@/actions/reactors";
import { useMqttStore } from "@/hooks/useMqttStore";
import { VALVE_METRIC } from "@/lib/reactor-schema";

interface ValvePanelProps {
    deviceId: string;
    serialNumber: string;
    /** Last commanded state from Device.config, for the server-rendered first paint. */
    initialOpen: boolean;
}

/** How long telemetry may be silent before the reported state is treated as stale. */
const STALE_AFTER_MS = 30_000;

/**
 * Manual control of the CO2 electrovalve.
 *
 * Three distinct states, deliberately not collapsed into one boolean:
 *  - commanded: what we last asked for (optimistic, from the Server Action)
 *  - confirmed: what the node reports via the valve_open telemetry channel
 *  - stale: no telemetry recently, so "confirmed" is not trustworthy
 *
 * A command is fire-and-forget over MQTT with no ack, so showing the commanded
 * value as though it were reality would be a lie. Divergence is surfaced instead.
 */
export function ValvePanel({ deviceId, serialNumber, initialOpen }: ValvePanelProps) {
    const [commanded, setCommanded] = useState(initialOpen);
    const [pending, startTransition] = useTransition();
    const [lastSeen, setLastSeen] = useState<number | null>(null);
    const [isStale, setIsStale] = useState(false);

    const live = useMqttStore((s) => s.liveValues[serialNumber]);
    const reported = live?.[VALVE_METRIC];
    const confirmed = reported === undefined || reported === null ? null : Number(reported) === 1;

    useEffect(() => {
        if (confirmed !== null) setLastSeen(Date.now());
    }, [confirmed, live]);

    // Staleness is time-based, so it needs a tick rather than only re-evaluating
    // when a message happens to arrive.
    useEffect(() => {
        const id = setInterval(() => {
            setIsStale(lastSeen !== null && Date.now() - lastSeen > STALE_AFTER_MS);
        }, 5000);
        return () => clearInterval(id);
    }, [lastSeen]);

    function toggle(next: boolean) {
        setCommanded(next);

        startTransition(async () => {
            const result = await setValveAction(deviceId, next);

            if (!result.success) {
                setCommanded(!next); // roll back the optimistic flip
                toast.error(result.error);
                return;
            }

            toast.success(next ? "Comando enviado: abrir válvula." : "Comando enviado: fechar válvula.");
        });
    }

    const diverged = confirmed !== null && !isStale && confirmed !== commanded && !pending;

    return (
        <section className="rounded-lg border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Wind className="h-5 w-5 text-accent" aria-hidden />
                    <div>
                        <h2 className="font-medium">Válvula de CO2</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            <ValveStatusText
                                confirmed={confirmed}
                                isStale={isStale}
                                pending={pending}
                            />
                        </p>
                    </div>
                </div>

                <button
                    role="switch"
                    aria-checked={commanded}
                    aria-label="Abrir ou fechar a válvula de CO2"
                    disabled={pending}
                    onClick={() => toggle(!commanded)}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                        commanded ? "bg-accent" : "bg-surface-muted border border-border"
                    }`}
                >
                    <span
                        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                            commanded ? "translate-x-6" : "translate-x-1"
                        }`}
                    />
                </button>
            </div>

            {diverged && (
                <p className="mt-4 rounded-md bg-surface-muted p-3 text-xs text-warning">
                    O nó reporta a válvula {confirmed ? "aberta" : "fechada"}, mas o último
                    comando foi {commanded ? "abrir" : "fechar"}. O comando pode não ter
                    chegado ao dispositivo.
                </p>
            )}
        </section>
    );
}

function ValveStatusText({
    confirmed,
    isStale,
    pending,
}: {
    confirmed: boolean | null;
    isStale: boolean;
    pending: boolean;
}) {
    if (pending) return <>A enviar comando…</>;
    if (confirmed === null) return <>Sem confirmação do dispositivo</>;
    if (isStale) return <>Sem telemetria recente — estado não confirmado</>;
    return <>Confirmado pelo dispositivo: {confirmed ? "aberta" : "fechada"}</>;
}
