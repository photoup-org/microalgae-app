import Link from "next/link";
import { DeviceStatus } from "@prisma/client";
import { CalendarClock, Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DeviceStatusBadge } from "@/components/DeviceStatusBadge";
import { ExperimentElapsed } from "@/components/ExperimentElapsed";
import { ExperimentQuickControls } from "@/components/ExperimentQuickControls";
import { ExperimentStatusBadge } from "@/components/ExperimentStatusBadge";
import { ReactorGauges } from "@/components/ReactorGauges";

export interface ReactorPanelProps {
    device: {
        id: string;
        name: string | null;
        serialNumber: string;
        status: DeviceStatus;
        sensors: string[];
    };
    /** The run currently driving this reactor, if any. At most one - see createExperimentAction. */
    run: {
        id: string;
        projectId: string;
        projectName: string;
        name: string;
        status: "RUNNING" | "PAUSED";
        accumulatedSeconds: number;
        lastRunAt: string | null;
    } | null;
    /** Already worded for the operator, most urgent first. */
    attention: { kind: "maintenance" | "calibration"; text: string }[];
}

/**
 * One reactor as the dashboard's unit: is it reachable, what is it reading now,
 * what is running on it, and what needs doing. Readings are live only, like the
 * device page - a stale value from InfluxDB beside a live badge would read as current.
 */
export function ReactorPanel({ device, run, attention }: ReactorPanelProps) {
    return (
        <Card className="gap-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                <div className="flex min-w-0 items-center gap-2">
                    <Link href={`/devices/${device.id}`} className="truncate font-heading text-lg font-semibold hover:underline">
                        {device.name ?? device.serialNumber}
                    </Link>
                    <DeviceStatusBadge status={device.status} serialNumber={device.serialNumber} />
                </div>

                {run ? (
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                        <p className="min-w-0 truncate">
                            <Link
                                href={`/projects/${run.projectId}/experiments/${run.id}`}
                                className="font-medium hover:underline"
                            >
                                {run.name}
                            </Link>
                            <span className="text-muted-foreground"> em {run.projectName}</span>
                        </p>
                        {run.status === "RUNNING" ? (
                            <>
                                <span className="tabular text-muted-foreground">
                                    <ExperimentElapsed accumulatedSeconds={run.accumulatedSeconds} lastRunAt={run.lastRunAt} />
                                </span>
                                <ExperimentQuickControls experimentId={run.id} name={run.name} />
                            </>
                        ) : (
                            <ExperimentStatusBadge status={run.status} />
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        Sem experiência em curso. Só a telemetria em direto está ativa.
                    </p>
                )}
            </div>

            <ReactorGauges serialNumber={device.serialNumber} telemetry={[]} enabledMetrics={device.sensors} />

            {attention.length > 0 && (
                <ul className="space-y-1 text-sm">
                    {attention.map((item) => {
                        const Icon = item.kind === "maintenance" ? Wrench : CalendarClock;
                        return (
                            <li key={item.text} className={`flex items-center gap-2 ${item.kind === "maintenance" ? "text-warning" : "text-danger"}`}>
                                <Icon className="size-4 shrink-0" aria-hidden />
                                <Link href={`/devices/${device.id}`} className="hover:underline">
                                    {item.text}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
}
