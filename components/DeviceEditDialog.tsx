"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, TriangleAlert } from "lucide-react";
import { updateDeviceAction } from "@/actions/devices";
import { REACTOR_SCHEMA, unmetRequirements } from "@/lib/reactor-schema";
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

interface DeviceEditDialogProps {
    deviceId: string;
    initialName: string;
    initialDescription: string;
    initialSensors: string[];
}

export function DeviceEditDialog({ deviceId, initialName, initialDescription, initialSensors }: DeviceEditDialogProps) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState(initialName);
    const [description, setDescription] = useState(initialDescription);
    const [sensors, setSensors] = useState<string[]>(initialSensors);
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    const unmet = unmetRequirements(sensors);
    const hasUnmet = Object.keys(unmet).length > 0;

    function toggle(key: string) {
        setSensors((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
    }

    function save() {
        startTransition(async () => {
            const result = await updateDeviceAction(deviceId, { name, description, sensors });
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            toast.success("Dispositivo atualizado.");
            setOpen(false);
            router.refresh();
        });
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Pencil className="size-4" aria-hidden />
                    Editar
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Editar dispositivo</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="device-name">Nome</Label>
                        <Input id="device-name" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="device-description">Descrição (opcional)</Label>
                        <Textarea
                            id="device-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                        />
                    </div>

                    <fieldset className="space-y-2">
                        <legend className="text-sm font-medium">Canais</legend>
                        <div className="grid grid-cols-2 gap-2">
                            {REACTOR_SCHEMA.map((metric) => (
                                <label key={metric.key} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                                    <Checkbox
                                        checked={sensors.includes(metric.key)}
                                        onCheckedChange={() => toggle(metric.key)}
                                    />
                                    <span
                                        className="size-2 rounded-full"
                                        style={{ backgroundColor: metric.color }}
                                        aria-hidden
                                    />
                                    {metric.label}
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    {hasUnmet && (
                        <p className="flex gap-2 rounded-md bg-secondary p-3 text-sm text-warning">
                            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                            <span>
                                {Object.entries(unmet).map(([metric, deps]) => {
                                    const label = REACTOR_SCHEMA.find((m) => m.key === metric)?.label ?? metric;
                                    const depLabels = deps.map((d) => REACTOR_SCHEMA.find((m) => m.key === d)?.label ?? d).join(", ");
                                    return <span key={metric} className="block">{label} requer {depLabels}.</span>;
                                })}
                            </span>
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
                    <Button onClick={save} disabled={pending || hasUnmet || !name.trim()}>
                        {pending ? "A guardar…" : "Guardar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
