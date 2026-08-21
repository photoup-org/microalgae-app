"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreVertical, Pencil, Info, Trash2, Play } from "lucide-react";
import { deleteProjectAction, getAssignableDevicesAction } from "@/actions/projects";
import { ProjectFormDialog, type AssignableDevice } from "@/components/ProjectFormDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ProjectSummary {
    id: string;
    name: string;
    description: string | null;
    deviceIds: string[];
}

/** Project row's "..." menu: edit opens the wizard in place, details navigates, delete asks first via ConfirmDialog. */
export function ProjectCardMenu({ project }: { project: ProjectSummary }) {
    const [editOpen, setEditOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [assignableDevices, setAssignableDevices] = useState<AssignableDevice[] | null>(null);
    const [, startLoadTransition] = useTransition();
    const [deleting, startDeleteTransition] = useTransition();
    const router = useRouter();

    function openEdit() {
        setEditOpen(true);
        if (assignableDevices === null) {
            startLoadTransition(async () => {
                const devices = await getAssignableDevicesAction(project.id);
                setAssignableDevices(devices);
            });
        }
    }

    function confirmDelete() {
        startDeleteTransition(async () => {
            const result = await deleteProjectAction(project.id);
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            toast.success("Projeto eliminado.");
            setDeleteOpen(false);
            router.refresh();
        });
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7" aria-label="Opções do projeto">
                        <MoreVertical className="size-4" aria-hidden />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-56">
                    <DropdownMenuItem asChild>
                        <a href={`/projects/${project.id}`} className="flex items-center gap-2 whitespace-nowrap">
                            <Info className="size-4" />
                            Detalhes
                        </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={openEdit} className="whitespace-nowrap">
                        <Pencil className="size-4" />
                        Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        <a href={`/projects/${project.id}/experiments/new`} className="flex items-center gap-2 whitespace-nowrap">
                            <Play className="size-4" />
                            Iniciar Experiência
                        </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)} className="whitespace-nowrap">
                        <Trash2 className="size-4" />
                        Eliminar
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {assignableDevices && (
                <ProjectFormDialog
                    open={editOpen}
                    onOpenChange={setEditOpen}
                    assignableDevices={assignableDevices}
                    project={project}
                />
            )}

            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title={`Eliminar "${project.name}"?`}
                description="Esta ação não pode ser desfeita."
                confirmLabel="Eliminar"
                pending={deleting}
                onConfirm={confirmDelete}
            />
        </>
    );
}
