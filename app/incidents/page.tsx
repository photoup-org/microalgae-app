import { LogLevel, LogCategory } from "@prisma/client";
import { FlaskConical, Cpu, Settings2, TriangleAlert, Wifi, WifiOff } from "lucide-react";
import { prisma } from "@/lib/core/prisma";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IncidentsFilter } from "@/components/IncidentsFilter";
import { AcknowledgeButton, AcknowledgeAllButton } from "@/components/AcknowledgeButton";
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

interface IncidentRow {
    id: string;
    level: LogLevel;
    category: LogCategory;
    message: string;
    timestamp: Date;
    metadata: unknown;
    occurrences: number;
    lastSeenAt: Date | null;
    acknowledgedAt: Date | null;
    acknowledgedBy: string | null;
}

const ROW_FIELDS = {
    id: true,
    level: true,
    category: true,
    message: true,
    timestamp: true,
    metadata: true,
    occurrences: true,
    lastSeenAt: true,
    acknowledgedAt: true,
    acknowledgedBy: true,
} as const;

function IncidentLine({ log, open }: { log: IncidentRow; open: boolean }) {
    const event = connectivityEvent(log);
    const Icon = event === "online" ? Wifi : event === "offline" ? WifiOff : (CATEGORY_ICON[log.category] ?? Settings2);
    const iconClass =
        event === "online"
            ? "bg-success/10 text-success"
            : event === "offline"
              ? "bg-muted text-muted-foreground"
              : "bg-primary/10 text-primary";

    return (
        <div className={`flex items-start gap-3 px-4 py-3 ${open ? "" : "opacity-60"}`}>
            <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
                <Icon className="size-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-sm">{log.message}</p>
                <p className="tabular text-xs text-muted-foreground">
                    {/* Once a row has been folded into, `timestamp` is when the condition
                        STARTED and lastSeenAt is when it was last seen. Showing only one of
                        them would misreport how long it has been going on. */}
                    <span className="font-medium text-foreground">{formatDate(log.timestamp)}</span>
                    {" - "}
                    {formatTime(log.timestamp)}
                    {log.lastSeenAt && <> · última às {formatTime(log.lastSeenAt)}</>}
                    {log.acknowledgedBy && <> · reconhecido por {log.acknowledgedBy}</>}
                </p>
            </div>
            {log.occurrences > 1 && (
                <Badge variant="outline" className="tabular shrink-0" title={`${log.occurrences} ocorrências agrupadas`}>
                    ×{log.occurrences}
                </Badge>
            )}
            <Badge className={`shrink-0 ${LEVEL_BADGE_CLASS[log.level]}`}>{LEVEL_LABEL[log.level]}</Badge>
            {open && <AcknowledgeButton logId={log.id} />}
        </div>
    );
}

export default async function IncidentsPage({ searchParams }: PageProps<"/incidents">) {
    const { levels: levelsParam } = await searchParams;
    const selectedLevels = parseLevels(Array.isArray(levelsParam) ? levelsParam[0] : levelsParam);
    const departmentId = process.env.DEPARTMENT_ID;

    // Two queries rather than one sorted list: "open" and "history" are different
    // things, and a single orderBy cannot put every unacknowledged row first AND
    // keep each group newest-first (the acknowledgedAt key never ties). Open rows
    // are unbounded because they are the ones that must not fall off a page limit;
    // history is capped.
    const [open, history] = await Promise.all([
        prisma.systemLog.findMany({
            where: {
                departmentId,
                level: { in: selectedLevels.filter((l) => l !== LogLevel.INFO) },
                acknowledgedAt: null,
            },
            orderBy: { timestamp: "desc" },
            select: ROW_FIELDS,
        }),
        prisma.systemLog.findMany({
            where: {
                departmentId,
                level: { in: selectedLevels },
                OR: [{ acknowledgedAt: { not: null } }, { level: LogLevel.INFO }],
            },
            orderBy: { timestamp: "desc" },
            take: 100,
            select: ROW_FIELDS,
        }),
    ]);

    return (
        <AppShell>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Incidentes</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {open.length === 0
                            ? "Nada por tratar."
                            : `${open.length} por tratar, ${history.length} no histórico.`}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <AcknowledgeAllButton levels={selectedLevels} openCount={open.length} />
                    <IncidentsFilter selectedLevels={selectedLevels} />
                </div>
            </div>

            <section className="mb-8">
                <h2 className="gauge-label mb-2 text-muted-foreground">Por tratar</h2>
                {open.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">
                        Nenhum incidente por tratar.
                    </p>
                ) : (
                    <Card>
                        <CardContent className="divide-y divide-border p-0">
                            {open.map((log) => (
                                <IncidentLine key={log.id} log={log} open />
                            ))}
                        </CardContent>
                    </Card>
                )}
            </section>

            <section>
                <h2 className="gauge-label mb-2 text-muted-foreground">Histórico</h2>
                {history.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">
                        Sem registos correspondentes aos filtros selecionados.
                    </p>
                ) : (
                    <Card>
                        <CardContent className="divide-y divide-border p-0">
                            {history.map((log) => (
                                <IncidentLine key={log.id} log={log} open={false} />
                            ))}
                        </CardContent>
                    </Card>
                )}
            </section>
        </AppShell>
    );
}
