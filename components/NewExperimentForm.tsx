"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createExperimentAction } from "@/actions/experiments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";

interface DeviceOption {
    id: string;
    name: string | null;
    serialNumber: string;
    status: string;
    isAllocated: boolean;
}

export function NewExperimentForm({ projectId, devices }: { projectId: string; devices: DeviceOption[] }) {
    const [name, setName] = useState("");
    const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 16));
    const [deviceIds, setDeviceIds] = useState<string[]>([]);
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    function toggle(id: string) {
        setDeviceIds((cur) => (cur.includes(id) ? cur.filter((d) => d !== id) : [...cur, id]));
    }

    function submit() {
        startTransition(async () => {
            const result = await createExperimentAction(projectId, {
                name,
                startDate: new Date(startDate),
                deviceIds,
            });
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            toast.success("Experiência criada.");
            router.push(`/projects/${projectId}/experiments/${result.data!.id}`);
        });
    }

    return (
        <div className="max-w-xl space-y-6">
            <div className="space-y-1.5">
                <Label htmlFor="exp-name">Nome</Label>
                <Input id="exp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ensaio 1" />
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="exp-start">Data de início</Label>
                <Input id="exp-start" type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>

            <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Dispositivos</legend>
                {devices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Este projeto não tem dispositivos atribuídos.</p>
                ) : (
                    <div className="space-y-2">
                        {devices.map((device) => {
                            const disabled = device.status !== "ACTIVE" || device.isAllocated;
                            return (
                                <Card key={device.id} className={disabled ? "opacity-50" : undefined}>
                                    <CardContent className="flex items-center gap-3 py-3">
                                        <Checkbox
                                            checked={deviceIds.includes(device.id)}
                                            onCheckedChange={() => toggle(device.id)}
                                            disabled={disabled}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className="font-medium">{device.name}</p>
                                            <p className="tabular text-xs text-muted-foreground">{device.serialNumber}</p>
                                        </div>
                                        {disabled && (
                                            <span className="text-xs text-muted-foreground">
                                                {device.isAllocated ? "já alocado" : "indisponível"}
                                            </span>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </fieldset>

            <Button onClick={submit} disabled={pending || !name.trim() || deviceIds.length === 0}>
                {pending ? "A criar…" : "Criar experiência"}
            </Button>
        </div>
    );
}
