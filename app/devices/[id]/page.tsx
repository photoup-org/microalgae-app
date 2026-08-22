import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/core/prisma";
import { getDeviceTelemetry } from "@/lib/db/influx";
import { AppShell } from "@/components/AppShell";
import { DeviceStatusBadge } from "@/components/DeviceStatusBadge";
import { DeviceEditDialog } from "@/components/DeviceEditDialog";
import { ReactorGauges } from "@/components/ReactorGauges";
import { ReactorChart } from "@/components/ReactorChart";
import { ValvePanel } from "@/components/ValvePanel";
import { CalibrationPanel } from "@/components/CalibrationPanel";
import { SensorReading } from "@/lib/types";

export const dynamic = "force-dynamic";

const HISTORY_WINDOW_HOURS = 6;

export default async function DevicePage({ params }: PageProps<"/devices/[id]">) {
    const { id } = await params;

    const device = await prisma.device.findFirst({
        where: { id, departmentId: process.env.DEPARTMENT_ID },
        include: {
            projects: { orderBy: { name: "asc" } },
            experiments: { where: { status: "RUNNING" }, select: { id: true } },
        },
    });
    if (!device) notFound();

    const config = (device.config ?? {}) as {
        sensors?: string[];
        description?: string;
        valveOpen?: boolean;
        control?: unknown;
    };
    const sensors = config.sensors ?? [];

    let telemetry: SensorReading[] = [];
    let telemetryFailed = false;
    try {
        const since = new Date(Date.now() - HISTORY_WINDOW_HOURS * 3600 * 1000);
        telemetry = await getDeviceTelemetry(device.serialNumber, since);
    } catch (error) {
        telemetryFailed = true;
        console.error(`[device ${id}] InfluxDB read failed:`, error);
    }

    return (
        <AppShell>
            <Link href="/devices" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ChevronLeft className="size-4" aria-hidden />
                Dispositivos
            </Link>

            <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-semibold tracking-tight">{device.name}</h1>
                        <DeviceStatusBadge status={device.status} />
                    </div>
                    <p className="tabular mt-1 text-sm text-muted-foreground">{device.serialNumber}</p>
                    {config.description && <p className="mt-2 max-w-prose text-sm">{config.description}</p>}
                    <p className="mt-2 text-sm text-muted-foreground">
                        {device.projects.length === 1 ? "Projeto: " : "Projetos: "}
                        {device.projects.length === 0
                            ? "não atribuído"
                            : device.projects.map((project, index) => (
                                  <span key={project.id}>
                                      {index > 0 && ", "}
                                      <Link href={`/projects/${project.id}`} className="hover:underline">
                                          {project.name}
                                      </Link>
                                  </span>
                              ))}
                    </p>
                </div>
                <DeviceEditDialog
                    deviceId={device.id}
                    initialName={device.name ?? ""}
                    initialDescription={config.description ?? ""}
                    initialSensors={sensors}
                />
            </div>

            <div className="space-y-6">
                {telemetryFailed && (
                    <p className="rounded-md border border-border bg-secondary p-3 text-sm text-warning">
                        Não foi possível ler o histórico. A apresentar apenas valores em tempo real.
                    </p>
                )}

                <ReactorGauges serialNumber={device.serialNumber} telemetry={telemetry} enabledMetrics={sensors} />

                <ReactorChart serialNumber={device.serialNumber} telemetry={telemetry} enabledMetrics={sensors} />

                <div className="grid gap-6 md:grid-cols-2">
                    <ValvePanel
                        deviceId={device.id}
                        serialNumber={device.serialNumber}
                        initialOpen={config.valveOpen === true}
                        initialControl={(config.control as never) ?? null}
                        hasPhCalibration={Boolean((device.calibrationConfig as { ph?: unknown } | null)?.ph)}
                        hasRunningExperiment={device.experiments.length > 0}
                    />
                    <CalibrationPanel
                        deviceId={device.id}
                        serialNumber={device.serialNumber}
                        enabledMetrics={sensors}
                        lastCalibrated={device.lastCalibrated?.toISOString() ?? null}
                        calibrationDueDate={device.calibrationDueDate?.toISOString() ?? null}
                    />
                </div>
            </div>
        </AppShell>
    );
}
