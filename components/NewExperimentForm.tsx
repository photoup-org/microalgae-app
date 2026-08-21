"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createExperimentAction } from "@/actions/experiments";
import { useMqttStore } from "@/hooks/useMqttStore";
import { REACTOR_SCHEMA } from "@/lib/reactor-schema";
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
    sensors: string[];
}

type Limits = Record<string, Record<string, { min?: number; max?: number }>>;

export function NewExperimentForm({ projectId, devices }: { projectId: string; devices: DeviceOption[] }) {
    const [name, setName] = useState("");
    const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 16));
    const [deviceIds, setDeviceIds] = useState<string[]>([]);
    const [limits, setLimits] = useState<Limits>({});
    const [pending, startTransition] = useTransition();
    const router = useRouter();
    /** hardware id -> "online" | "offline", from the retained nodes/{id}/status LWT topic. */
    const liveStatus = useMqttStore((s) => s.deviceStatus);

    function toggle(id: string) {
        setDeviceIds((cur) => (cur.includes(id) ? cur.filter((d) => d !== id) : [...cur, id]));
    }

    function setLimit(deviceId: string, metric: string, field: "min" | "max", raw: string) {
        const value = raw === "" ? undefined : Number(raw);
        setLimits((cur) => ({
            ...cur,
            [deviceId]: {
                ...cur[deviceId],
                [metric]: { ...cur[deviceId]?.[metric], [field]: value },
            },
        }));
    }

    function submit() {
        startTransition(async () => {
            const selectedLimits = Object.fromEntries(deviceIds.filter((id) => limits[id]).map((id) => [id, limits[id]]));
            const result = await createExperimentAction(projectId, {
                name,
                startDate: new Date(startDate),
                deviceIds,
                limits: Object.keys(selectedLimits).length > 0 ? selectedLimits : undefined,
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
                            const offline = liveStatus[device.serialNumber] === "offline";
                            const disabled = device.status !== "ACTIVE" || device.isAllocated || offline;
                            const selected = deviceIds.includes(device.id);
                            const metrics = REACTOR_SCHEMA.filter((m) => device.sensors.includes(m.key));
                            return (
                                <Card key={device.id} className={disabled ? "opacity-50" : undefined}>
                                    <CardContent className="space-y-3 py-3">
                                        <div className="flex items-center gap-3">
                                            <Checkbox
                                                checked={selected}
                                                onCheckedChange={() => toggle(device.id)}
                                                disabled={disabled}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium">{device.name}</p>
                                                <p className="tabular text-xs text-muted-foreground">{device.serialNumber}</p>
                                            </div>
                                            {disabled && (
                                                <span className="text-xs text-muted-foreground">
                                                    {device.isAllocated ? "já alocado" : offline ? "offline" : "indisponível"}
                                                </span>
                                            )}
                                        </div>

                                        {selected && metrics.length > 0 && (
                                            <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 sm:grid-cols-4">
                                                {metrics.map((metric) => (
                                                    <div key={metric.key} className="space-y-1">
                                                        <Label className="text-xs font-normal text-muted-foreground">
                                                            {metric.label} {metric.unit && `(${metric.unit})`}
                                                        </Label>
                                                        <div className="flex items-center gap-1">
                                                            <Input
                                                                type="number"
                                                                placeholder="Mín"
                                                                className="tabular"
                                                                value={limits[device.id]?.[metric.key]?.min ?? ""}
                                                                onChange={(e) => setLimit(device.id, metric.key, "min", e.target.value)}
                                                            />
                                                            <Input
                                                                type="number"
                                                                placeholder="Máx"
                                                                className="tabular"
                                                                value={limits[device.id]?.[metric.key]?.max ?? ""}
                                                                onChange={(e) => setLimit(device.id, metric.key, "max", e.target.value)}
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
                <p className="text-xs text-muted-foreground">
                    Limites de alerta (opcional) — ultrapassar um limite gera um aviso no
                    painel, não aciona a válvula. Deixe em branco para não alertar nesse canal.
                </p>
            </fieldset>

            <Button onClick={submit} disabled={pending || !name.trim() || deviceIds.length === 0}>
                {pending ? "A criar…" : "Criar experiência"}
            </Button>
        </div>
    );
}
