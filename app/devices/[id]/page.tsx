import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/core/prisma";
import { getCalibrationRows } from "@/lib/calibration-rows";
import { AppShell } from "@/components/AppShell";
import { DeviceStatusBadge } from "@/components/DeviceStatusBadge";
import { DeviceEditDialog } from "@/components/DeviceEditDialog";
import { ReactorGauges } from "@/components/ReactorGauges";
import { ReactorChart } from "@/components/ReactorChart";
import { ValvePanel } from "@/components/ValvePanel";
import { CalibrationTable } from "@/components/CalibrationTable";
import { DeviceLogsCard } from "@/components/DeviceLogsCard";

export const dynamic = "force-dynamic";

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
    const calibrationRows = await getCalibrationRows([device]);

    // This reactor's own recent history: threshold breaches, online/offline
    // transitions, calibrations. Every level, unlike the dashboard feed - on a
    // single device the critical ones are exactly what you came to see. The count
    // is adjustable from the card; this is the initial page.
    const DEFAULT_LOG_LIMIT = 10;
    const deviceLogs = await prisma.systemLog.findMany({
        where: { departmentId: process.env.DEPARTMENT_ID, deviceId: device.id },
        orderBy: { timestamp: "desc" },
        take: DEFAULT_LOG_LIMIT,
        select: { id: true, level: true, category: true, message: true, timestamp: true },
    });

    return (
        <AppShell>
            <Link href="/devices" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ChevronLeft className="size-4" aria-hidden />
                Dispositivos
            </Link>

            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-2xl font-semibold tracking-tight break-words">{device.name}</h1>
                        <DeviceStatusBadge status={device.status} />
                    </div>
                    {/* Serials are long and unbreakable, so they need an explicit
                        break opportunity or they set the page's minimum width. */}
                    <p className="tabular mt-1 text-sm break-all text-muted-foreground">{device.serialNumber}</p>
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
                {/* Live telemetry only - no InfluxDB history. This page is a window on
                    what the node is reporting right now; the recorded series belongs to
                    an experiment, which is what scopes it to a run. */}
                <ReactorGauges serialNumber={device.serialNumber} telemetry={[]} enabledMetrics={sensors} />

                <ReactorChart
                    serialNumber={device.serialNumber}
                    telemetry={[]}
                    enabledMetrics={sensors}
                    liveOnly
                />

                <div className="grid gap-6 md:grid-cols-2">
                    <ValvePanel
                        deviceId={device.id}
                        serialNumber={device.serialNumber}
                        initialOpen={config.valveOpen === true}
                        initialControl={(config.control as never) ?? null}
                        hasPhCalibration={Boolean((device.calibrationConfig as { ph?: unknown } | null)?.ph)}
                        hasRunningExperiment={device.experiments.length > 0}
                    />
                    {/* Taken out of flow at md+ so the alert list cannot stretch the row:
                        a grid track sizes to its tallest item, so a long list would set
                        the height and leave the valve panel padded with dead space. The
                        row now follows the valve panel and the card scrolls inside it. */}
                    <div className="relative min-h-0">
                        <div className="md:absolute md:inset-0">
                            <DeviceLogsCard
                                deviceId={device.id}
                                initialLogs={deviceLogs}
                                initialLimit={DEFAULT_LOG_LIMIT}
                            />
                        </div>
                    </div>
                </div>

                <CalibrationTable
                    rows={calibrationRows}
                    showDevice={false}
                    locked={device.experiments.length > 0}
                    lockedReason="A calibração está bloqueada enquanto uma experiência decorre neste reator — recalibrar a meio alteraria a transformação aplicada às leituras já registadas."
                />
            </div>
        </AppShell>
    );
}
