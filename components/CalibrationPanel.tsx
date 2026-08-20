"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { CalibrationWizard } from "@/components/CalibrationWizard";
import { REACTOR_CALIBRATION } from "@/lib/calibration-config";
import { SCHEMA_BY_KEY } from "@/lib/reactor-schema";

interface CalibrationPanelProps {
    deviceId: string;
    serialNumber: string;
    /** Channels this reactor was provisioned with. Empty means all. */
    enabledMetrics: string[];
    lastCalibrated: string | null;
    calibrationDueDate: string | null;
}

export function CalibrationPanel({
    deviceId,
    serialNumber,
    enabledMetrics,
    lastCalibrated,
    calibrationDueDate,
}: CalibrationPanelProps) {
    const [active, setActive] = useState<string | null>(null);
    const router = useRouter();

    // Only metrics with a defined recipe can be calibrated; CO2 and temperature
    // have no wet-standard procedure here.
    const calibratable = Object.keys(REACTOR_CALIBRATION).filter(
        (key) => enabledMetrics.length === 0 || enabledMetrics.includes(key)
    );

    if (calibratable.length === 0) return null;

    const overdue = calibrationDueDate ? new Date(calibrationDueDate) < new Date() : false;

    return (
        <section className="rounded-lg border border-border bg-surface p-5">
            <div className="flex items-start gap-3">
                <SlidersHorizontal className="mt-0.5 h-5 w-5 text-accent" aria-hidden />
                <div className="min-w-0 flex-1">
                    <h2 className="font-medium">Calibração</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {lastCalibrated ? (
                            <>
                                Última: {new Date(lastCalibrated).toLocaleDateString("pt-PT")}
                                {calibrationDueDate && (
                                    <span className={overdue ? "text-warning" : undefined}>
                                        {" · "}
                                        {overdue ? "expirada em " : "válida até "}
                                        {new Date(calibrationDueDate).toLocaleDateString("pt-PT")}
                                    </span>
                                )}
                            </>
                        ) : (
                            "Nunca calibrado."
                        )}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                        {calibratable.map((key) => (
                            <button
                                key={key}
                                onClick={() => setActive(key)}
                                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-muted"
                            >
                                Calibrar {SCHEMA_BY_KEY[key]?.label ?? key}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {active && (
                <CalibrationWizard
                    deviceId={deviceId}
                    serialNumber={serialNumber}
                    metricKey={active}
                    onClose={() => {
                        setActive(null);
                        router.refresh();
                    }}
                />
            )}
        </section>
    );
}
