import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/core/prisma";
import { getDeviceTelemetry } from "@/lib/db/influx";
import { experimentQueryWindow } from "@/lib/experiment-window";
import { AppShell } from "@/components/AppShell";
import { ExperimentStatusBadge } from "@/components/ExperimentStatusBadge";
import { ExperimentControls } from "@/components/ExperimentControls";
import { ExperimentElapsed } from "@/components/ExperimentElapsed";
import { ExperimentActionsMenu } from "@/components/ExperimentActionsMenu";
import { ReactorGauges } from "@/components/ReactorGauges";
import { ReactorChart } from "@/components/ReactorChart";
import { ValvePanel } from "@/components/ValvePanel";
import { LogsCard } from "@/components/LogsCard";
import { CalibrationTable } from "@/components/CalibrationTable";
import { getCalibrationRows } from "@/lib/calibration-rows";
import { SensorReading } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ExperimentPage({ params }: PageProps<"/projects/[id]/experiments/[experimentId]">) {
    const { id, experimentId } = await params;

    const experiment = await prisma.experiment.findFirst({
        where: { id: experimentId, project: { id, departmentId: process.env.DEPARTMENT_ID } },
        include: { project: true, devices: true },
    });
    if (!experiment) notFound();

    // Storage frequency chosen at creation (createExperimentAction). Mirrors the
    // default the action falls back to when the field was never set.
    const dbInterval = ((experiment.settings ?? {}) as { dbInterval?: number }).dbInterval ?? 60;

    // Shared with getExperimentTelemetryAction's polling so the chart's initial
    // render and its refreshes use one identical window. See lib/experiment-window.ts
    // for why each status needs its own bounds.
    // One query for the whole run, partitioned per device below - the alternative
    // is a query per device section. Logs with no deviceId are experiment-level
    // events, so they belong in every device's list.
    const experimentLogs = await prisma.systemLog.findMany({
        where: { departmentId: process.env.DEPARTMENT_ID, experimentId: experiment.id },
        orderBy: { timestamp: "desc" },
        take: 50,
        select: { id: true, level: true, category: true, message: true, timestamp: true, deviceId: true },
    });

    const calibrationRows = await getCalibrationRows(experiment.devices);

    const window = experimentQueryWindow(experiment);
    const deviceTelemetry = await Promise.all(
        experiment.devices.map(async (device) => {
            if (!window) return { device, telemetry: [] as SensorReading[] };
            try {
                return { device, telemetry: await getDeviceTelemetry(device.serialNumber, window.start, window.end) };
            } catch (error) {
                console.error(`[experiment ${experimentId}] InfluxDB read failed for ${device.serialNumber}:`, error);
                return { device, telemetry: [] as SensorReading[] };
            }
        })
    );

    return (
        <AppShell>
            <Link href={`/projects/${id}`} className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ChevronLeft className="size-4" aria-hidden />
                {experiment.project.name}
            </Link>

            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-2xl font-semibold tracking-tight break-words">{experiment.name}</h1>
                        <ExperimentStatusBadge status={experiment.status} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Início: {experiment.startDate.toLocaleString("pt-PT")}
                        {experiment.endDate && ` · Fim: ${experiment.endDate.toLocaleString("pt-PT")}`}
                    </p>
                </div>

                {/* The run's headline number. Drops to its own full-width row before the
                    header would wrap into an unreadable three-way squeeze. */}
                {experiment.status !== "PLANNED" && (
                    <div className="order-last w-full text-center sm:order-none sm:w-auto">
                        <p className="gauge-label text-muted-foreground">Tempo decorrido</p>
                        <p className="text-3xl font-semibold leading-tight">
                            <ExperimentElapsed
                                accumulatedSeconds={experiment.accumulatedSeconds}
                                lastRunAt={experiment.lastRunAt?.toISOString() ?? null}
                            />
                        </p>
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                    <ExperimentControls experimentId={experiment.id} status={experiment.status} />
                    <ExperimentActionsMenu
                        experimentId={experiment.id}
                        projectId={experiment.projectId}
                        name={experiment.name}
                        status={experiment.status}
                        dbInterval={dbInterval}
                        afterDelete="back-to-project"
                    />
                </div>
            </div>

            <div className="space-y-8">
                {deviceTelemetry.map(({ device, telemetry }) => {
                    const config = (device.config ?? {}) as { sensors?: string[]; valveOpen?: boolean; control?: unknown };
                    const sensors = config.sensors ?? [];

                    return (
                        <section key={device.id} className="space-y-4 border-t border-border pt-6 first:border-t-0 first:pt-0">
                            {/* Wraps to its own line on a phone rather than pushing the
                                serial off the edge. */}
                            <h2 className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-medium">
                                <Link href={`/devices/${device.id}`} className="break-words hover:underline">{device.name}</Link>
                                <span className="tabular text-xs font-normal break-all text-muted-foreground">{device.serialNumber}</span>
                            </h2>

                            <ReactorGauges serialNumber={device.serialNumber} telemetry={telemetry} enabledMetrics={sensors} live={experiment.status === "RUNNING"} />

                            <ReactorChart
                                serialNumber={device.serialNumber}
                                telemetry={telemetry}
                                enabledMetrics={sensors}
                                live={experiment.status === "RUNNING"}
                                experimentId={experiment.id}
                                dbInterval={dbInterval}
                            />

                            <div className="grid gap-6 md:grid-cols-2">
                                <ValvePanel
                                    deviceId={device.id}
                                    serialNumber={device.serialNumber}
                                    initialOpen={config.valveOpen === true}
                                    initialControl={(config.control as never) ?? null}
                                    hasPhCalibration={Boolean((device.calibrationConfig as { ph?: unknown } | null)?.ph)}
                                    hasRunningExperiment={experiment.status === "RUNNING"}
                                />
                                <LogsCard
                                    title="Alertas da experiência"
                                    emptyMessage="Sem alertas nesta experiência."
                                    logs={experimentLogs.filter((log) => log.deviceId === device.id || log.deviceId === null)}
                                />
                            </div>
                        </section>
                    );
                })}

                {/* One table for the whole run rather than a panel per device: the old
                    per-device panel showed a bare "Última: <date>" with no way to tell
                    which reactor it described. */}
                <div className="border-t border-border pt-6">
                    <CalibrationTable
                        rows={calibrationRows}
                        locked={experiment.status === "RUNNING"}
                        lockedReason="A calibração está bloqueada enquanto a experiência decorre — recalibrar a meio alteraria a transformação aplicada às leituras já registadas."
                    />
                </div>
            </div>
        </AppShell>
    );
}
