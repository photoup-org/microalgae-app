"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { createProjectAction, updateProjectAction } from "@/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogTrigger,
} from "@/components/ui/dialog";

interface AssignableDevice {
    id: string;
    name: string | null;
    serialNumber: string;
}

interface ProjectFormDialogProps {
    assignableDevices: AssignableDevice[];
    /** Present when editing; omitted when creating. */
    project?: { id: string; name: string; description: string | null; deviceIds: string[] };
}

export function ProjectFormDialog({ assignableDevices, project }: ProjectFormDialogProps) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState(project?.name ?? "");
    const [description, setDescription] = useState(project?.description ?? "");
    const [deviceIds, setDeviceIds] = useState<string[]>(project?.deviceIds ?? []);
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    function toggle(id: string) {
        setDeviceIds((cur) => (cur.includes(id) ? cur.filter((d) => d !== id) : [...cur, id]));
    }

    function submit() {
        startTransition(async () => {
            const result = project
                ? await updateProjectAction(project.id, { name, description, deviceIds })
                : await createProjectAction({ name, description, deviceIds });

            if (!result.success) {
                toast.error(result.error);
                return;
            }
            toast.success(project ? "Projeto atualizado." : "Projeto criado.");
            setOpen(false);
            if (!project) {
                setName("");
                setDescription("");
                setDeviceIds([]);
            }
            router.refresh();
        });
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {project ? (
                    <Button variant="outline" size="sm">
                        <Pencil className="size-4" aria-hidden />
                        Editar
                    </Button>
                ) : (
                    <Button size="sm">
                        <Plus className="size-4" aria-hidden />
                        Novo projeto
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{project ? "Editar projeto" : "Novo projeto"}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="project-name">Nome</Label>
                        <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cultura de Chlorella - Lote 1" />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="project-description">Descrição (opcional)</Label>
                        <Textarea id="project-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                    </div>

                    <fieldset className="space-y-2">
                        <legend className="text-sm font-medium">Reatores</legend>
                        {assignableDevices.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Nenhum dispositivo disponível. Ligue um nó ao servidor local para que
                                apareça em Dispositivos.
                            </p>
                        ) : (
                            <div className="max-h-48 space-y-1.5 overflow-y-auto">
                                {assignableDevices.map((device) => (
                                    <label key={device.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                                        <Checkbox checked={deviceIds.includes(device.id)} onCheckedChange={() => toggle(device.id)} />
                                        <span className="font-medium">{device.name}</span>
                                        <span className="tabular text-xs text-muted-foreground">{device.serialNumber}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </fieldset>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
                    <Button onClick={submit} disabled={pending || !name.trim()}>
                        {pending ? "A guardar…" : project ? "Guardar" : "Criar projeto"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
