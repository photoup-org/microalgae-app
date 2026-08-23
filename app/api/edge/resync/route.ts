import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ExperimentStatus } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { isEdgeAuthorized } from "@/lib/core/edge-auth";
import { publishExperimentStart } from "@/lib/experiment-commands";

/**
 * Re-announces every RUNNING experiment, on the worker's own request.
 *
 * The worker holds its experiment buffers in memory only, so after it restarts it
 * has forgotten every device and stops writing to InfluxDB even though the
 * experiments are still RUNNING in Postgres. The dashboard's Resync button
 * (resyncExperimentsAction) is the manual repair; this is the same repair
 * triggered by the worker itself on connect, which is what makes unattended
 * container updates safe.
 *
 * Scoped by department: unscoped, this would re-announce every RUNNING experiment
 * in the shared database, including app-gui's, and push config to devices this app
 * does not own.
 */
// Both fields are only ever logged, so they are constrained to a charset that
// cannot inject newlines or control characters into the log stream.
const SAFE_ID = /^[A-Za-z0-9_.:-]+$/;

const bodySchema = z.object({
    gatewayId: z.string().trim().min(1).max(64).regex(SAFE_ID),
    version: z.string().trim().max(64).regex(SAFE_ID).optional(),
});

export async function POST(req: NextRequest) {
    if (!isEdgeAuthorized(req.headers.get("authorization"))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const departmentId = process.env.DEPARTMENT_ID;
    if (!departmentId) {
        throw new Error("DEPARTMENT_ID must be set.");
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    const { gatewayId, version } = parsed.data;

    const experiments = await prisma.experiment.findMany({
        where: { status: ExperimentStatus.RUNNING, project: { departmentId } },
        include: { devices: true },
    });

    let synced = 0;
    for (const experiment of experiments) {
        try {
            const settings = (experiment.settings ?? {}) as { devices?: Record<string, Record<string, number>>; dbInterval?: number };
            await publishExperimentStart(experiment.id, experiment.devices, settings.devices, settings.dbInterval);
            synced++;
        } catch (error) {
            // One unpublishable experiment must not block the rest.
            console.error(`[edge/resync] Failed for experiment ${experiment.id}:`, error);
        }
    }

    console.info(`[edge/resync] Gateway ${gatewayId} (version ${version ?? "unknown"}) resynced ${synced}/${experiments.length} experiment(s).`);
    return NextResponse.json({ success: true, synced }, { status: 200 });
}
