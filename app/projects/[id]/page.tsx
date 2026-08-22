import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Plus } from "lucide-react";
import { prisma } from "@/lib/core/prisma";
import { AppShell } from "@/components/AppShell";
import { ProjectCardMenu } from "@/components/ProjectCardMenu";
import { ExperimentActionsMenu } from "@/components/ExperimentActionsMenu";
import { DeviceStatusBadge } from "@/components/DeviceStatusBadge";
import { ExperimentStatusBadge } from "@/components/ExperimentStatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
    const { id } = await params;

    const project = await prisma.project.findFirst({
        where: { id, departmentId: process.env.DEPARTMENT_ID },
        include: {
            devices: true,
            experiments: { orderBy: { startDate: "desc" }, include: { devices: true } },
        },
    });
    if (!project) notFound();

    return (
        <AppShell>
            <Link href="/projects" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ChevronLeft className="size-4" aria-hidden />
                Projetos
            </Link>

            <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
                    {project.description && <p className="mt-1 max-w-prose text-sm text-muted-foreground">{project.description}</p>}
                </div>
                <ProjectCardMenu
                    project={{
                        id: project.id,
                        name: project.name,
                        description: project.description,
                        deviceIds: project.devices.map((d) => d.id),
                    }}
                    // Already on the details page, so that entry would be a no-op, and a
                    // deleted project has no page left to refresh into.
                    hideDetails
                    afterDelete="to-projects"
                />
            </div>

            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Reatores</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {project.devices.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nenhum dispositivo atribuído.</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nome</TableHead>
                                        <TableHead>Número de série</TableHead>
                                        <TableHead>Estado</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {project.devices.map((device) => (
                                        <TableRow key={device.id}>
                                            <TableCell>
                                                <Link href={`/devices/${device.id}`} className="font-medium hover:underline">
                                                    {device.name}
                                                </Link>
                                            </TableCell>
                                            <TableCell className="tabular text-muted-foreground">{device.serialNumber}</TableCell>
                                            <TableCell><DeviceStatusBadge status={device.status} /></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-base">Experiências</CardTitle>
                        <Button size="sm" asChild disabled={project.devices.length === 0}>
                            <Link href={`/projects/${project.id}/experiments/new`}>
                                <Plus className="size-4" aria-hidden />
                                Nova experiência
                            </Link>
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {project.experiments.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nenhuma experiência criada.</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nome</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead>Início</TableHead>
                                        <TableHead>Dispositivos</TableHead>
                                        <TableHead className="w-px" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {project.experiments.map((exp) => (
                                        <TableRow key={exp.id}>
                                            <TableCell>
                                                <Link href={`/projects/${project.id}/experiments/${exp.id}`} className="font-medium hover:underline">
                                                    {exp.name}
                                                </Link>
                                            </TableCell>
                                            <TableCell><ExperimentStatusBadge status={exp.status} /></TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {exp.startDate.toLocaleDateString("pt-PT")}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">{exp.devices.length}</TableCell>
                                            <TableCell className="text-right">
                                                <ExperimentActionsMenu
                                                    experimentId={exp.id}
                                                    projectId={project.id}
                                                    name={exp.name}
                                                    status={exp.status}
                                                    dbInterval={((exp.settings ?? {}) as { dbInterval?: number }).dbInterval ?? 60}
                                                    afterDelete="refresh"
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppShell>
    );
}
