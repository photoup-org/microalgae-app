import Link from "next/link";
import { prisma } from "@/lib/core/prisma";
import { AppShell } from "@/components/AppShell";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DeviceStatusBadge } from "@/components/DeviceStatusBadge";
import { FirmwareCheckButton } from "@/components/FirmwareCheckButton";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
    const devices = await prisma.device.findMany({
        where: { departmentId: process.env.DEPARTMENT_ID },
        include: { projects: { orderBy: { name: "asc" } } },
        orderBy: { createdAt: "desc" },
    });

    return (
        <AppShell>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Dispositivos</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Aparecem automaticamente aqui assim que um nó ESP32 se liga pela primeira vez.
                    </p>
                </div>
                <FirmwareCheckButton />
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
                                <TableHead>Firmware</TableHead>
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
                                            {device.firmwareVersion ? (
                                                <span className="flex flex-col leading-tight">
                                                    <span className="tabular">{device.firmwareVersion}</span>
                                                    {/* The metadata topic is retained, so a node unplugged for a
                                                        month still reports a version. Saying when it said so is
                                                        what stops that reading as current. */}
                                                    {device.firmwareReportedAt && (
                                                        <span className="tabular text-xs text-muted-foreground">
                                                            {device.firmwareReportedAt.toLocaleDateString("pt-PT", {
                                                                day: "2-digit",
                                                                month: "2-digit",
                                                            })}
                                                        </span>
                                                    )}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {device.projects.length === 0 ? (
                                                <span className="text-muted-foreground">—</span>
                                            ) : (
                                                <span className="flex flex-wrap gap-x-2 gap-y-1">
                                                    {device.projects.map((project) => (
                                                        <Link
                                                            key={project.id}
                                                            href={`/projects/${project.id}`}
                                                            className="hover:underline"
                                                        >
                                                            {project.name}
                                                        </Link>
                                                    ))}
                                                </span>
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
