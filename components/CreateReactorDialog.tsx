"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, TriangleAlert } from "lucide-react";
import { createReactorAction } from "@/actions/reactors";
import { REACTOR_SCHEMA, unmetRequirements } from "@/lib/reactor-schema";

export function CreateReactorDialog() {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [serialNumber, setSerialNumber] = useState("");
    const [metrics, setMetrics] = useState<string[]>(REACTOR_SCHEMA.map((m) => m.key));
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    // Mirrors the driver's REQUIREMENTS. Shown before submit so the user learns why
    // the combination is invalid rather than getting a server error after the fact.
    const unmet = unmetRequirements(metrics);
    const hasUnmet = Object.keys(unmet).length > 0;

    function toggleMetric(key: string) {
        setMetrics((current) =>
            current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
        );
    }

    function submit() {
        startTransition(async () => {
            const result = await createReactorAction({ name, serialNumber, metrics });

            if (!result.success) {
                toast.error(result.error);
                return;
            }

            toast.success(`Reator "${name}" criado.`);
            setOpen(false);
            setName("");
            setSerialNumber("");
            setMetrics(REACTOR_SCHEMA.map((m) => m.key));
            router.refresh();
        });
    }

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
                <Plus className="h-4 w-4" aria-hidden />
                Novo reator
            </button>
        );
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-reactor-title"
        >
            <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6">
                <h2 id="create-reactor-title" className="text-lg font-semibold">
                    Novo reator
                </h2>

                <div className="mt-5 space-y-4">
                    <Field label="Nome" htmlFor="reactor-name">
                        <input
                            id="reactor-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Reator 1"
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        />
                    </Field>

                    <Field
                        label="Número de série do nó"
                        htmlFor="reactor-serial"
                        hint="Tem de ser igual ao device_id gravado no firmware do ESP32."
                    >
                        <input
                            id="reactor-serial"
                            value={serialNumber}
                            onChange={(e) => setSerialNumber(e.target.value)}
                            placeholder="cmp4f4kbq0007ycsxa1w2n3r5"
                            className="tabular w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        />
                    </Field>

                    <fieldset>
                        <legend className="text-sm font-medium">Canais</legend>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                            {REACTOR_SCHEMA.map((metric) => (
                                <label
                                    key={metric.key}
                                    className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                                >
                                    <input
                                        type="checkbox"
                                        checked={metrics.includes(metric.key)}
                                        onChange={() => toggleMetric(metric.key)}
                                    />
                                    <span
                                        className="h-2 w-2 rounded-full"
                                        style={{ backgroundColor: metric.color }}
                                        aria-hidden
                                    />
                                    {metric.label}
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    {hasUnmet && (
                        <p className="flex gap-2 rounded-md bg-surface-muted p-3 text-sm text-warning">
                            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                            <span>
                                {Object.entries(unmet).map(([metric, deps]) => {
                                    const label = REACTOR_SCHEMA.find((m) => m.key === metric)?.label ?? metric;
                                    const depLabels = deps
                                        .map((d) => REACTOR_SCHEMA.find((m) => m.key === d)?.label ?? d)
                                        .join(", ");
                                    return (
                                        <span key={metric} className="block">
                                            {label} requer {depLabels} para compensação de temperatura.
                                        </span>
                                    );
                                })}
                            </span>
                        </p>
                    )}
                </div>

                <div className="mt-6 flex justify-end gap-2">
                    <button
                        onClick={() => setOpen(false)}
                        disabled={pending}
                        className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={submit}
                        disabled={pending || hasUnmet || !name.trim() || !serialNumber.trim()}
                        className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-40"
                    >
                        {pending ? "A criar…" : "Criar reator"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function Field({
    label,
    htmlFor,
    hint,
    children,
}: {
    label: string;
    htmlFor: string;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <label htmlFor={htmlFor} className="text-sm font-medium">
                {label}
            </label>
            <div className="mt-1.5">{children}</div>
            {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
    );
}
