import Link from "next/link";
import { ExperimentStatus, LogLevel } from "@prisma/client";
import { cn } from "@/lib/utils";
import { LEVEL_LABEL } from "@/lib/log-levels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AcknowledgeButton } from "@/components/AcknowledgeButton";
import { ExperimentStatusBadge } from "@/components/ExperimentStatusBadge";

/*
 * The dashboard's server-rendered list panels. Each one shows the top few rows of
 * something that has its own page, and says where the rest is.
 */

function shortDate(date: Date) {
    return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
}

function shortDateTime(date: Date) {
    return `${shortDate(date)}, ${date.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`;
}

function PanelHeader({ title, href, linkText }: { title: string; href: string; linkText: string }) {
    return (
        <CardHeader className="flex items-center justify-between gap-2">
            <CardTitle>{title}</CardTitle>
            <Link href={href} className="text-xs font-medium text-primary hover:underline">
                {linkText}
            </Link>
        </CardHeader>
    );
}

export function IncidentsPanel({
    incidents,
    total,
}: {
    incidents: { id: string; level: LogLevel; message: string; timestamp: Date }[];
    total: number;
}) {
    return (
        <Card className="h-full">
            <PanelHeader title={`Incidentes por tratar${total > 0 ? ` (${total})` : ""}`} href="/incidents" linkText="Ver todos" />
            <CardContent className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                {incidents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nada por tratar.</p>
                ) : (
                    incidents.map((incident) => (
                        <div key={incident.id} className="flex items-start gap-2 rounded-md py-1">
                            <span
                                className={cn(
                                    "mt-1.5 size-2 shrink-0 rounded-full",
                                    incident.level === LogLevel.WARN ? "bg-warning" : "bg-danger"
                                )}
                                aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                                <p className="line-clamp-2 text-sm [overflow-wrap:anywhere]">{incident.message}</p>
                                <p className="text-xs text-muted-foreground">
                                    {LEVEL_LABEL[incident.level]}, {shortDateTime(incident.timestamp)}
                                </p>
                            </div>
                            <AcknowledgeButton logId={incident.id} />
                        </div>
                    ))
                )}
            </CardContent>
        </Card>
    );
}

export function CalibrationPanel({
    rows,
}: {
    /** daysLeft is computed by the caller: a component reading the clock during render is impure. */
    rows: { key: string; deviceId: string; deviceName: string; channel: string; daysLeft: number | null; calibrated: boolean }[];
}) {
    return (
        <Card className="h-full">
            <PanelHeader title="Calibrações" href="/devices" linkText="Reatores" />
            <CardContent className="space-y-1">
                {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum sensor calibrável.</p>
                ) : (
                    rows.map((row) => {
                        const days = row.daysLeft;
                        const text = !row.calibrated
                            ? "Nunca calibrado"
                            : days === null
                              ? "Sem validade"
                              : days < 0
                                ? `Expirou há ${-days} d`
                                : days === 0
                                  ? "Expira hoje"
                                  : `${days} d restantes`;
                        const tone = !row.calibrated || (days !== null && days < 0) ? "text-danger" : days !== null && days <= 14 ? "text-warning" : "text-muted-foreground";
                        return (
                            <Link
                                key={row.key}
                                href={`/devices/${row.deviceId}`}
                                className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                            >
                                <span className="min-w-0 truncate">
                                    {row.channel}
                                    <span className="text-muted-foreground"> em {row.deviceName}</span>
                                </span>
                                <span className={cn("tabular shrink-0 text-xs font-medium", tone)}>{text}</span>
                            </Link>
                        );
                    })
                )}
            </CardContent>
        </Card>
    );
}

export function RecentExperimentsPanel({
    experiments,
}: {
    experiments: { id: string; projectId: string; name: string; projectName: string; status: ExperimentStatus; startedAt: Date | null }[];
}) {
    return (
        <Card className="h-full">
            <PanelHeader title="Experiências recentes" href="/projects" linkText="Projetos" />
            <CardContent className="space-y-1">
                {experiments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Ainda não há experiências. Crie uma a partir de um projeto.</p>
                ) : (
                    experiments.map((exp) => (
                        <Link
                            key={exp.id}
                            href={`/projects/${exp.projectId}/experiments/${exp.id}`}
                            className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
                        >
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-medium">{exp.name}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                    {exp.projectName}
                                    {exp.startedAt && `, início ${shortDate(exp.startedAt)}`}
                                </span>
                            </span>
                            <ExperimentStatusBadge status={exp.status} />
                        </Link>
                    ))
                )}
            </CardContent>
        </Card>
    );
}

export function ProjectsPanel({
    projects,
}: {
    projects: { id: string; name: string; devices: number; experiments: number; openAlerts: number }[];
}) {
    return (
        <Card className="h-full">
            <PanelHeader title="Projetos" href="/projects" linkText="Ver todos" />
            <CardContent className="space-y-1">
                {projects.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Ainda não há projetos.{" "}
                        <Link href="/projects?new=1" className="font-medium text-primary hover:underline">
                            Criar projeto
                        </Link>
                    </p>
                ) : (
                    projects.map((project) => (
                        <Link
                            key={project.id}
                            href={`/projects/${project.id}`}
                            className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
                        >
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-medium">{project.name}</span>
                                <span className="block text-xs text-muted-foreground">
                                    {project.devices} reator{project.devices === 1 ? "" : "es"}, {project.experiments} experiência
                                    {project.experiments === 1 ? "" : "s"}
                                </span>
                            </span>
                            {project.openAlerts > 0 && (
                                <span className="tabular shrink-0 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                                    {project.openAlerts} por tratar
                                </span>
                            )}
                        </Link>
                    ))
                )}
            </CardContent>
        </Card>
    );
}
