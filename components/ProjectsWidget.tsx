"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectCardMenu } from "@/components/ProjectCardMenu";

interface ProjectEntry {
    id: string;
    name: string;
    description: string | null;
    deviceIds: string[];
    createdAt: Date;
    createdByName: string | null;
    experimentCount: number;
    alertCount: number;
    deviceCount: number;
}

function formatDate(date: Date) {
    return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** One project at a time, cycled via the dots - mirrors app-gui's dashboard project card, minus the member avatar stack (no team model here). */
export function ProjectsWidget({ projects }: { projects: ProjectEntry[] }) {
    const [index, setIndex] = useState(0);

    if (projects.length === 0) {
        return (
            <Card className="h-full">
                <CardContent className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                    Nenhum projeto criado.
                </CardContent>
            </Card>
        );
    }

    const project = projects[Math.min(index, projects.length - 1)];

    return (
        <Card className="h-full">
            <CardContent className="flex h-full flex-col justify-between">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <Link href={`/projects/${project.id}`} className="truncate text-lg font-semibold hover:underline">
                            {project.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                            Criado em {formatDate(project.createdAt)}
                            {project.createdByName && (
                                <>
                                    {" por "}
                                    <span className="font-medium text-brand">{project.createdByName}</span>
                                </>
                            )}
                        </p>
                    </div>
                    <ProjectCardMenu project={project} />
                </div>

                <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-brand/10 p-3">
                        <p className="gauge-label text-brand">Experiências</p>
                        <p className="tabular mt-1 text-3xl font-semibold text-brand">{project.experimentCount}</p>
                    </div>
                    <div className="rounded-lg bg-secondary p-3">
                        <p className="gauge-label text-muted-foreground">Alertas</p>
                        <p className="tabular mt-1 text-3xl font-semibold">{project.alertCount}</p>
                    </div>
                    <div className="rounded-lg bg-metric-ph/10 p-3">
                        <p className="gauge-label text-metric-ph">Sensores</p>
                        <p className="tabular mt-1 text-3xl font-semibold text-metric-ph">{project.deviceCount}</p>
                    </div>
                </div>

                {projects.length > 1 && (
                    <div className="flex justify-center gap-1.5 pt-1">
                        {projects.map((p, i) => (
                            <button
                                key={p.id}
                                onClick={() => setIndex(i)}
                                aria-label={`Ver projeto ${p.name}`}
                                aria-current={i === index}
                                className={cn("size-1.5 rounded-full transition-colors", i === index ? "bg-brand" : "bg-border")}
                            />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
