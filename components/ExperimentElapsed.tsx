"use client";

import { useEffect, useState } from "react";

interface ExperimentElapsedProps {
    /** Sum of every finished run segment. See updateExperimentLifecycleAction. */
    accumulatedSeconds: number;
    /** Wall-clock anchor of the CURRENT run segment, ISO. Null whenever the experiment is not RUNNING. */
    lastRunAt: string | null;
}

function formatDuration(totalSeconds: number) {
    const total = Math.max(0, Math.floor(totalSeconds));
    const days = Math.floor(total / 86400);
    const clock = [Math.floor((total % 86400) / 3600), Math.floor((total % 3600) / 60), total % 60]
        .map((part) => String(part).padStart(2, "0"))
        .join(":");

    return days > 0 ? `${days}d ${clock}` : clock;
}

/**
 * Logged run time: `accumulatedSeconds + (now - lastRunAt)`, ticking once a second
 * while a run segment is open. Paused/completed experiments have lastRunAt cleared,
 * so they render the frozen total with no timer.
 *
 * `now` starts null rather than Date.now() so the server and the first client render
 * agree - seeding it with a clock would mismatch on hydration for a running experiment.
 */
export function ExperimentElapsed({ accumulatedSeconds, lastRunAt }: ExperimentElapsedProps) {
    const [now, setNow] = useState<number | null>(null);

    useEffect(() => {
        if (!lastRunAt) return;

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [lastRunAt]);

    const openSegment = lastRunAt && now ? (now - new Date(lastRunAt).getTime()) / 1000 : 0;

    return <span className="tabular">{formatDuration(accumulatedSeconds + openSegment)}</span>;
}
