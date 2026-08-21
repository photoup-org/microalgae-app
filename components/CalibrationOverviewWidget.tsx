import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

interface CalibrationEntry {
    id: string;
    name: string | null;
    lastCalibrated: Date | null;
    calibrationDueDate: Date | null;
}

function formatDate(date: Date | null) {
    if (!date) return "—";
    return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Calibration status across every registered device - not scoped to one experiment. */
export function CalibrationOverviewWidget({ devices }: { devices: CalibrationEntry[] }) {
    const now = new Date();

    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle className="text-base">Calibração</CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto">
                {devices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum dispositivo registado.</p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Dispositivo</TableHead>
                                <TableHead>Última calibração</TableHead>
                                <TableHead>Validade</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {devices.slice(0, 5).map((device) => {
                                const overdue = device.calibrationDueDate !== null && device.calibrationDueDate < now;
                                return (
                                    <TableRow key={device.id}>
                                        <TableCell>
                                            <Link href={`/devices/${device.id}`} className="font-medium hover:underline">
                                                {device.name}
                                            </Link>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{formatDate(device.lastCalibrated)}</TableCell>
                                        <TableCell className={overdue ? "font-medium text-danger" : "text-muted-foreground"}>
                                            {device.lastCalibrated ? formatDate(device.calibrationDueDate) : "Pendente"}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
