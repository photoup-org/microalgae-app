import Link from "next/link";
import { ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { AppShell } from "@/components/AppShell";
import { ReactorTile } from "@/components/ReactorTile";
import { CreateReactorDialog } from "@/components/CreateReactorDialog";
import { ResyncButton } from "@/components/ResyncButton";

export const dynamic = "force-dynamic";

export default async function ReactorsPage() {
    const reactors = await prisma.project.findMany({
        where: {
            departmentId: process.env.DEPARTMENT_ID,
            status: ProjectStatus.ACTIVE,
        },
        include: { devices: true },
        orderBy: { createdAt: "asc" },
    });

    return (
        <AppShell>
            <div className="mb-8 flex items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Reatores</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {reactors.length === 0
                            ? "Nenhum reator configurado."
                            : `${reactors.length} reator${reactors.length === 1 ? "" : "es"} ativo${reactors.length === 1 ? "" : "s"}.`}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <ResyncButton />
                    <CreateReactorDialog />
                </div>
            </div>

            {reactors.length === 0 ? (
                <EmptyState />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {reactors.map((reactor) => {
                        const device = reactor.devices[0];
                        return (
                            <Link key={reactor.id} href={`/reactors/${reactor.id}`} className="block">
                                <ReactorTile
                                    name={reactor.name}
                                    serialNumber={device?.serialNumber ?? null}
                                    deviceStatus={device?.status ?? null}
                                    metrics={(reactor.settings as { metrics?: string[] } | null)?.metrics ?? []}
                                />
                            </Link>
                        );
                    })}
                </div>
            )}
        </AppShell>
    );
}

function EmptyState() {
    return (
        <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center">
            <h2 className="font-medium">Ainda não há reatores</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Crie um reator com o número de série do nó ESP32. O número de série tem de
                ser exatamente igual ao <code className="tabular">device_id</code> gravado no
                firmware, caso contrário a telemetria não é associada.
            </p>
        </div>
    );
}
