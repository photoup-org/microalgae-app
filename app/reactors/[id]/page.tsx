import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/core/prisma";
import { getDeviceTelemetry } from "@/lib/db/influx";
import { AppShell } from "@/components/AppShell";
import { ReactorChart } from "@/components/ReactorChart";
import { ValvePanel } from "@/components/ValvePanel";
import { CalibrationPanel } from "@/components/CalibrationPanel";
import { SensorReading } from "@/lib/types";

export const dynamic = "force-dynamic";

const HISTORY_WINDOW_HOURS = 6;

export default async function ReactorPage({ params }: PageProps<"/reactors/[id]">) {
    // Next 16: route params arrive as a Promise.
    const { id } = await params;

    const reactor = await prisma.project.findFirst({
        where: { id, departmentId: process.env.DEPARTMENT_ID },
        include: { devices: true },
    });

    if (!reactor) notFound();

    const device = reactor.devices[0] ?? null;
    const enabledMetrics = (reactor.settings as { metrics?: string[] } | null)?.metrics ?? [];

    // A missing bucket or an unreachable InfluxDB should degrade the page to
    // live-only, not blank it.
    let telemetry: SensorReading[] = [];
    let telemetryFailed = false;

    if (device) {
        const since = new Date(Date.now() - HISTORY_WINDOW_HOURS * 3600 * 1000);
        try {
            telemetry = await getDeviceTelemetry(device.serialNumber, since);
        } catch (error) {
            // Detail stays in the server log; the page shows a generic notice so
            // connection strings and internals are not rendered to the browser.
            telemetryFailed = true;
            console.error(`[reactor ${id}] InfluxDB read failed:`, error);
        }
    }

    const config = (device?.config ?? {}) as { valveOpen?: boolean };

    return (
        <AppShell>
            <Link
                href="/reactors"
                className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Reatores
            </Link>

            <div className="mb-6">
                <h1 className="text-2xl font-semibold tracking-tight">{reactor.name}</h1>
                <p className="tabular mt-1 text-sm text-muted-foreground">
                    {device?.serialNumber ?? "sem dispositivo associado"}
                </p>
            </div>

            {!device ? (
                <p className="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">
                    Este reator não tem nenhum dispositivo associado.
                </p>
            ) : (
                <div className="space-y-6">
                    {telemetryFailed && (
                        <p className="rounded-md border border-border bg-surface-muted p-3 text-sm text-warning">
                            Não foi possível ler o histórico. A apresentar apenas valores em
                            tempo real.
                        </p>
                    )}

                    <ReactorChart
                        serialNumber={device.serialNumber}
                        telemetry={telemetry}
                        enabledMetrics={enabledMetrics}
                    />

                    <div className="grid gap-6 md:grid-cols-2">
                        <ValvePanel
                            deviceId={device.id}
                            serialNumber={device.serialNumber}
                            initialOpen={config.valveOpen === true}
                        />

                        <CalibrationPanel
                            deviceId={device.id}
                            serialNumber={device.serialNumber}
                            enabledMetrics={enabledMetrics}
                            lastCalibrated={device.lastCalibrated?.toISOString() ?? null}
                            calibrationDueDate={device.calibrationDueDate?.toISOString() ?? null}
                        />
                    </div>
                </div>
            )}
        </AppShell>
    );
}
