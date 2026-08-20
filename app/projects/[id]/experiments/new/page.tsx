import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/core/prisma";
import { AppShell } from "@/components/AppShell";
import { NewExperimentForm } from "@/components/NewExperimentForm";

export const dynamic = "force-dynamic";

export default async function NewExperimentPage({ params }: PageProps<"/projects/[id]/experiments/new">) {
    const { id } = await params;

    const project = await prisma.project.findFirst({
        where: { id, departmentId: process.env.DEPARTMENT_ID },
        include: {
            devices: {
                include: { experiments: { where: { status: { in: ["PLANNED", "RUNNING", "PAUSED"] } } } },
            },
        },
    });
    if (!project) notFound();

    const devices = project.devices.map((d) => ({
        id: d.id,
        name: d.name,
        serialNumber: d.serialNumber,
        status: d.status,
        isAllocated: d.experiments.length > 0,
    }));

    return (
        <AppShell>
            <Link href={`/projects/${project.id}`} className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ChevronLeft className="size-4" aria-hidden />
                {project.name}
            </Link>

            <h1 className="mb-6 text-2xl font-semibold tracking-tight">Nova experiência</h1>

            <NewExperimentForm projectId={project.id} devices={devices} />
        </AppShell>
    );
}
