import { ExperimentStatus, LogLevel } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { getCalibrationRows } from "@/lib/calibration-rows";
import { REACTOR_SCHEMA, calibratedMetrics } from "@/lib/reactor-schema";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { LogsWidget } from "@/components/LogsWidget";
import { ReactorPanel, type ReactorPanelProps } from "@/components/ReactorPanel";
import type { ValveControl } from "@/components/ValvePanel";
import { StatusStrip } from "@/components/dashboard/StatusStrip";
import { LiveTrendPanel } from "@/components/dashboard/LiveTrendPanel";
import { ValveSummary } from "@/components/dashboard/ValveSummary";
import { IncidentsPanel, CalibrationPanel, RecentExperimentsPanel, ProjectsPanel } from "@/components/dashboard/ListPanels";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

function formatDate(date: Date) {
    return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function metricLabel(key: string) {
    return REACTOR_SCHEMA.find((m) => m.key === key)?.label ?? key;
}

/**
 * Reactor-first, but dense. Top to bottom: a one-line status strip, each reactor's
 * live readings beside what is waiting to be handled, the live trend beside the
 * activity feed, then the supporting lists - valve, calibrations, experiments,
 * projects. Every panel links to the page where its full version lives.
 */
export default async function DashboardPage() {
    const departmentId = process.env.DEPARTMENT_ID;
    const openIncidentWhere = {
        departmentId,
        level: { in: [LogLevel.WARN, LogLevel.ERROR, LogLevel.CRITICAL] },
        acknowledgedAt: null,
    };

    const [projects, devices, activeRuns, recentLogs, alertCounts, openIncidents, openIncidentCount, recentExperiments] =
        await Promise.all([
            prisma.project.findMany({
                where: { departmentId },
                select: { id: true, name: true, _count: { select: { experiments: true, devices: true } } },
                orderBy: { createdAt: "desc" },
                take: 5,
            }),
            prisma.device.findMany({
                where: { departmentId },
                select: { id: true, name: true, serialNumber: true, status: true, config: true, calibrationConfig: true },
                orderBy: { name: "asc" },
            }),
            prisma.experiment.findMany({
                where: {
                    status: { in: [ExperimentStatus.RUNNING, ExperimentStatus.PAUSED] },
                    project: { departmentId },
                },
                select: {
                    id: true,
                    name: true,
                    status: true,
                    projectId: true,
                    accumulatedSeconds: true,
                    lastRunAt: true,
                    project: { select: { name: true } },
                    devices: { select: { id: true } },
                },
            }),
            prisma.systemLog.findMany({
                where: { departmentId, level: { in: [LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR] } },
                orderBy: { timestamp: "desc" },
                take: 15,
                select: { id: true, level: true, category: true, message: true, timestamp: true, metadata: true },
            }),
            prisma.systemLog.groupBy({ by: ["projectId"], where: openIncidentWhere, _count: true }),
            prisma.systemLog.findMany({
                where: openIncidentWhere,
                orderBy: { timestamp: "desc" },
                take: 6,
                select: { id: true, level: true, message: true, timestamp: true },
            }),
            prisma.systemLog.count({ where: openIncidentWhere }),
            prisma.experiment.findMany({
                where: { project: { departmentId } },
                orderBy: { startDate: "desc" },
                take: 5,
                select: { id: true, name: true, status: true, projectId: true, startDate: true, project: { select: { name: true } } },
            }),
        ]);

    // Per channel, not Device.calibrationDueDate: that column cannot tell pH from
    // turbidity, so an expired pH probe hid behind a valid turbidity date.
    const calibrationRows = await getCalibrationRows(devices);
    const now = new Date();

    const panels: ReactorPanelProps[] = devices.map((device) => {
        const run = activeRuns.find((r) => r.devices.some((d) => d.id === device.id));
        const attention: ReactorPanelProps["attention"] = [];

        if (device.status === "MAINTENANCE") {
            attention.push({ kind: "maintenance", text: "Em manutenção" });
        }
        for (const row of calibrationRows.filter((r) => r.deviceId === device.id)) {
            const label = metricLabel(row.metric);
            if (!row.calibratedAt) {
                attention.push({ kind: "calibration", text: `${label} nunca foi calibrado` });
            } else if (row.validUntil && new Date(row.validUntil) < now) {
                attention.push({
                    kind: "calibration",
                    text: `Calibração de ${label} expirou a ${formatDate(new Date(row.validUntil))}`,
                });
            }
        }

        return {
            device: {
                id: device.id,
                name: device.name,
                serialNumber: device.serialNumber,
                status: device.status,
                sensors: ((device.config ?? {}) as { sensors?: string[] }).sensors ?? [],
                calibrated: calibratedMetrics(device.calibrationConfig),
            },
            run: run
                ? {
                      id: run.id,
                      projectId: run.projectId,
                      projectName: run.project.name,
                      name: run.name,
                      status: run.status as "RUNNING" | "PAUSED",
                      accumulatedSeconds: run.accumulatedSeconds,
                      lastRunAt: run.lastRunAt?.toISOString() ?? null,
                  }
                : null,
            attention,
        };
    });

    const openAlertsByProject = Object.fromEntries(alertCounts.map((a) => [a.projectId, a._count]));

    // Never-calibrated first, then soonest to expire: the order to work through them.
    const dueRank = (row: { calibrated: boolean; validUntil: Date | null }) =>
        !row.calibrated ? -Infinity : (row.validUntil?.getTime() ?? Infinity);
    const calibrationSchedule = calibrationRows
        .map((row) => ({
            key: `${row.deviceId}-${row.metric}`,
            deviceId: row.deviceId,
            deviceName: row.deviceName ?? row.serialNumber,
            channel: metricLabel(row.metric),
            calibrated: row.calibratedAt !== null,
            validUntil: row.validUntil ? new Date(row.validUntil) : null,
        }))
        .sort((a, b) => dueRank(a) - dueRank(b));
    const dueBy = now.getTime() + 14 * DAY_MS;
    const calibrationsDue = calibrationSchedule.filter((row) => dueRank(row) < dueBy).length;

    return (
        <AppShell title="Dashboard">
            <div className="mx-auto max-w-[1600px] space-y-4">
                <StatusStrip
                    devices={devices.map((d) => ({ serialNumber: d.serialNumber, status: d.status }))}
                    runningCount={activeRuns.filter((r) => r.status === ExperimentStatus.RUNNING).length}
                    openIncidents={openIncidentCount}
                    calibrationsDue={calibrationsDue}
                />

                {panels.length === 0 ? (
                    <Card>
                        <CardContent className="py-8 text-center text-sm text-muted-foreground">
                            Ainda não há reatores. Aparecem aqui assim que um nó ESP32 se liga pela primeira vez.
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <div className="grid gap-4 xl:grid-cols-12">
                            <section aria-label="Reatores" className="space-y-4 xl:col-span-8">
                                {panels.map((panel) => (
                                    <ReactorPanel key={panel.device.id} {...panel} />
                                ))}
                            </section>
                            <div className="xl:col-span-4">
                                <IncidentsPanel incidents={openIncidents} total={openIncidentCount} />
                            </div>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-12">
                            <div className="min-w-0 xl:col-span-8">
                                <LiveTrendPanel
                                    reactors={panels.map((p) => ({
                                        serialNumber: p.device.serialNumber,
                                        name: p.device.name,
                                        sensors: p.device.sensors,
                                        calibrated: p.device.calibrated,
                                    }))}
                                />
                            </div>
                            {/* Out of flow at xl so the chart alone sets the row height and the
                                feed scrolls inside it; in flow, fifteen entries would stretch the
                                row and pad the chart with dead space. */}
                            <div className="relative h-96 xl:col-span-4 xl:h-auto">
                                <div className="h-full xl:absolute xl:inset-0">
                                    <LogsWidget logs={recentLogs} />
                                </div>
                            </div>
                        </div>
                    </>
                )}

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {devices.length > 0 && (
                        <ValveSummary
                            reactors={devices.map((d) => ({
                                id: d.id,
                                serialNumber: d.serialNumber,
                                name: d.name,
                                control: ((d.config ?? {}) as { control?: ValveControl }).control ?? null,
                            }))}
                        />
                    )}
                    <CalibrationPanel
                        rows={calibrationSchedule.slice(0, 6).map((row) => ({
                            ...row,
                            daysLeft: row.validUntil ? Math.ceil((row.validUntil.getTime() - now.getTime()) / DAY_MS) : null,
                        }))}
                    />
                    <RecentExperimentsPanel
                        experiments={recentExperiments.map((e) => ({
                            id: e.id,
                            projectId: e.projectId,
                            name: e.name,
                            projectName: e.project.name,
                            status: e.status,
                            startedAt: e.startDate,
                        }))}
                    />
                    <ProjectsPanel
                        projects={projects.map((p) => ({
                            id: p.id,
                            name: p.name,
                            devices: p._count.devices,
                            experiments: p._count.experiments,
                            openAlerts: openAlertsByProject[p.id] ?? 0,
                        }))}
                    />
                </div>
            </div>
        </AppShell>
    );
}
