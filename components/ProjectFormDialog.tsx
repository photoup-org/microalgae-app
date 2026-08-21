"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, ListTodo, Cpu, Settings, Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { createProjectAction, updateProjectAction } from "@/actions/projects";
import { setValveControlAction } from "@/actions/devices";
import { ValveControlForm, DEFAULT_CONTROL, type ValveControl } from "@/components/ValvePanel";
import { deriveLinearPhApprox } from "@/lib/calibration-approx";
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

export interface AssignableDevice {
    id: string;
    name: string | null;
    serialNumber: string;
    /** Device.config - carries the last-saved valve control setpoints, if any. */
    config: unknown;
    /** Device.calibrationConfig - gates the automatic control mode. See ValvePanel. */
    calibrationConfig: unknown;
    /** Non-empty when a RUNNING experiment already covers this device. Gates valve activation. */
    experiments: unknown[];
}

interface ProjectFormDialogProps {
    assignableDevices: AssignableDevice[];
    /** Present when editing; omitted when creating. */
    project?: { id: string; name: string; description: string | null; deviceIds: string[] };
    /** Opens the wizard immediately - used by the topbar's quick-create link (?new=1). */
    defaultOpen?: boolean;
    /**
     * Fully external open control - pass both to drive the dialog from elsewhere
     * (e.g. a dropdown menu item) instead of the dialog's own trigger button. When
     * set, no <DialogTrigger> is rendered; the caller owns the only way to open it.
     */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

const STEPS = [
    { label: "Geral", icon: ListTodo },
    { label: "Equipamento", icon: Cpu },
    { label: "Configuração", icon: Settings },
    { label: "Revisão", icon: Check },
];

export function ProjectFormDialog({ assignableDevices, project, defaultOpen, open: controlledOpen, onOpenChange: setControlledOpen }: ProjectFormDialogProps) {
    const isControlled = controlledOpen !== undefined;
    const [internalOpen, setInternalOpen] = useState(defaultOpen ?? false);
    const open = isControlled ? controlledOpen : internalOpen;
    const setOpen = isControlled ? (setControlledOpen ?? (() => {})) : setInternalOpen;
    const [step, setStep] = useState(0);
    const [name, setName] = useState(project?.name ?? "");
    const [description, setDescription] = useState(project?.description ?? "");
    const [deviceIds, setDeviceIds] = useState<string[]>(project?.deviceIds ?? []);
    /** Only holds entries for devices the user actually touched in the Configuração step. */
    const [valveControls, setValveControls] = useState<Record<string, ValveControl>>({});
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    function toggle(id: string, running: boolean) {
        if (running && deviceIds.includes(id)) {
            toast.error("Termine a experiência antes de remover este reator.");
            return;
        }
        setDeviceIds((cur) => (cur.includes(id) ? cur.filter((d) => d !== id) : [...cur, id]));
    }

    function resetToClosed() {
        setOpen(false);
        setStep(0);
        setValveControls({});
        if (!project) {
            setName("");
            setDescription("");
            setDeviceIds([]);
        }
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

            // Best-effort: the project itself is already saved, so a valve config
            // failure (e.g. automatic mode without a running experiment) is
            // surfaced per device rather than blocking the wizard from closing.
            for (const [deviceId, control] of Object.entries(valveControls)) {
                const device = assignableDevices.find((d) => d.id === deviceId);
                const valveResult = await setValveControlAction(deviceId, control);
                if (!valveResult.success) {
                    toast.error(`${device?.name ?? deviceId}: ${valveResult.error}`);
                }
            }

            toast.success(project ? "Projeto atualizado." : "Projeto criado.");
            resetToClosed();
            router.refresh();
        });
    }

    const selectedDevices = assignableDevices.filter((d) => deviceIds.includes(d.id));
    const canAdvance = step === 0 ? name.trim().length > 0 : true;

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) setStep(0);
            }}
        >
            {!isControlled && (
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
            )}
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{project ? "Editar projeto" : "Novo projeto"}</DialogTitle>
                </DialogHeader>

                <div className="flex justify-between pt-2">
                    {STEPS.map((s, idx) => {
                        const Icon = s.icon;
                        const isActive = idx === step;
                        const isCompleted = idx < step;
                        return (
                            <div key={s.label} className="relative flex flex-1 flex-col items-center gap-1.5">
                                {idx > 0 && (
                                    <div
                                        className={`absolute top-4 -z-10 h-0.5 ${idx <= step ? "bg-brand" : "bg-border"}`}
                                        style={{ left: "calc(-50% + 20px)", right: "calc(50% + 20px)" }}
                                    />
                                )}
                                <div
                                    className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
                                        isActive
                                            ? "border-brand bg-brand text-white"
                                            : isCompleted
                                              ? "border-brand bg-brand/15 text-brand"
                                              : "border-border bg-muted text-muted-foreground"
                                    }`}
                                >
                                    {isCompleted ? <Check className="size-4" /> : <Icon className="size-4" />}
                                </div>
                                <span className={`text-[10px] font-medium ${isActive ? "text-brand" : "text-muted-foreground"}`}>
                                    {s.label}
                                </span>
                            </div>
                        );
                    })}
                </div>

                <div className="space-y-4 py-2">
                    {step === 0 && (
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="project-name">Nome</Label>
                                <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cultura de Chlorella - Lote 1" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="project-description">Descrição (opcional)</Label>
                                <Textarea id="project-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                            </div>
                        </div>
                    )}

                    {step === 1 && (
                        <fieldset className="space-y-2">
                            <legend className="text-sm font-medium">Reatores</legend>
                            {assignableDevices.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Nenhum dispositivo disponível. Ligue um nó ao servidor local para que
                                    apareça em Dispositivos.
                                </p>
                            ) : (
                                <div className="max-h-48 space-y-1.5 overflow-y-auto">
                                    {assignableDevices.map((device) => {
                                        const running = device.experiments.length > 0;
                                        const checked = deviceIds.includes(device.id);
                                        return (
                                            <label key={device.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                                                <Checkbox
                                                    checked={checked}
                                                    disabled={running && checked}
                                                    onCheckedChange={() => toggle(device.id, running)}
                                                />
                                                <span className="font-medium">{device.name}</span>
                                                <span className="tabular text-xs text-muted-foreground">{device.serialNumber}</span>
                                                {running && checked && (
                                                    <span className="ml-auto text-xs text-muted-foreground">experiência em curso</span>
                                                )}
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </fieldset>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            {selectedDevices.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Nenhum reator selecionado. Volte a Equipamento para associar reatores
                                    antes de definir a configuração da válvula.
                                </p>
                            ) : (
                                <>
                                    <p className="text-xs text-muted-foreground">
                                        Estas alterações só são guardadas ao concluir o assistente.
                                    </p>
                                    {selectedDevices.map((device) => {
                                        const control = (device.config as { control?: ValveControl } | null)?.control ?? DEFAULT_CONTROL;
                                        const hasPhCalibration =
                                            deriveLinearPhApprox(
                                                (device.calibrationConfig as { ph?: unknown } | null)?.ph
                                            ) !== null;
                                        return (
                                            <div key={device.id} className="rounded-lg border border-border p-3">
                                                <p className="mb-2 text-sm font-semibold">
                                                    {device.name} <span className="text-xs font-normal text-muted-foreground">{device.serialNumber}</span>
                                                </p>
                                                <ValveControlForm
                                                    deviceId={device.id}
                                                    initialControl={control}
                                                    hasPhCalibration={hasPhCalibration}
                                                    hasRunningExperiment={device.experiments.length > 0}
                                                    onChange={(next) => setValveControls((v) => ({ ...v, [device.id]: next }))}
                                                />
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-3 text-sm">
                            <div>
                                <p className="text-xs font-medium text-muted-foreground">Nome</p>
                                <p>{name}</p>
                            </div>
                            {description && (
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground">Descrição</p>
                                    <p>{description}</p>
                                </div>
                            )}
                            <div>
                                <p className="text-xs font-medium text-muted-foreground">
                                    Reatores ({selectedDevices.length})
                                </p>
                                {selectedDevices.length === 0 ? (
                                    <p className="text-muted-foreground">Nenhum reator associado.</p>
                                ) : (
                                    <ul className="mt-1 space-y-1">
                                        {selectedDevices.map((d) => (
                                            <li key={d.id}>
                                                {d.name} <span className="text-xs text-muted-foreground">{d.serialNumber}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex items-center justify-between sm:justify-between">
                    <Button variant="outline" disabled={step === 0 || pending} onClick={() => setStep((s) => s - 1)}>
                        <ChevronLeft className="size-4" aria-hidden />
                        Voltar
                    </Button>

                    {step < STEPS.length - 1 ? (
                        <Button disabled={!canAdvance || pending} onClick={() => setStep((s) => s + 1)}>
                            Continuar
                            <ChevronRight className="size-4" aria-hidden />
                        </Button>
                    ) : (
                        <Button onClick={submit} disabled={pending || !name.trim()}>
                            {pending ? (
                                <>
                                    <Loader2 className="size-4 animate-spin" aria-hidden />
                                    {project ? "A guardar…" : "A criar…"}
                                </>
                            ) : (
                                <>
                                    {project ? "Salvar Alterações" : "Criar Projeto"}
                                    <Check className="size-4" aria-hidden />
                                </>
                            )}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
