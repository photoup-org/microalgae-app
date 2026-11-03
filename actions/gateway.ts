"use server";

import { prisma } from "@/lib/core/prisma";
import { publishMQTTMessage } from "@/lib/core/mqtt";
import { requireUser } from "@/lib/core/auth/user";
import type { ActionResult } from "@/lib/action-result";
import { ExperimentStatus } from "@prisma/client";

/**
 * Asks the Pi's edge updater (tools/edge-updater, a systemd service on the host)
 * to apply the pending update. The updater re-checks GitHub itself and refuses
 * anything that is not a clean fast-forward of main, so this only carries intent.
 */
export async function applyGatewayUpdateAction(): Promise<ActionResult> {
    try {
        await requireUser();
    } catch {
        return { success: false, error: "Não autenticado." };
    }
    try {
        await publishMQTTMessage("cmd/gateway/update/apply", { requestedAt: new Date().toISOString() });
        return { success: true };
    } catch (error) {
        console.error("[gateway] apply update failed:", error);
        return { success: false, error: "Não foi possível contactar o servidor edge." };
    }
}

/** Asks the updater to look for new commits now instead of waiting for its poll. */
export async function checkGatewayUpdateAction(): Promise<ActionResult> {
    try {
        await requireUser();
    } catch {
        return { success: false, error: "Não autenticado." };
    }
    try {
        await publishMQTTMessage("cmd/gateway/update/check", { requestedAt: new Date().toISOString() });
        return { success: true };
    } catch (error) {
        console.error("[gateway] check update failed:", error);
        return { success: false, error: "Não foi possível contactar o servidor edge." };
    }
}

/** Running experiments, for the update confirmation's warning. */
export async function countRunningExperimentsAction(): Promise<number> {
    try {
        await requireUser();
    } catch {
        return 0;
    }
    return prisma.experiment.count({
        where: {
            status: ExperimentStatus.RUNNING,
            project: { departmentId: process.env.DEPARTMENT_ID },
        },
    });
}
