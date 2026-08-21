"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/core/prisma";
import { requireUser } from "@/lib/core/auth/user";
import type { ActionResult } from "@/lib/action-result";

const projectSchema = z.object({
    name: z.string().trim().min(1, "O nome é obrigatório.").max(80),
    description: z.string().trim().max(500).optional(),
    deviceIds: z.array(z.string()),
});

/**
 * Devices selectable for a project's pool: unassigned, or already in the project
 * being edited (pass its id when editing so its current pool doesn't vanish from
 * the picker). app-gui's equivalent action claims to filter unassigned devices but
 * doesn't - it actually returns every ACTIVE device regardless of projectId, so an
 * already-assigned device shows as available there. This filters for real.
 *
 * Every exported function in a "use server" file is independently callable over
 * Next.js's action wire protocol, regardless of where it's imported in the UI -
 * proxy.ts gating the page this is rendered from is not a substitute for this
 * check, only a second layer alongside it.
 */
export async function getAssignableDevicesAction(editingProjectId?: string) {
    try {
        await requireUser();
    } catch {
        return [];
    }

    return prisma.device.findMany({
        where: {
            departmentId: process.env.DEPARTMENT_ID,
            OR: [{ projectId: null }, ...(editingProjectId ? [{ projectId: editingProjectId }] : [])],
        },
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

    // A device removed here gets its projectId cleared for free below (see the
    // `set` comment), silently orphaning it from the project while its experiment
    // keeps logging - mirrors the guard deleteProjectAction already has.
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
            // `set` replaces the whole pool - devices removed from the list get
            // projectId cleared for free (Device.project onDelete: SetNull).
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
    try {
        await requireUser();
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

    await prisma.project.delete({ where: { id: projectId } });
    revalidatePath("/projects");
    revalidatePath("/dashboard");
    return { success: true };
}
