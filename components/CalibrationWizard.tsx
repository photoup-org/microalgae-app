"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Activity } from "lucide-react";
import { useMqttStore } from "@/hooks/useMqttStore";
import { calibrateDeviceAction, CalibrationPoint } from "@/actions/calibration";
import { REACTOR_CALIBRATION } from "@/lib/calibration-config";
import { SCHEMA_BY_KEY } from "@/lib/reactor-schema";

const DEPARTMENT_ID = process.env.NEXT_PUBLIC_DEPARTMENT_ID ?? "";

interface CalibrationWizardProps {
    deviceId: string;
    serialNumber: string;
    metricKey: string;
    onClose: () => void;
}

/**
 * Guided multi-point calibration.
 *
 * Captures the UNCALIBRATED reading from the /raw topic, not the /sync value: the
 * whole point is to map raw sensor output onto known standards, so calibrating
 * against an already-calibrated number would compound the previous correction.
 */
export function CalibrationWizard({
    deviceId,
    serialNumber,
    metricKey,
    onClose,
}: CalibrationWizardProps) {
    const config = REACTOR_CALIBRATION[metricKey];
    const metric = SCHEMA_BY_KEY[metricKey];

    const subscribe = useMqttStore((s) => s.subscribe);
    const isConnected = useMqttStore((s) => s.isConnected);

    const [step, setStep] = useState(0);
    const [points, setPoints] = useState<CalibrationPoint[]>([]);
    const [reference, setReference] = useState(String(config?.defaultReferences[0] ?? ""));
    const [liveRaw, setLiveRaw] = useState<number | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!serialNumber) return;

        const topic = `ui/live/department/${DEPARTMENT_ID}/device/${serialNumber}/raw`;
        return subscribe(topic, (payload) => {
            const message = payload as { metric?: string; value?: number };
            if (message.metric === metricKey && typeof message.value === "number") {
                setLiveRaw(message.value);
            }
        });
    }, [serialNumber, metricKey, subscribe]);

    if (!config || !metric) return null;

    async function submit(finalPoints: CalibrationPoint[]) {
        setSubmitting(true);
        const result = await calibrateDeviceAction(deviceId, metricKey, finalPoints);
        setSubmitting(false);

        if (!result.success) {
            toast.error(result.error);
            setPoints([]);
            setStep(0);
            setReference(String(config.defaultReferences[0] ?? ""));
            return;
        }

        toast.success("Calibração aplicada.");
        onClose();
    }

    function capture() {
        const referenceValue = Number.parseFloat(reference);

        if (!Number.isFinite(referenceValue)) {
            toast.error("Introduza um valor de referência válido.");
            return;
        }
        if (liveRaw === null) {
            toast.error("Ainda sem leitura do sensor.");
            return;
        }

        const next = [...points, { raw: liveRaw, reference: referenceValue }];
        setPoints(next);

        if (next.length >= config.maxPoints) {
            void submit(next);
            return;
        }

        setStep(next.length);
        setReference(String(config.defaultReferences[next.length] ?? ""));
    }

    const canFinishEarly = points.length >= config.minPoints && points.length < config.maxPoints;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calibration-title"
        >
            <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6">
                <h2 id="calibration-title" className="text-lg font-semibold">
                    Calibrar {metric.label}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    Passo {step + 1} de {config.maxPoints}
                    {config.minPoints !== config.maxPoints && ` (mínimo ${config.minPoints})`}
                </p>

                <div className="mt-5 rounded-lg border border-border bg-surface-muted p-5 text-center">
                    <Activity
                        className={`mx-auto h-6 w-6 text-accent ${liveRaw !== null ? "live-dot" : ""}`}
                        aria-hidden
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                        Leitura bruta (sem calibração)
                    </p>
                    <p className="tabular mt-1 text-3xl font-semibold">
                        {liveRaw === null ? "—" : liveRaw.toFixed(3)}
                    </p>
                    {!isConnected && (
                        <p className="mt-2 text-xs text-warning">Sem ligação ao servidor local.</p>
                    )}
                </div>

                <p className="mt-4 text-sm text-muted-foreground">{config.instructions[step]}</p>

                <div className="mt-4">
                    <label htmlFor="calibration-reference" className="text-sm font-medium">
                        Valor de referência ({config.unit})
                    </label>
                    <input
                        id="calibration-reference"
                        type="number"
                        step="0.01"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        className="tabular mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                </div>

                {points.length > 0 && (
                    <ul className="mt-4 space-y-1 border-t border-border pt-3">
                        {points.map((point, index) => (
                            <li
                                key={index}
                                className="tabular flex justify-between text-xs text-muted-foreground"
                            >
                                <span>Ponto {index + 1}</span>
                                <span>
                                    {point.raw.toFixed(3)} → {point.reference} {config.unit}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="mt-6 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                    >
                        Cancelar
                    </button>
                    {canFinishEarly && (
                        <button
                            onClick={() => void submit(points)}
                            disabled={submitting}
                            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-muted"
                        >
                            Finalizar com {points.length}
                        </button>
                    )}
                    <button
                        onClick={capture}
                        disabled={submitting || liveRaw === null || reference === ""}
                        className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-40"
                    >
                        {submitting
                            ? "A guardar…"
                            : points.length + 1 >= config.maxPoints
                              ? "Capturar e finalizar"
                              : "Capturar ponto"}
                    </button>
                </div>
            </div>
        </div>
    );
}
