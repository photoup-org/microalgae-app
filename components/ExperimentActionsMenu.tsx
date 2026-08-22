"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreVertical, Pencil, Trash2, Download, Loader2 } from "lucide-react";
import { ExperimentStatus } from "@prisma/client";
import { updateExperimentAction, deleteExperimentAction } from "@/actions/experiments";
import { getExperimentExportDataAction } from "@/actions/export";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";

interface ExperimentActionsMenuProps {
    experimentId: string;
    projectId: string;
    name: string;
    status: ExperimentStatus;
    /** Current storage frequency, editable only while PLANNED. See updateExperimentAction. */
    dbInterval: number;
    /**
     * Where to go after a successful delete. The detail page has to leave - the
     * row it describes is gone - while a table can just re-render in place.
     */
    afterDelete: "back-to-project" | "refresh";
}

/** Edit / export / delete for one experiment, shared by the project table and the detail page. */
export function ExperimentActionsMenu({
    experimentId,
    projectId,
    name,
    status,
    dbInterval,
    afterDelete,
}: ExperimentActionsMenuProps) {
    const [editOpen, setEditOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [draftName, setDraftName] = useState(name);
    const [draftInterval, setDraftInterval] = useState(dbInterval);
    const [exporting, setExporting] = useState(false);
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    const isPlanned = status === ExperimentStatus.PLANNED;
    // Mirrors deleteExperimentAction's own guard, which is the authoritative one.
    const canDelete = status !== ExperimentStatus.RUNNING && status !== ExperimentStatus.PAUSED;

    function save() {
        startTransition(async () => {
            const result = await updateExperimentAction(experimentId, {
                name: draftName,
                dbInterval: isPlanned ? draftInterval : undefined,
            });
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            toast.success("Experiência atualizada.");
            setEditOpen(false);
            router.refresh();
        });
    }

    function confirmDelete() {
        startTransition(async () => {
            const result = await deleteExperimentAction(experimentId);
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            toast.success("Experiência eliminada.");
            setDeleteOpen(false);
            if (afterDelete === "back-to-project") router.push(`/projects/${projectId}`);
            else router.refresh();
        });
    }

    async function handleExport() {
        setExporting(true);
        try {
            const result = await getExperimentExportDataAction(experimentId);
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            const { downloadExperimentExcel } = await import("@/lib/export-excel");
            downloadExperimentExcel(result.data!);
            toast.success(
                result.data!.telemetry.length > 0
                    ? "Exportação concluída."
                    : "Exportado, mas sem dados de telemetria no intervalo."
            );
        } catch {
            toast.error("Ocorreu um erro durante a exportação.");
        } finally {
            setExporting(false);
        }
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Opções de ${name}`}>
                        {exporting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MoreVertical className="size-4" aria-hidden />}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-52">
                    <DropdownMenuItem
                        className="whitespace-nowrap"
                        onClick={() => {
                            setDraftName(name);
                            setDraftInterval(dbInterval);
                            setEditOpen(true);
                        }}
                    >
                        <Pencil className="size-4" />
                        Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem className="whitespace-nowrap" onClick={handleExport} disabled={exporting}>
                        <Download className="size-4" />
                        Exportar para Excel
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        variant="destructive"
                        className="whitespace-nowrap"
                        disabled={!canDelete}
                        // A running experiment has telemetry in flight; stop it first.
                        title={canDelete ? undefined : "Termine a experiência antes de a eliminar."}
                        onClick={() => setDeleteOpen(true)}
                    >
                        <Trash2 className="size-4" />
                        Eliminar
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Editar experiência</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="exp-edit-name">Nome</Label>
                            <Input
                                id="exp-edit-name"
                                value={draftName}
                                onChange={(e) => setDraftName(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="exp-edit-interval">Frequência de gravação (s)</Label>
                            <Input
                                id="exp-edit-interval"
                                type="number"
                                min={5}
                                max={3600}
                                className="tabular"
                                value={draftInterval}
                                disabled={!isPlanned}
                                onChange={(e) => setDraftInterval(Number(e.target.value))}
                            />
                            <p className="text-xs text-muted-foreground">
                                {isPlanned
                                    ? "A telemetria em direto mantém-se a 1 segundo, independentemente deste valor."
                                    : "Só pode ser alterada enquanto a experiência estiver planeada - o servidor local lê este valor no arranque."}
                            </p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditOpen(false)} disabled={pending}>
                            Cancelar
                        </Button>
                        <Button onClick={save} disabled={pending || !draftName.trim()}>
                            {pending ? "A guardar…" : "Guardar"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title={`Eliminar "${name}"?`}
                description="Esta ação não pode ser desfeita. A telemetria já gravada não é removida."
                confirmLabel="Eliminar"
                pending={pending}
                onConfirm={confirmDelete}
            />
        </>
    );
}
