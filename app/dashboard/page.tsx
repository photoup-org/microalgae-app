import Link from "next/link";
import { ExperimentStatus } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeviceOnlineSummary } from "@/components/DeviceOnlineSummary";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
    const departmentId = process.env.DEPARTMENT_ID;

    const [projectCount, deviceCount, runningExperiments] = await Promise.all([
        prisma.project.count({ where: { departmentId } }),
        prisma.device.findMany({ where: { departmentId }, select: { serialNumber: true, name: true } }),
        prisma.experiment.findMany({
            where: { status: ExperimentStatus.RUNNING, project: { departmentId } },
            include: { project: true, devices: true },
            orderBy: { lastRunAt: "desc" },
        }),
    ]);

    return (
        <AppShell>
            <h1 className="mb-6 text-2xl font-semibold tracking-tight">Dashboard</h1>

            <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-normal text-muted-foreground">Projetos</CardTitle>
                    </CardHeader>
                    <CardContent className="text-2xl font-semibold">{projectCount}</CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-normal text-muted-foreground">Experiências em curso</CardTitle>
                    </CardHeader>
                    <CardContent className="text-2xl font-semibold">{runningExperiments.length}</CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-normal text-muted-foreground">Dispositivos online</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <DeviceOnlineSummary devices={deviceCount} />
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Experiências em curso</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    {runningExperiments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhuma experiência em curso.</p>
                    ) : (
                        runningExperiments.map((exp) => (
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
                        ))
                    )}
                </CardContent>
            </Card>
        </AppShell>
    );
}
