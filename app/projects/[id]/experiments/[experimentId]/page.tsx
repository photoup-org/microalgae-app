import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/core/prisma";
import { getDeviceTelemetry } from "@/lib/db/influx";
import { AppShell } from "@/components/AppShell";
import { ExperimentStatusBadge } from "@/components/ExperimentStatusBadge";
import { ExperimentControls } from "@/components/ExperimentControls";
import { ExportDataButton } from "@/components/ExportDataButton";
import { ReactorGauges } from "@/components/ReactorGauges";
import { ReactorChart } from "@/components/ReactorChart";
import { ValvePanel } from "@/components/ValvePanel";
import { CalibrationPanel } from "@/components/CalibrationPanel";
import { SensorReading } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ExperimentPage({ params }: PageProps<"/projects/[id]/experiments/[experimentId]">) {
    const { id, experimentId } = await params;

    const experiment = await prisma.experiment.findFirst({
        where: { id: experimentId, project: { id, departmentId: process.env.DEPARTMENT_ID } },
        include: { project: true, devices: true },
    });
    if (!experiment) notFound();

    const end = experiment.endDate ?? new Date();
    const deviceTelemetry = await Promise.all(
        experiment.devices.map(async (device) => {
            try {
                return { device, telemetry: await getDeviceTelemetry(device.serialNumber, experiment.startDate, end) };
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

            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-semibold tracking-tight">{experiment.name}</h1>
                        <ExperimentStatusBadge status={experiment.status} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Início: {experiment.startDate.toLocaleString("pt-PT")}
                        {experiment.endDate && ` · Fim: ${experiment.endDate.toLocaleString("pt-PT")}`}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <ExportDataButton experimentId={experiment.id} />
                    <ExperimentControls experimentId={experiment.id} status={experiment.status} />
                </div>
            </div>

            <div className="space-y-8">
                {deviceTelemetry.map(({ device, telemetry }) => {
                    const config = (device.config ?? {}) as { sensors?: string[]; valveOpen?: boolean; control?: unknown };
                    const sensors = config.sensors ?? [];

                    return (
                        <section key={device.id} className="space-y-4 border-t border-border pt-6 first:border-t-0 first:pt-0">
                            <h2 className="font-medium">
                                <Link href={`/devices/${device.id}`} className="hover:underline">{device.name}</Link>
                                <span className="tabular ml-2 text-xs font-normal text-muted-foreground">{device.serialNumber}</span>
                            </h2>

                            <ReactorGauges serialNumber={device.serialNumber} telemetry={telemetry} enabledMetrics={sensors} />

                            <ReactorChart serialNumber={device.serialNumber} telemetry={telemetry} enabledMetrics={sensors} />

                            <div className="grid gap-6 md:grid-cols-2">
                                <ValvePanel
                                    deviceId={device.id}
                                    serialNumber={device.serialNumber}
                                    initialOpen={config.valveOpen === true}
                                    initialControl={(config.control as never) ?? null}
                                    hasPhCalibration={Boolean((device.calibrationConfig as { ph?: unknown } | null)?.ph)}
                                />
                                <CalibrationPanel
                                    deviceId={device.id}
                                    serialNumber={device.serialNumber}
                                    enabledMetrics={sensors}
                                    lastCalibrated={device.lastCalibrated?.toISOString() ?? null}
                                    calibrationDueDate={device.calibrationDueDate?.toISOString() ?? null}
                                />
                            </div>
                        </section>
                    );
                })}
            </div>
        </AppShell>
    );
}
