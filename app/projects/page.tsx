import Link from "next/link";
import { ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { getAssignableDevicesAction } from "@/actions/projects";
import { AppShell } from "@/components/AppShell";
import { ProjectFormDialog } from "@/components/ProjectFormDialog";
import { ResyncButton } from "@/components/ResyncButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
    const [projects, assignableDevices] = await Promise.all([
        prisma.project.findMany({
            where: { departmentId: process.env.DEPARTMENT_ID, status: ProjectStatus.ACTIVE },
            include: { _count: { select: { devices: true, experiments: true } } },
            orderBy: { createdAt: "desc" },
        }),
        getAssignableDevicesAction(),
    ]);

    return (
        <AppShell>
            <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Projetos</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {projects.length === 0 ? "Nenhum projeto." : `${projects.length} projeto(s).`}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <ResyncButton />
                    <ProjectFormDialog assignableDevices={assignableDevices} />
                </div>
            </div>

            {projects.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">
                    Crie um projeto e associe-lhe os reatores disponíveis.
                </p>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {projects.map((project) => (
                        <Link key={project.id} href={`/projects/${project.id}`}>
                            <Card className="h-full transition-colors hover:border-brand">
                                <CardHeader>
                                    <CardTitle className="text-base">{project.name}</CardTitle>
                                </CardHeader>
                                <CardContent className="text-sm text-muted-foreground">
                                    {project._count.devices} dispositivo{project._count.devices === 1 ? "" : "s"} ·{" "}
                                    {project._count.experiments} experiência{project._count.experiments === 1 ? "" : "s"}
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </AppShell>
    );
}
