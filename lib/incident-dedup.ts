import { LogLevel } from "@prisma/client";

/**
 * The identity of a *condition*, as opposed to an event.
 *
 * The edge re-raises a standing threshold breach every 60 seconds
 * (device_buffer.py rate-limits per device+metric+level), so an excursion that
 * lasts a weekend writes thousands of rows that all say the same thing. Rows
 * sharing a key describe one ongoing problem and are folded together on ingest.
 *
 * INFO is deliberately excluded. "Experiment started", "device came online" are
 * history: two of them a week apart are two facts, and folding them would destroy
 * the timeline. Everything WARN and above is a condition someone has to act on,
 * and there the second occurrence adds nothing except "still happening".
 *
 * `metric` is part of the key because one reactor breaching pH and temperature at
 * once is two problems, not one - and the edge already keys its own rate limit the
 * same way.
 */
export function dedupKeyFor(log: {
    level: LogLevel;
    category: string;
    action: string;
    deviceId?: string | null;
    metadata?: unknown;
}): string | null {
    if (log.level === LogLevel.INFO) return null;

    const metric = (log.metadata as { metric?: unknown } | null | undefined)?.metric;
    const metricPart = typeof metric === "string" && metric.length > 0 ? metric : "-";

    return [log.level, log.category, log.action, log.deviceId ?? "-", metricPart].join(":");
}
