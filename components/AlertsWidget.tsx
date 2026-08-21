import { AlertCircle, TriangleAlert, Info, CircleCheck } from "lucide-react";
import { LogLevel } from "@prisma/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface LogEntry {
    id: string;
    level: LogLevel;
    message: string;
    timestamp: Date;
}

const LEVEL_ICON: Record<LogLevel, typeof AlertCircle> = {
    CRITICAL: AlertCircle,
    ERROR: AlertCircle,
    WARN: TriangleAlert,
    INFO: Info,
};

const LEVEL_COLOR: Record<LogLevel, string> = {
    CRITICAL: "text-danger",
    ERROR: "text-danger",
    WARN: "text-warning",
    INFO: "text-muted-foreground",
};

function formatTimestamp(date: Date) {
    return date.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Recent SystemLog rows at WARN or above - things that ask for the operator's attention. */
export function AlertsWidget({ logs }: { logs: LogEntry[] }) {
    const critical = logs.filter((l) => l.level === "CRITICAL").length;
    const warn = logs.filter((l) => l.level === "WARN" || l.level === "ERROR").length;

    return (
        <Card id="alertas">
            <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                    <span>Alertas</span>
                    {logs.length > 0 && (
                        <span className="gauge-label font-normal text-muted-foreground">
                            {critical > 0 && <span className="text-danger">{critical} crítico{critical !== 1 ? "s" : ""}</span>}
                            {critical > 0 && warn > 0 && " · "}
                            {warn > 0 && <span className="text-warning">{warn} aviso{warn !== 1 ? "s" : ""}</span>}
                        </span>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {logs.length === 0 ? (
                    <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 p-4 text-sm text-success">
                        <CircleCheck className="size-4 shrink-0" aria-hidden />
                        Nenhum alerta a reportar.
                    </div>
                ) : (
                    <div className="space-y-1">
                        {logs.map((log) => {
                            const Icon = LEVEL_ICON[log.level];
                            return (
                                <div key={log.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm">
                                    <Icon className={`mt-0.5 size-4 shrink-0 ${LEVEL_COLOR[log.level]}`} aria-hidden />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate">{log.message}</p>
                                        <p className="tabular text-xs text-muted-foreground">{formatTimestamp(log.timestamp)}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
