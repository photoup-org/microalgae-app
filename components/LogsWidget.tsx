"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogLevel, LogCategory } from "@prisma/client";
import { Filter, ExternalLink, FlaskConical, Cpu, Settings2, TriangleAlert, Wifi, WifiOff } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";

const REFRESH_INTERVAL_MS = 20_000;

/** Levels this widget ever shows - critical incidents live on the dedicated /incidents page. */
const WIDGET_LEVELS = [LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR] as const;

const LEVEL_LABEL: Record<(typeof WIDGET_LEVELS)[number], string> = { INFO: "Info", WARN: "Aviso", ERROR: "Erro" };
const LEVEL_BADGE_CLASS: Record<(typeof WIDGET_LEVELS)[number], string> = {
    INFO: "bg-primary/10 text-primary",
    WARN: "bg-warning/10 text-warning",
    ERROR: "bg-danger/10 text-danger",
};

const CATEGORY_ICON: Partial<Record<LogCategory, typeof FlaskConical>> = {
    EXPERIMENT: FlaskConical,
    HARDWARE: Cpu,
    SYSTEM: Settings2,
    ALERT: TriangleAlert,
};

interface LogEntry {
    id: string;
    level: LogLevel;
    category: LogCategory;
    message: string;
    timestamp: Date;
    metadata?: unknown;
}

/** device_tracker.py tags a HARDWARE connectivity log with metadata.event = "online" | "offline". */
function connectivityEvent(log: LogEntry): "online" | "offline" | null {
    if (log.category !== "HARDWARE") return null;
    const event = (log.metadata as { event?: string } | null)?.event;
    return event === "online" || event === "offline" ? event : null;
}

/** Opt-in per log entry - set by the writer (e.g. device_tracker.py), not inferred from level/category. */
function wantsToast(log: LogEntry): boolean {
    return (log.metadata as { showToast?: boolean } | null)?.showToast === true;
}

function formatDate(date: Date) {
    return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTime(date: Date) {
    return date.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

/** Merged INFO/WARN/ERROR feed with a type filter - critical incidents are deliberately excluded, see /incidents. */
export function LogsWidget({ logs }: { logs: LogEntry[] }) {
    const router = useRouter();
    const [visibleLevels, setVisibleLevels] = useState<Set<LogLevel>>(new Set(WIDGET_LEVELS));
    /** Seeded from the first render so existing history never toasts, only what arrives after. */
    const seenIds = useRef<Set<string> | null>(null);

    useEffect(() => {
        const id = setInterval(() => router.refresh(), REFRESH_INTERVAL_MS);
        return () => clearInterval(id);
    }, [router]);

    useEffect(() => {
        if (seenIds.current === null) {
            seenIds.current = new Set(logs.map((l) => l.id));
            return;
        }
        for (const log of logs) {
            if (seenIds.current.has(log.id)) continue;
            seenIds.current.add(log.id);
            if (!wantsToast(log)) continue;
            const event = connectivityEvent(log);
            if (event === "online") toast.success(log.message);
            else toast(log.message);
        }
    }, [logs]);

    const filtered = logs.filter((log) => visibleLevels.has(log.level));

    function toggleLevel(level: LogLevel) {
        setVisibleLevels((prev) => {
            const next = new Set(prev);
            if (next.has(level)) next.delete(level);
            else next.add(level);
            return next;
        });
    }

    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                    <span>Logs ({filtered.length})</span>
                    <div className="flex items-center gap-1">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-label="Filtrar logs">
                                    <Filter className="size-4" aria-hidden />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Filtrar por tipo</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {WIDGET_LEVELS.map((level) => (
                                    <DropdownMenuCheckboxItem
                                        key={level}
                                        checked={visibleLevels.has(level)}
                                        onSelect={(e) => e.preventDefault()}
                                        onCheckedChange={() => toggleLevel(level)}
                                    >
                                        {LEVEL_LABEL[level]}
                                    </DropdownMenuCheckboxItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button variant="ghost" size="icon-sm" aria-label="Ver todos os incidentes" asChild>
                            <Link href="/incidents">
                                <ExternalLink className="size-4" aria-hidden />
                            </Link>
                        </Button>
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                    {logs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Sem atividade registada.</p>
                    ) : filtered.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhum log corresponde aos filtros selecionados.</p>
                    ) : (
                        filtered.map((log) => {
                            const event = connectivityEvent(log);
                            const Icon = event === "online" ? Wifi : event === "offline" ? WifiOff : (CATEGORY_ICON[log.category] ?? Settings2);
                            const iconClass = event === "online" ? "bg-success/10 text-success" : event === "offline" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary";
                            return (
                                <div key={log.id} className="flex items-start gap-3 rounded-md px-2 py-1.5">
                                    <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
                                        <Icon className="size-4" aria-hidden />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm">{log.message}</p>
                                        <p className="tabular text-xs text-muted-foreground">
                                            <span className="font-medium text-foreground">{formatDate(log.timestamp)}</span>
                                            {" - "}
                                            {formatTime(log.timestamp)}
                                        </p>
                                    </div>
                                    <Badge className={`shrink-0 ${LEVEL_BADGE_CLASS[log.level as (typeof WIDGET_LEVELS)[number]] ?? ""}`}>
                                        {LEVEL_LABEL[log.level as (typeof WIDGET_LEVELS)[number]] ?? log.level}
                                    </Badge>
                                </div>
                            );
                        })
                    )}
                </div>
                <p className="gauge-label mt-2 flex shrink-0 items-center justify-center gap-2 text-muted-foreground">
                    <span className="live-dot size-2 rounded-full bg-success" aria-hidden />A ouvir logs
                </p>
            </CardContent>
        </Card>
    );
}
