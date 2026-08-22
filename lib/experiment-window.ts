import { ExperimentStatus } from "@prisma/client";

/** The Experiment fields the window derivation needs. */
export interface ExperimentWindowInput {
    status: ExperimentStatus;
    startDate: Date;
    endDate: Date | null;
    lastRunAt: Date | null;
    accumulatedSeconds: number;
}

/**
 * 65s covers one full default dbInterval (60s) plus round-trip slack on either
 * side. Only the COMPLETED window needs it; see below.
 */
const QUERY_GRACE_MS = 65_000;

/**
 * Derives the InfluxDB time range that isolates ONE experiment's telemetry.
 * Returns null while PLANNED - nothing has been flushed for it yet.
 *
 * Shared by the experiment page's initial server render and
 * getExperimentTelemetryAction's polling, so the chart never swaps between two
 * differently-scoped windows mid-run.
 *
 * InfluxDB rows are only tagged by device_id, not by experiment - a calendar time
 * range can't tell this experiment's data apart from whatever else the same
 * reactor logged before or after it (including a prior experiment on the same
 * device, whose window can easily overlap this one's user-chosen, never-rewritten
 * startDate). Hence the per-status handling:
 *
 * - RUNNING starts from lastRunAt, the instant this run segment began, so a fresh
 *   start reads back as one point instead of backfilling whatever the device
 *   logged since creation.
 * - PAUSED queries the open window [startDate, now). PAUSED has no reliable "when
 *   did the run stop" timestamp: lastRunAt is cleared to null on pause (see
 *   updateExperimentLifecycleAction) and endDate is only ever set on COMPLETED. An
 *   earlier version fell back to `new Date()` as the anchor to count
 *   accumulatedSeconds back from, which drifts forward on every page load - the
 *   longer an experiment sat paused, the further the derived start slid past the
 *   frozen flush timestamps, until the window matched nothing and the chart went
 *   empty. Anchoring to startDate removes the drift, and is safe specifically here
 *   (unlike COMPLETED): a device stays locked to a PLANNED/RUNNING/PAUSED
 *   experiment (see createExperimentAction's allocation check), so no sibling
 *   experiment's data can leak into an open-ended window. That risk only appears
 *   once this experiment COMPLETES and the device frees up for reallocation, which
 *   is why COMPLETED alone still needs the tight anchored window. A resumed
 *   experiment therefore shows every prior run segment once paused, not just the
 *   latest - PAUSED means "review everything so far", RUNNING means "watch this run".
 * - COMPLETED derives the start from accumulatedSeconds (the exact logged
 *   duration) counting back from endDate instead of trusting startDate, and needs
 *   slack on BOTH ends: accumulatedSeconds is an integer (Math.floor'd elapsed
 *   seconds), so the derived start lands a fraction of a second late and would
 *   prune the real first flush; and the worker never calls Point.time() (see
 *   lib/db/influx.ts), so the final flush lands at InfluxDB WRITE time, always a
 *   little after the `now` this app stamped endDate with.
 */
export function experimentQueryWindow(
    experiment: ExperimentWindowInput
): { start: Date; end: Date } | null {
    if (experiment.status === ExperimentStatus.PLANNED) return null;

    const anchor = experiment.endDate ?? new Date();
    const exactStart =
        experiment.status === ExperimentStatus.RUNNING
            ? (experiment.lastRunAt ?? experiment.startDate)
            : experiment.status === ExperimentStatus.PAUSED
              ? experiment.startDate
              : new Date(anchor.getTime() - experiment.accumulatedSeconds * 1000);

    // RUNNING and PAUSED are open windows ending at "now", which is always safely
    // after any write that has already happened - neither bound needs the slack.
    const isOpenWindow =
        experiment.status === ExperimentStatus.RUNNING || experiment.status === ExperimentStatus.PAUSED;

    return {
        start: isOpenWindow ? exactStart : new Date(exactStart.getTime() - QUERY_GRACE_MS),
        end: isOpenWindow ? new Date() : new Date(anchor.getTime() + QUERY_GRACE_MS),
    };
}
