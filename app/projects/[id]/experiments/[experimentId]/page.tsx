import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/core/prisma";
import { getDeviceTelemetry } from "@/lib/db/influx";
import { AppShell } from "@/components/AppShell";
import { ExperimentStatusBadge } from "@/components/ExperimentStatusBadge";
import { ExperimentControls } from "@/components/ExperimentControls";
import { ExportDataButton } from "@/components/ExportDataButton";
import { ReactorGauges } from "@/components/ReactorGauges";
import { ReactorChart } from "@/components/ReactorChart";
import { ValvePanel } from "@/components/ValvePanel";
import { CalibrationPanel } from "@/components/CalibrationPanel";
import { SensorReading } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ExperimentPage({ params }: PageProps<"/projects/[id]/experiments/[experimentId]">) {
    const { id, experimentId } = await params;

    const experiment = await prisma.experiment.findFirst({
        where: { id: experimentId, project: { id, departmentId: process.env.DEPARTMENT_ID } },
        include: { project: true, devices: true },
    });
    if (!experiment) notFound();

    // InfluxDB rows are only tagged by device_id, not by experiment - a calendar
    // time range can't tell this experiment's data apart from whatever else the
    // same reactor logged before or after it (including a prior experiment on the
    // same device, whose window can easily overlap this one's user-chosen,
    // never-rewritten startDate). Four guards keep the chart scoped to THIS run:
    // skip the query entirely while PLANNED (nothing has been flushed for this
    // experiment yet); while RUNNING, start from lastRunAt - the instant this run
    // segment began - so a fresh start reads back as one point instead of
    // backfilling whatever the device logged since creation; while PAUSED, query
    // the open window [startDate, now) exactly like RUNNING (see below for why
    // that's safe here even though it isn't for COMPLETED); once COMPLETED, derive
    // the start from accumulatedSeconds (the exact logged duration) counting back
    // from endDate instead of trusting startDate.
    //
    // PAUSED has no reliable "when did the run stop" timestamp: lastRunAt is
    // cleared back to null on pause (see updateExperimentLifecycleAction) and
    // endDate is only ever set on COMPLETED, so the previous version of this code
    // fell back to `new Date()` as the anchor to count accumulatedSeconds back
    // from. That anchor drifts forward every time the page is loaded - the longer
    // an experiment sits paused, the further the derived start window slides past
    // the real (frozen, no-longer-advancing) flush timestamps, until the query
    // window no longer overlaps any data at all and the chart renders empty.
    // Anchoring to startDate instead removes the drift, and is safe specifically
    // for PAUSED (unlike the general "any non-RUNNING state" case this used to
    // share with COMPLETED): a device stays locked to a PLANNED/RUNNING/PAUSED
    // experiment (see createExperimentAction's allocation check), so there is no
    // sibling experiment on the same device whose data an open-ended window could
    // leak in - that risk only exists once this experiment reaches COMPLETED and
    // the device frees up for reallocation, which is why COMPLETED alone still
    // needs the tight, anchored window. A resumed (paused, then run again)
    // experiment will show every prior run segment once paused, not just the
    // latest - a reasonable difference from RUNNING's single-segment live view,
    // not a bug: PAUSED means "review everything so far", RUNNING means "watch
    // this run".
    const anchor = experiment.endDate ?? new Date();
    const exactStart =
        experiment.status === "RUNNING"
            ? (experiment.lastRunAt ?? experiment.startDate)
            : experiment.status === "PLANNED" || experiment.status === "PAUSED"
              ? experiment.startDate
              : new Date(anchor.getTime() - experiment.accumulatedSeconds * 1000);
    // Query bounds only - the display labels below still use the exact startDate/
    // endDate. Only COMPLETED's anchored window needs slack on both ends:
    // - accumulatedSeconds is an integer (Math.floor'd elapsed seconds in
    //   updateExperimentLifecycleAction), so the derived stopped-state start is
    //   always a fraction of a second LATE relative to the real first flush -
    //   enough on its own to prune that point out of the query entirely.
    // - The worker never calls Point.time() (see lib/db/influx.ts), so the final
    //   flush() the pause/complete transition triggers lands at InfluxDB WRITE
    //   time - after the MQTT round-trip and the worker's own async flush task -
    //   which is always a little later than the `now` this app stamped endDate
    //   with. Without slack here that last flush (often the only data a short run
    //   ever gets, since the periodic dbInterval timer may never have fired) is
    //   queried out by its own stop boundary.
    // 65s covers one full dbInterval (60s) plus round-trip slack on either side.
    // RUNNING and PAUSED are both open windows ending at "now", which is always
    // safely after any write that has already happened - neither needs the slack.
    const QUERY_GRACE_MS = 65_000;
    const isOpenWindow = experiment.status === "RUNNING" || experiment.status === "PAUSED";
    const start = isOpenWindow ? exactStart : new Date(exactStart.getTime() - QUERY_GRACE_MS);
    const queryEnd = isOpenWindow ? new Date() : new Date(anchor.getTime() + QUERY_GRACE_MS);
    const deviceTelemetry = await Promise.all(
        experiment.devices.map(async (device) => {
            if (experiment.status === "PLANNED") return { device, telemetry: [] as SensorReading[] };
            try {
                return { device, telemetry: await getDeviceTelemetry(device.serialNumber, start, queryEnd) };
            } catch (error) {
                console.error(`[experiment ${experimentId}] InfluxDB read failed for ${device.serialNumber}:`, error);
                return { device, telemetry: [] as SensorReading[] };
            }
        })
    );

    return (
        <AppShell>
            <Link href={`/projects/${id}`} className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ChevronLeft className="size-4" aria-hidden />
                {experiment.project.name}
            </Link>

            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-semibold tracking-tight">{experiment.name}</h1>
                        <ExperimentStatusBadge status={experiment.status} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Início: {experiment.startDate.toLocaleString("pt-PT")}
                        {experiment.endDate && ` · Fim: ${experiment.endDate.toLocaleString("pt-PT")}`}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <ExportDataButton experimentId={experiment.id} />
                    <ExperimentControls experimentId={experiment.id} status={experiment.status} />
                </div>
            </div>

            <div className="space-y-8">
                {deviceTelemetry.map(({ device, telemetry }) => {
                    const config = (device.config ?? {}) as { sensors?: string[]; valveOpen?: boolean; control?: unknown };
                    const sensors = config.sensors ?? [];

                    return (
                        <section key={device.id} className="space-y-4 border-t border-border pt-6 first:border-t-0 first:pt-0">
                            <h2 className="font-medium">
                                <Link href={`/devices/${device.id}`} className="hover:underline">{device.name}</Link>
                                <span className="tabular ml-2 text-xs font-normal text-muted-foreground">{device.serialNumber}</span>
                            </h2>

                            <ReactorGauges serialNumber={device.serialNumber} telemetry={telemetry} enabledMetrics={sensors} live={experiment.status === "RUNNING"} />

                            <ReactorChart serialNumber={device.serialNumber} telemetry={telemetry} enabledMetrics={sensors} live={experiment.status === "RUNNING"} />

                            <div className="grid gap-6 md:grid-cols-2">
                                <ValvePanel
                                    deviceId={device.id}
                                    serialNumber={device.serialNumber}
                                    initialOpen={config.valveOpen === true}
                                    initialControl={(config.control as never) ?? null}
                                    hasPhCalibration={Boolean((device.calibrationConfig as { ph?: unknown } | null)?.ph)}
                                    hasRunningExperiment={experiment.status === "RUNNING"}
                                />
                                <CalibrationPanel
                                    deviceId={device.id}
                                    serialNumber={device.serialNumber}
                                    enabledMetrics={sensors}
                                    lastCalibrated={device.lastCalibrated?.toISOString() ?? null}
                                    calibrationDueDate={device.calibrationDueDate?.toISOString() ?? null}
                                />
                            </div>
                        </section>
                    );
                })}
            </div>
        </AppShell>
    );
}
