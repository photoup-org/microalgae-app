import { LogLevel } from "@prisma/client";
import { AlertCircle, TriangleAlert } from "lucide-react";
import { prisma } from "@/lib/core/prisma";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const LEVEL_ICON = { CRITICAL: AlertCircle, ERROR: AlertCircle, WARN: TriangleAlert } as const;
const LEVEL_COLOR = { CRITICAL: "text-danger", ERROR: "text-danger", WARN: "text-warning" } as const;
const LEVEL_LABEL = { CRITICAL: "Crítico", ERROR: "Erro", WARN: "Aviso" } as const;

function formatTimestamp(date: Date) {
    return date.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function IncidentsPage() {
    const logs = await prisma.systemLog.findMany({
        where: {
            departmentId: process.env.DEPARTMENT_ID,
            level: { in: [LogLevel.WARN, LogLevel.ERROR, LogLevel.CRITICAL] },
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
                        {logs.length === 0 ? "Nenhum incidente registado." : `${logs.length} incidente(s), mais recentes primeiro.`}
                    </p>
                </div>
            </div>

            {logs.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">
                    Sem avisos ou erros reportados pelos dispositivos.
                </p>
            ) : (
                <Card>
                    <CardContent className="divide-y divide-border p-0">
                        {logs.map((log) => {
                            const Icon = LEVEL_ICON[log.level as keyof typeof LEVEL_ICON] ?? TriangleAlert;
                            const color = LEVEL_COLOR[log.level as keyof typeof LEVEL_COLOR] ?? "text-warning";
                            return (
                                <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                                    <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} aria-hidden />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm">{log.message}</p>
                                        <p className="tabular mt-0.5 text-xs text-muted-foreground">
                                            {formatTimestamp(log.timestamp)} · {LEVEL_LABEL[log.level as keyof typeof LEVEL_LABEL] ?? log.level}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            )}
        </AppShell>
    );
}
