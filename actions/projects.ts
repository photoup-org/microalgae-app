"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/core/prisma";
import { requireUser } from "@/lib/core/auth/user";
import { recordAudit } from "@/lib/services/audit";
import type { ActionResult } from "@/lib/action-result";

const projectSchema = z.object({
    name: z.string().trim().min(1, "O nome é obrigatório.").max(80),
    description: z.string().trim().max(500).optional(),
    deviceIds: z.array(z.string()),
});

/**
 * Devices selectable for a project's pool: every reactor in the department.
 *
 * Membership is many-to-many, so a reactor may sit in several projects at once
 * and nothing here needs to filter by current assignment. That is safe because
 * exclusivity is enforced per RUN rather than per project - createExperimentAction
 * refuses any device already attached to a PLANNED/RUNNING/PAUSED experiment, so
 * two projects can list the same reactor but can never drive it simultaneously.
 *
 * Every exported function in a "use server" file is independently callable over
 * Next.js's action wire protocol, regardless of where it's imported in the UI -
 * proxy.ts gating the page this is rendered from is not a substitute for this
 * check, only a second layer alongside it.
 */
export async function getAssignableDevicesAction() {
    try {
        await requireUser();
    } catch {
        return [];
    }

    return prisma.device.findMany({
        where: { departmentId: process.env.DEPARTMENT_ID },
        include: { experiments: { where: { status: "RUNNING" }, select: { id: true } } },
        orderBy: { name: "asc" },
    });
}

export async function createProjectAction(input: unknown): Promise<ActionResult<{ id: string }>> {
    let user;
    try {
        user = await requireUser();
    } catch {
        return { success: false, error: "Não autenticado." };
    }

    const parsed = projectSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    }
    const { name, description, deviceIds } = parsed.data;
    const departmentId = process.env.DEPARTMENT_ID;
    if (!departmentId) return { success: false, error: "DEPARTMENT_ID não está definido." };

    const project = await prisma.project.create({
        data: {
            name,
            description: description || null,
            departmentId,
            createdById: user.id,
            devices: { connect: deviceIds.map((id) => ({ id })) },
        },
    });

    revalidatePath("/projects");
    return { success: true, data: { id: project.id } };
}

export async function updateProjectAction(projectId: string, input: unknown): Promise<ActionResult> {
    try {
        await requireUser();
    } catch {
        return { success: false, error: "Não autenticado." };
    }

    const parsed = projectSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    }
    const { name, description, deviceIds } = parsed.data;

    const existing = await prisma.project.findFirst({
        where: { id: projectId, departmentId: process.env.DEPARTMENT_ID },
        include: { devices: { include: { experiments: { where: { status: { in: ["RUNNING", "PAUSED"] } } } } } },
    });
    if (!existing) return { success: false, error: "Projeto não encontrado." };

    // Removing a device here detaches it from the project below (see the `set`
    // comment), silently orphaning it while its experiment keeps logging -
    // mirrors the guard deleteProjectAction already has.
    const removedWithActiveExperiment = existing.devices.filter(
        (d) => !deviceIds.includes(d.id) && d.experiments.length > 0
    );
    if (removedWithActiveExperiment.length > 0) {
        return {
            success: false,
            error: `Termine a experiência antes de remover: ${removedWithActiveExperiment.map((d) => d.name).join(", ")}.`,
        };
    }

    await prisma.project.update({
        where: { id: projectId },
        data: {
            name,
            description: description || null,
            // `set` replaces this project's whole pool. On a many-to-many that only
            // detaches the device from THIS project - any other project holding the
            // same reactor keeps it.
            devices: { set: deviceIds.map((id) => ({ id })) },
        },
    });

    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    return { success: true };
}

/**
 * Deletes a project. Unlike app-gui's deleteProjectAction (no auth/tenant check at
 * all), this scopes by department and refuses if any experiment is still
 * RUNNING/PAUSED - mirrors the guard already used for individual experiment
 * deletion, since deleting the project would orphan an active telemetry run.
 */
export async function deleteProjectAction(projectId: string): Promise<ActionResult> {
    let user;
    try {
        user = await requireUser();
    } catch {
        return { success: false, error: "Não autenticado." };
    }

    const project = await prisma.project.findFirst({
        where: { id: projectId, departmentId: process.env.DEPARTMENT_ID },
        include: { experiments: { where: { status: { in: ["RUNNING", "PAUSED"] } } } },
    });
    if (!project) return { success: false, error: "Projeto não encontrado." };

    if (project.experiments.length > 0) {
        return { success: false, error: "Existem experiências em curso. Termine-as antes de eliminar o projeto." };
    }

    // Written before the delete, not after: the row it describes is about to stop
    // existing, and a log claiming a deletion that then failed would be worse than
    // none at all.
    await recordAudit({
        action: "PROJECT_DELETED",
        message: `Projeto "${project.name}" eliminado por ${user.name || user.email}.`,
        actor: user.name || user.email,
        metadata: { projectId: project.id, projectName: project.name },
    });

    await prisma.project.delete({ where: { id: projectId } });
    revalidatePath("/projects");
    revalidatePath("/dashboard");
    return { success: true };
}
