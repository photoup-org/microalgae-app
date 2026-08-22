"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Wind, TriangleAlert } from "lucide-react";
import { setValveAction, setValveControlAction } from "@/actions/devices";
import { useMqttStore } from "@/hooks/useMqttStore";
import { VALVE_METRIC } from "@/lib/reactor-schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type ManualControl = { mode: "manual"; manual: { maxOpenSeconds: number } };
type AutomaticControl = {
    mode: "automatic";
    automatic: {
        phOpenThreshold: number;
        phCloseThreshold: number;
        burstGainSeconds: number;
        minBurstSeconds: number;
        maxBurstSeconds: number;
        dwellSeconds: number;
    };
};
export type ValveControl = ManualControl | AutomaticControl;

export const DEFAULT_CONTROL: ValveControl = { mode: "manual", manual: { maxOpenSeconds: 15 } };
const DEFAULT_AUTOMATIC: AutomaticControl["automatic"] = {
    phOpenThreshold: 7.5,
    phCloseThreshold: 7.0,
    burstGainSeconds: 2,
    minBurstSeconds: 1,
    maxBurstSeconds: 10,
    dwellSeconds: 20,
};

interface ValvePanelProps {
    deviceId: string;
    serialNumber: string;
    /** Last commanded state from Device.config, for the server-rendered first paint. */
    initialOpen: boolean;
    initialControl: ValveControl | null;
    /** Automatic mode is refused server-side without one - see setValveControlAction. */
    hasPhCalibration: boolean;
    /** Opening the valve (manual or automatic) is refused server-side without one - see setValveAction/setValveControlAction. */
    hasRunningExperiment: boolean;
}

/** How long telemetry may be silent before the reported state is treated as stale. */
const STALE_AFTER_MS = 30_000;

/**
 * Valve control: manual on/off (with a safety time limit) and automatic pH
 * hysteresis + burst dosing.
 *
 * This panel only pushes SETPOINTS. Every actual safety limit - the manual
 * timeout, the burst duration, the dwell between bursts - is enforced on the
 * ESP32 firmware against its own local pH reading, not by anything running here.
 * If the network drops while the valve is open, the firmware still closes it.
 */
export function ValvePanel({ deviceId, serialNumber, initialOpen, initialControl, hasPhCalibration, hasRunningExperiment }: ValvePanelProps) {
    const [commanded, setCommanded] = useState(initialOpen);
    const [pending, startTransition] = useTransition();
    const [lastSeen, setLastSeen] = useState<number | null>(null);
    const [isStale, setIsStale] = useState(false);

    const live = useMqttStore((s) => s.liveValues[serialNumber]);
    const reported = live?.[VALVE_METRIC];
    const confirmed = reported === undefined || reported === null ? null : Number(reported) === 1;

    /**
     * Whether the node ever acknowledged the open we asked for. Seeded from
     * initialOpen: a stored open intent from a previous session is necessarily
     * spent, since the firmware closes on its own maxOpenSeconds timer regardless
     * of what this app remembers.
     */
    const [sawConfirmedOpen, setSawConfirmedOpen] = useState(initialOpen);

    // Follow the firmware's automatic close. Adjusting state during render rather
    // than in an effect - an effect would paint one frame with the switch still on.
    //
    // Only an open the node CONFIRMED is treated as auto-closed, which is what
    // keeps the divergence warning below meaningful: a command that never landed
    // never gets confirmed, so it still reports as diverged instead of being
    // quietly switched off. Deliberately not written back to Device.config - that
    // column holds commanded intent, and closing is the device's own doing, so
    // pushing a redundant close down to it would be wrong.
    if (commanded && confirmed === true && !sawConfirmedOpen) {
        setSawConfirmedOpen(true);
    }
    if (commanded && confirmed === false && sawConfirmedOpen && !pending) {
        setSawConfirmedOpen(false);
        setCommanded(false);
    }

    useEffect(() => {
        if (confirmed !== null) setLastSeen(Date.now());
    }, [confirmed, live]);

    useEffect(() => {
        const id = setInterval(() => {
            setIsStale(lastSeen !== null && Date.now() - lastSeen > STALE_AFTER_MS);
        }, 5000);
        return () => clearInterval(id);
    }, [lastSeen]);

    function toggle(next: boolean) {
        if (next && !hasRunningExperiment) {
            toast.error("A válvula só pode ser aberta com uma experiência em curso.");
            return;
        }
        setCommanded(next);
        // Fresh command, so nothing is acknowledged yet: an open that never reaches
        // the node stays diverged instead of being mistaken for an auto-close.
        setSawConfirmedOpen(false);
        startTransition(async () => {
            const result = await setValveAction(deviceId, next);
            if (!result.success) {
                setCommanded(!next);
                toast.error(result.error);
                return;
            }
            toast.success(next ? "Comando enviado: abrir válvula." : "Comando enviado: fechar válvula.");
        });
    }

    const diverged = confirmed !== null && !isStale && confirmed !== commanded && !pending;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Wind className="size-4 text-brand" aria-hidden />
                    Válvula de CO2
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="flex items-center justify-between gap-4">
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ValveStatusText confirmed={confirmed} isStale={isStale} pending={pending} />
                        {confirmed && !isStale && <ValveBubbles />}
                    </p>
                    <Switch
                        checked={commanded}
                        disabled={pending}
                        onCheckedChange={toggle}
                        aria-label="Abrir ou fechar a válvula de CO2"
                    />
                </div>

                {diverged && (
                    <p className="flex gap-2 rounded-md bg-secondary p-3 text-xs text-warning">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                        O nó reporta a válvula {confirmed ? "aberta" : "fechada"}, mas o último comando
                        foi {commanded ? "abrir" : "fechar"}. O comando pode não ter chegado ao dispositivo.
                    </p>
                )}

                {!hasRunningExperiment && (
                    <p className="flex gap-2 rounded-md bg-secondary p-3 text-xs text-warning">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                        Sem experiência em curso — a válvula não pode ser aberta enquanto só a
                        telemetria estiver ativa.
                    </p>
                )}

                <ValveControlForm
                    deviceId={deviceId}
                    initialControl={initialControl ?? DEFAULT_CONTROL}
                    hasPhCalibration={hasPhCalibration}
                    hasRunningExperiment={hasRunningExperiment}
                />
            </CardContent>
        </Card>
    );
}

/** Three bubbles rising at staggered offsets, echoing CO2 injecting into the culture. */
function ValveBubbles() {
    return (
        <span className="flex items-end gap-0.5" aria-hidden>
            {[0, 0.2, 0.4].map((delay) => (
                <span
                    key={delay}
                    className="valve-bubble size-1 rounded-full bg-metric-co2"
                    style={{ animationDelay: `${delay}s` }}
                />
            ))}
        </span>
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

export function ValveControlForm({
    deviceId,
    initialControl,
    hasPhCalibration,
    hasRunningExperiment,
    onChange,
}: {
    deviceId: string;
    initialControl: ValveControl;
    hasPhCalibration: boolean;
    hasRunningExperiment: boolean;
    /**
     * When set, this form becomes embedded/controlled: it reports every change
     * instead of saving itself, and hides its own save button - the caller (e.g.
     * a project wizard whose own "finish" button should be the single point of
     * persistence) is responsible for calling setValveControlAction. Omit for the
     * standalone usage (device/experiment page), which keeps saving itself.
     */
    onChange?: (control: ValveControl) => void;
}) {
    const [mode, setMode] = useState<"manual" | "automatic">(initialControl.mode);
    const [maxOpenSeconds, setMaxOpenSeconds] = useState(
        initialControl.mode === "manual" ? initialControl.manual.maxOpenSeconds : 15
    );
    const [automatic, setAutomatic] = useState(
        initialControl.mode === "automatic" ? initialControl.automatic : DEFAULT_AUTOMATIC
    );
    const [pending, startTransition] = useTransition();

    const thresholdError =
        automatic.phCloseThreshold >= automatic.phOpenThreshold
            ? "O limite inferior tem de ser menor que o limite superior."
            : null;
    const burstError =
        automatic.minBurstSeconds > automatic.maxBurstSeconds
            ? "A duração mínima não pode exceder a máxima."
            : null;

    const current: ValveControl = mode === "manual" ? { mode, manual: { maxOpenSeconds } } : { mode, automatic };

    function updateMode(next: "manual" | "automatic") {
        setMode(next);
        onChange?.(next === "manual" ? { mode: next, manual: { maxOpenSeconds } } : { mode: next, automatic });
    }
    function updateMaxOpenSeconds(next: number) {
        setMaxOpenSeconds(next);
        onChange?.({ mode: "manual", manual: { maxOpenSeconds: next } });
    }
    function updateAutomatic(next: AutomaticControl["automatic"]) {
        setAutomatic(next);
        onChange?.({ mode: "automatic", automatic: next });
    }

    function save() {
        startTransition(async () => {
            const result = await setValveControlAction(deviceId, current);
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            toast.success("Parâmetros de segurança atualizados.");
        });
    }

    return (
        <div className="space-y-4 border-t border-border pt-4">
            <Tabs value={mode} onValueChange={(v) => updateMode(v as "manual" | "automatic")}>
                <TabsList className="w-full">
                    <TabsTrigger value="manual" className="flex-1">Manual</TabsTrigger>
                    <TabsTrigger value="automatic" className="flex-1">Automático</TabsTrigger>
                </TabsList>

                <TabsContent value="manual" className="mt-4 space-y-2">
                    <Label htmlFor="max-open">Tempo máximo de abertura (s)</Label>
                    <Input
                        id="max-open"
                        type="number"
                        min={1}
                        max={120}
                        value={maxOpenSeconds}
                        onChange={(e) => updateMaxOpenSeconds(Number(e.target.value))}
                        className="tabular"
                    />
                    <p className="text-xs text-muted-foreground">
                        O dispositivo fecha a válvula automaticamente ao fim deste tempo, mesmo sem
                        novo comando — este limite é aplicado localmente no firmware.
                    </p>
                </TabsContent>

                <TabsContent value="automatic" className="mt-4 space-y-4">
                    {!hasRunningExperiment && (
                        <p className="flex gap-2 rounded-md bg-secondary p-3 text-xs text-warning">
                            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                            O modo automático só pode ser ativado com uma experiência em curso —
                            o dosing loop abriria a válvula com base apenas na telemetria, sem uma
                            experiência a registar o que acontece.
                        </p>
                    )}
                    {!hasPhCalibration ? (
                        <p className="flex gap-2 rounded-md bg-secondary p-3 text-xs text-warning">
                            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                            O modo automático requer uma calibração de pH guardada — o firmware
                            precisa dela para estimar o pH localmente, sem depender da rede. Calibre
                            o sensor primeiro.
                        </p>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            A válvula abre quando o pH sobe acima do limite superior, injetando CO2 em
                            rajadas (não continuamente) até o pH descer abaixo do limite inferior.
                        </p>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Limite superior (pH)" value={automatic.phOpenThreshold}
                            onChange={(v) => updateAutomatic({ ...automatic, phOpenThreshold: v })} step="0.1" />
                        <Field label="Limite inferior (pH)" value={automatic.phCloseThreshold}
                            onChange={(v) => updateAutomatic({ ...automatic, phCloseThreshold: v })} step="0.1" />
                        <Field label="Ganho (s por unidade pH)" value={automatic.burstGainSeconds}
                            onChange={(v) => updateAutomatic({ ...automatic, burstGainSeconds: v })} step="0.5" />
                        <Field label="Intervalo entre rajadas (s)" value={automatic.dwellSeconds}
                            onChange={(v) => updateAutomatic({ ...automatic, dwellSeconds: v })} step="1" />
                        <Field label="Rajada mínima (s)" value={automatic.minBurstSeconds}
                            onChange={(v) => updateAutomatic({ ...automatic, minBurstSeconds: v })} step="0.5" />
                        <Field label="Rajada máxima (s)" value={automatic.maxBurstSeconds}
                            onChange={(v) => updateAutomatic({ ...automatic, maxBurstSeconds: v })} step="0.5" />
                    </div>
                    {(thresholdError || burstError) && (
                        <p className="text-xs text-danger">{thresholdError ?? burstError}</p>
                    )}
                </TabsContent>
            </Tabs>

            {!onChange && (
                <Button
                    size="sm"
                    onClick={save}
                    disabled={pending || (mode === "automatic" && (!hasPhCalibration || !hasRunningExperiment || !!(thresholdError || burstError)))}
                >
                    {pending ? "A guardar…" : "Guardar parâmetros"}
                </Button>
            )}
        </div>
    );
}

function Field({
    label,
    value,
    onChange,
    step,
}: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    step: string;
}) {
    return (
        <div className="space-y-1.5">
            <Label className="text-xs font-normal text-muted-foreground">{label}</Label>
            <Input
                type="number"
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="tabular"
            />
        </div>
    );
}
