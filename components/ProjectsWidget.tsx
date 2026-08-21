import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ProjectCardMenu } from "@/components/ProjectCardMenu";

interface ProjectEntry {
    id: string;
    name: string;
    createdAt: Date;
    createdByName: string | null;
    experimentCount: number;
    alertCount: number;
    deviceCount: number;
}

function formatDate(date: Date) {
    return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Recent projects with their live counts - mirrors app-gui's dashboard project card, minus the member avatar stack (no team model here). */
export function ProjectsWidget({ projects }: { projects: ProjectEntry[] }) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Projetos</CardTitle>
                <Link href="/projects" className="text-xs font-medium text-brand hover:underline">
                    Ver todos
                </Link>
            </CardHeader>
            <CardContent className="space-y-3">
                {projects.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum projeto criado.</p>
                ) : (
                    projects.map((project) => (
                        <div key={project.id} className="rounded-lg border border-border p-3">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <Link href={`/projects/${project.id}`} className="truncate font-semibold hover:underline">
                                        {project.name}
                                    </Link>
                                    <p className="text-xs text-muted-foreground">
                                        Criado em {formatDate(project.createdAt)}
                                        {project.createdByName && ` por ${project.createdByName}`}
                                    </p>
                                </div>
                                <ProjectCardMenu projectId={project.id} projectName={project.name} />
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2">
                                <div className="rounded-md bg-brand/10 p-2">
                                    <p className="gauge-label text-brand">Experiências</p>
                                    <p className="tabular text-lg font-semibold text-brand">{project.experimentCount}</p>
                                </div>
                                <div className="rounded-md bg-warning/10 p-2">
                                    <p className="gauge-label text-warning">Alertas</p>
                                    <p className="tabular text-lg font-semibold text-warning">{project.alertCount}</p>
                                </div>
                                <div className="rounded-md bg-metric-ph/10 p-2">
                                    <p className="gauge-label text-metric-ph">Sensores</p>
                                    <p className="tabular text-lg font-semibold text-metric-ph">{project.deviceCount}</p>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </CardContent>
        </Card>
    );
}
