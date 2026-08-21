"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { deleteProjectAction } from "@/actions/projects";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Project row's "..." menu: edit navigates to the project page, delete is the one CRUD op with no other UI entry point. */
export function ProjectCardMenu({ projectId, projectName }: { projectId: string; projectName: string }) {
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    function remove() {
        if (!confirm(`Eliminar o projeto "${projectName}"? Esta ação não pode ser desfeita.`)) return;
        startTransition(async () => {
            const result = await deleteProjectAction(projectId);
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            toast.success("Projeto eliminado.");
            router.refresh();
        });
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" disabled={pending} aria-label="Opções do projeto">
                    <MoreVertical className="size-4" aria-hidden />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                    <a href={`/projects/${projectId}`} className="flex items-center gap-2">
                        <Pencil className="size-4" />
                        Editar
                    </a>
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={remove}>
                    <Trash2 className="size-4" />
                    Eliminar
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
