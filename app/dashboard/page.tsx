import Link from "next/link";
import { ExperimentStatus, LogLevel } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { getCalibrationRows } from "@/lib/calibration-rows";
import { REACTOR_SCHEMA } from "@/lib/reactor-schema";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogsWidget } from "@/components/LogsWidget";
import { ReactorPanel, type ReactorPanelProps } from "@/components/ReactorPanel";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
    return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function metricLabel(key: string) {
    return REACTOR_SCHEMA.find((m) => m.key === key)?.label ?? key;
}

/**
 * Reactor-first. The question an operator opens this page with is "are my
 * reactors fine right now", so each reactor leads with its live readings, the run
 * on it and anything overdue; fleet-wide counts and logs come after.
 */
export default async function DashboardPage() {
    const departmentId = process.env.DEPARTMENT_ID;

    const [projects, devices, activeRuns, recentLogs, alertCounts] = await Promise.all([
        prisma.project.findMany({
            where: { departmentId },
            select: { id: true, name: true, _count: { select: { experiments: true, devices: true } } },
            orderBy: { createdAt: "desc" },
            take: 5,
        }),
        prisma.device.findMany({
            where: { departmentId },
            select: { id: true, name: true, serialNumber: true, status: true, config: true },
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
        prisma.systemLog.groupBy({
            by: ["projectId"],
            where: {
                departmentId,
                level: { in: [LogLevel.WARN, LogLevel.ERROR, LogLevel.CRITICAL] },
                acknowledgedAt: null,
            },
            _count: true,
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

    return (
        <AppShell title="Dashboard">
            <div className="mx-auto max-w-screen-xl space-y-6">
                <section aria-label="Reatores" className="space-y-4">
                    {panels.length === 0 ? (
                        <Card>
                            <CardContent className="py-8 text-center text-sm text-muted-foreground">
                                Ainda não há reatores. Aparecem aqui assim que um nó ESP32 se liga pela primeira vez.
                            </CardContent>
                        </Card>
                    ) : (
                        panels.map((panel) => <ReactorPanel key={panel.device.id} {...panel} />)
                    )}
                </section>

                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Fixed height at every width: the card scrolls inside, so fifteen
                        entries never push Projetos a screen below. */}
                    <div className="h-80 lg:col-span-2">
                        <LogsWidget logs={recentLogs} />
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Projetos</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1">
                            {projects.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Ainda não há projetos.{" "}
                                    <Link href="/projects?new=1" className="font-medium text-primary hover:underline">
                                        Criar projeto
                                    </Link>
                                </p>
                            ) : (
                                projects.map((project) => {
                                    const openAlerts = openAlertsByProject[project.id] ?? 0;
                                    return (
                                        <Link
                                            key={project.id}
                                            href={`/projects/${project.id}`}
                                            className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-accent"
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate font-medium">{project.name}</span>
                                                <span className="tabular block text-xs text-muted-foreground">
                                                    {project._count.devices} reator{project._count.devices === 1 ? "" : "es"},{" "}
                                                    {project._count.experiments} experiência{project._count.experiments === 1 ? "" : "s"}
                                                </span>
                                            </span>
                                            {openAlerts > 0 && (
                                                <span className="tabular shrink-0 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                                                    {openAlerts} por tratar
                                                </span>
                                            )}
                                        </Link>
                                    );
                                })
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </AppShell>
    );
}
