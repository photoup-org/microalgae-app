import Link from "next/link";
import { prisma } from "@/lib/core/prisma";
import { AppShell } from "@/components/AppShell";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DeviceStatusBadge } from "@/components/DeviceStatusBadge";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
    const devices = await prisma.device.findMany({
        where: { departmentId: process.env.DEPARTMENT_ID },
        include: { project: true },
        orderBy: { createdAt: "desc" },
    });

    return (
        <AppShell>
            <div className="mb-6">
                <h1 className="text-2xl font-semibold tracking-tight">Dispositivos</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Aparecem automaticamente aqui assim que um nó ESP32 se liga pela primeira vez.
                </p>
            </div>

            {devices.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">
                    Nenhum dispositivo detetado ainda. Ligue um nó ao servidor local para que apareça
                    aqui.
                </p>
            ) : (
                <div className="rounded-lg border border-border bg-surface">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nome</TableHead>
                                <TableHead>Número de série</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead>Projeto</TableHead>
                                <TableHead>Canais</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {devices.map((device) => {
                                const sensors = ((device.config as { sensors?: string[] })?.sensors) ?? [];
                                return (
                                    <TableRow key={device.id} className="cursor-pointer">
                                        <TableCell>
                                            <Link href={`/devices/${device.id}`} className="font-medium hover:underline">
                                                {device.name}
                                            </Link>
                                        </TableCell>
                                        <TableCell className="tabular text-muted-foreground">{device.serialNumber}</TableCell>
                                        <TableCell><DeviceStatusBadge status={device.status} /></TableCell>
                                        <TableCell>
                                            {device.project ? (
                                                <Link href={`/projects/${device.project.id}`} className="hover:underline">
                                                    {device.project.name}
                                                </Link>
                                            ) : (
                                                <span className="text-muted-foreground">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {sensors.map((s) => (
                                                    <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                                                ))}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            )}
        </AppShell>
    );
}
