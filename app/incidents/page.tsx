import { LogLevel, LogCategory } from "@prisma/client";
import { FlaskConical, Cpu, Settings2, TriangleAlert, Wifi, WifiOff } from "lucide-react";
import { prisma } from "@/lib/core/prisma";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IncidentsFilter } from "@/components/IncidentsFilter";
import { ALL_LEVELS, LEVEL_LABEL } from "@/lib/log-levels";

export const dynamic = "force-dynamic";

const CATEGORY_ICON: Partial<Record<LogCategory, typeof FlaskConical>> = {
    EXPERIMENT: FlaskConical,
    HARDWARE: Cpu,
    SYSTEM: Settings2,
    ALERT: TriangleAlert,
};

const LEVEL_BADGE_CLASS: Record<LogLevel, string> = {
    INFO: "bg-primary/10 text-primary",
    WARN: "bg-warning/10 text-warning",
    ERROR: "bg-danger/10 text-danger",
    CRITICAL: "bg-danger text-white",
};

function formatDate(date: Date) {
    return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTime(date: Date) {
    return date.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

/** device_tracker.py tags a HARDWARE connectivity log with metadata.event = "online" | "offline". */
function connectivityEvent(log: { category: LogCategory; metadata: unknown }): "online" | "offline" | null {
    if (log.category !== "HARDWARE") return null;
    const event = (log.metadata as { event?: string } | null)?.event;
    return event === "online" || event === "offline" ? event : null;
}

function parseLevels(raw: string | undefined): LogLevel[] {
    if (raw === undefined) return ALL_LEVELS;
    return raw.split(",").filter((l): l is LogLevel => (ALL_LEVELS as string[]).includes(l));
}

export default async function IncidentsPage({ searchParams }: PageProps<"/incidents">) {
    const { levels: levelsParam } = await searchParams;
    const selectedLevels = parseLevels(Array.isArray(levelsParam) ? levelsParam[0] : levelsParam);

    const logs = await prisma.systemLog.findMany({
        where: {
            departmentId: process.env.DEPARTMENT_ID,
            level: { in: selectedLevels },
        },
        orderBy: { timestamp: "desc" },
        take: 100,
    });

    return (
        <AppShell>
            <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Incidentes</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {logs.length === 0 ? "Nenhum registo para os filtros selecionados." : `${logs.length} registo(s), mais recentes primeiro.`}
                    </p>
                </div>
                <IncidentsFilter selectedLevels={selectedLevels} />
            </div>

            {logs.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">
                    Sem registos correspondentes aos filtros selecionados.
                </p>
            ) : (
                <Card>
                    <CardContent className="divide-y divide-border p-0">
                        {logs.map((log) => {
                            const event = connectivityEvent(log);
                            const Icon = event === "online" ? Wifi : event === "offline" ? WifiOff : (CATEGORY_ICON[log.category] ?? Settings2);
                            const iconClass = event === "online" ? "bg-success/10 text-success" : event === "offline" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary";
                            return (
                                <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                                    <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
                                        <Icon className="size-4" aria-hidden />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm">{log.message}</p>
                                        <p className="tabular text-xs text-muted-foreground">
                                            <span className="font-medium text-foreground">{formatDate(log.timestamp)}</span>
                                            {" - "}
                                            {formatTime(log.timestamp)}
                                        </p>
                                    </div>
                                    <Badge className={`shrink-0 ${LEVEL_BADGE_CLASS[log.level]}`}>{LEVEL_LABEL[log.level]}</Badge>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            )}
        </AppShell>
    );
}
