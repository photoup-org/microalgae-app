import Link from "next/link";
import { ExperimentStatus, LogLevel } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeviceListWidget } from "@/components/DeviceListWidget";
import { CalibrationOverviewWidget } from "@/components/CalibrationOverviewWidget";
import { InventoryDonut } from "@/components/InventoryDonut";
import { ProjectsWidget } from "@/components/ProjectsWidget";
import { ExperimentElapsed } from "@/components/ExperimentElapsed";
import { ExperimentQuickControls } from "@/components/ExperimentQuickControls";
import { LogsWidget } from "@/components/LogsWidget";
import { ExperimentStatusDonut } from "@/components/ExperimentStatusDonut";
import { SensorChannelsWidget } from "@/components/SensorChannelsWidget";
import { AttentionNeededWidget } from "@/components/AttentionNeededWidget";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
    const departmentId = process.env.DEPARTMENT_ID;

    const [projects, devices, runningExperiments, recentLogs] = await Promise.all([
        prisma.project.findMany({
            where: { departmentId },
            include: {
                createdBy: true,
                devices: { select: { id: true } },
                _count: { select: { experiments: true, devices: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 5,
        }),
        prisma.device.findMany({
            where: { departmentId },
            select: { id: true, name: true, serialNumber: true, status: true, lastCalibrated: true, calibrationDueDate: true, config: true },
            orderBy: { name: "asc" },
        }),
        prisma.experiment.findMany({
            where: { status: ExperimentStatus.RUNNING, project: { departmentId } },
            include: { project: true, devices: true },
            orderBy: { lastRunAt: "desc" },
        }),
        prisma.systemLog.findMany({
            where: { departmentId, level: { in: [LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR] } },
            orderBy: { timestamp: "desc" },
            take: 15,
            select: { id: true, level: true, category: true, message: true, timestamp: true, metadata: true },
        }),
    ]);

    const experimentStatusCounts = await prisma.experiment.groupBy({
        by: ["status"],
        where: { project: { departmentId } },
        _count: true,
    });
    const experimentCountByStatus = Object.fromEntries(experimentStatusCounts.map((e) => [e.status, e._count]));

    const alertCounts = await prisma.systemLog.groupBy({
        by: ["projectId"],
        where: {
            departmentId,
            projectId: { in: projects.map((p) => p.id) },
            level: { in: [LogLevel.WARN, LogLevel.ERROR, LogLevel.CRITICAL] },
        },
        _count: true,
    });
    const alertCountByProject = Object.fromEntries(alertCounts.map((a) => [a.projectId, a._count]));

    return (
        <AppShell title="Dashboard">
            <div className="mx-auto max-w-screen-xl space-y-6">
                {runningExperiments.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Experiências em curso</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {runningExperiments.map((exp) => (
                                // A row, not a Link: the controls are buttons, which cannot sit inside an anchor.
                                <div
                                    key={exp.id}
                                    className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                                >
                                    <p className="min-w-0 truncate">
                                        <Link
                                            href={`/projects/${exp.projectId}/experiments/${exp.id}`}
                                            className="font-medium hover:underline"
                                        >
                                            {exp.name}
                                        </Link>
                                        <span className="text-muted-foreground"> · {exp.project.name}</span>
                                    </p>
                                    <div className="flex shrink-0 items-center gap-3">
                                        <span className="tabular text-muted-foreground">
                                            <ExperimentElapsed
                                                accumulatedSeconds={exp.accumulatedSeconds}
                                                lastRunAt={exp.lastRunAt?.toISOString() ?? null}
                                            />
                                        </span>
                                        <span className="tabular hidden text-muted-foreground sm:inline">
                                            {exp.devices.length} dispositivo{exp.devices.length === 1 ? "" : "s"}
                                        </span>
                                        <ExperimentQuickControls experimentId={exp.id} name={exp.name} />
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}

                <div className="grid gap-6 lg:auto-rows-[280px] lg:grid-cols-3">
                    <ProjectsWidget
                        projects={projects.map((p) => ({
                            id: p.id,
                            name: p.name,
                            description: p.description,
                            deviceIds: p.devices.map((d) => d.id),
                            createdAt: p.createdAt,
                            createdByName: p.createdBy?.name ?? null,
                            experimentCount: p._count.experiments,
                            deviceCount: p._count.devices,
                            alertCount: alertCountByProject[p.id] ?? 0,
                        }))}
                    />
                    <LogsWidget logs={recentLogs} />
                    <InventoryDonut devices={devices} />
                </div>

                <div className="grid gap-6 lg:auto-rows-[280px] lg:grid-cols-3">
                    <DeviceListWidget devices={devices} />
                    <CalibrationOverviewWidget devices={devices} />
                    <ExperimentStatusDonut counts={experimentCountByStatus} />
                </div>

                <div className="grid gap-6 lg:auto-rows-[280px] lg:grid-cols-2">
                    <SensorChannelsWidget devices={devices} />
                    <AttentionNeededWidget devices={devices} />
                </div>
            </div>
        </AppShell>
    );
}
