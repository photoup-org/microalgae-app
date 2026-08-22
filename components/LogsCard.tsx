import { LogLevel, LogCategory } from "@prisma/client";
import { FlaskConical, Cpu, Settings2, TriangleAlert, CircleCheck } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LEVEL_LABEL } from "@/lib/log-levels";

export interface LogCardEntry {
    id: string;
    level: LogLevel;
    category: LogCategory;
    message: string;
    timestamp: Date;
}

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

function formatTimestamp(date: Date) {
    return date.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * A scrolling list of SystemLog rows, scoped by whoever fetches them.
 *
 * Used for both an experiment's own alerts (scoped by experimentId - mostly the
 * threshold breaches the edge worker raises against the min/max limits set at
 * creation) and one reactor's recent history (scoped by deviceId). The scoping is
 * the caller's job so the same card can front either query.
 */
export function LogsCard({
    title,
    logs,
    emptyMessage,
    action,
}: {
    title: string;
    logs: LogCardEntry[];
    emptyMessage: string;
    /** Rendered right-aligned in the header - a filter or count control. */
    action?: React.ReactNode;
}) {
    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3 text-base">
                    <span className="min-w-0 truncate">{title}</span>
                    {action}
                </CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto">
                {logs.length === 0 ? (
                    <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 p-4 text-sm text-success">
                        <CircleCheck className="size-4 shrink-0" aria-hidden />
                        {emptyMessage}
                    </div>
                ) : (
                    <div className="space-y-1">
                        {logs.map((log) => {
                            const Icon = CATEGORY_ICON[log.category] ?? Settings2;
                            return (
                                <div key={log.id} className="flex items-start gap-3 rounded-md px-2 py-1.5">
                                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                        <Icon className="size-4 text-primary" aria-hidden />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm">{log.message}</p>
                                        <p className="tabular text-xs text-muted-foreground">{formatTimestamp(log.timestamp)}</p>
                                    </div>
                                    <Badge className={`shrink-0 ${LEVEL_BADGE_CLASS[log.level]}`}>{LEVEL_LABEL[log.level]}</Badge>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
