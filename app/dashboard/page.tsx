import Link from "next/link";
import { ExperimentStatus, LogLevel } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/StatTile";
import { DeviceOnlineSummary } from "@/components/DeviceOnlineSummary";
import { AlertsWidget } from "@/components/AlertsWidget";
import { DeviceListWidget } from "@/components/DeviceListWidget";
import { CalibrationOverviewWidget } from "@/components/CalibrationOverviewWidget";
import { InventoryDonut } from "@/components/InventoryDonut";
import { ProjectsWidget } from "@/components/ProjectsWidget";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
    const departmentId = process.env.DEPARTMENT_ID;

    const [projects, devices, runningExperiments, recentAlerts] = await Promise.all([
        prisma.project.findMany({
            where: { departmentId },
            include: { createdBy: true, _count: { select: { experiments: true, devices: true } } },
            orderBy: { createdAt: "desc" },
            take: 3,
        }),
        prisma.device.findMany({
            where: { departmentId },
            select: { id: true, name: true, serialNumber: true, status: true, lastCalibrated: true, calibrationDueDate: true },
            orderBy: { name: "asc" },
        }),
        prisma.experiment.findMany({
            where: { status: ExperimentStatus.RUNNING, project: { departmentId } },
            include: { project: true, devices: true },
            orderBy: { lastRunAt: "desc" },
        }),
        prisma.systemLog.findMany({
            where: { departmentId, level: { in: [LogLevel.WARN, LogLevel.ERROR, LogLevel.CRITICAL] } },
            orderBy: { timestamp: "desc" },
            take: 5,
            select: { id: true, level: true, message: true, timestamp: true },
        }),
    ]);

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
        <AppShell title="Dashboard" >
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
                <StatTile label="Projetos" value={projects.length} accent="var(--culture)" />
                <StatTile label="Experiências em curso" value={runningExperiments.length} accent="var(--brand)" />
                <StatTile label="Dispositivos online" value={<DeviceOnlineSummary devices={devices} />} accent="var(--metric-co2)" />
            </div>

            <div className="space-y-6">
                {runningExperiments.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Experiências em curso</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {runningExperiments.map((exp) => (
                                <Link
                                    key={exp.id}
                                    href={`/projects/${exp.projectId}/experiments/${exp.id}`}
                                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
                                >
                                    <span>
                                        <span className="font-medium">{exp.name}</span>
                                        <span className="text-muted-foreground"> · {exp.project.name}</span>
                                    </span>
                                    <span className="tabular text-muted-foreground">
                                        {exp.devices.length} dispositivo{exp.devices.length === 1 ? "" : "s"}
                                    </span>
                                </Link>
                            ))}
                        </CardContent>
                    </Card>
                )}

                <ProjectsWidget
                    projects={projects.map((p) => ({
                        id: p.id,
                        name: p.name,
                        createdAt: p.createdAt,
                        createdByName: p.createdBy?.name ?? null,
                        experimentCount: p._count.experiments,
                        deviceCount: p._count.devices,
                        alertCount: alertCountByProject[p.id] ?? 0,
                    }))}
                />

                <div className="grid gap-6 lg:grid-cols-2">
                    <DeviceListWidget devices={devices} />
                    <AlertsWidget logs={recentAlerts} />
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                    <CalibrationOverviewWidget devices={devices} />
                    <InventoryDonut devices={devices} />
                </div>
            </div>
        </AppShell>
    );
}
