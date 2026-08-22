"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, TriangleAlert, CircleCheck } from "lucide-react";
import { CalibrationWizard } from "@/components/CalibrationWizard";
import { SCHEMA_BY_KEY } from "@/lib/reactor-schema";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export interface CalibrationRow {
    deviceId: string;
    deviceName: string | null;
    serialNumber: string;
    /** Channel key from REACTOR_CALIBRATION - "ph", "turbidity", ... */
    metric: string;
    calibratedAt: string | null;
    validUntil: string | null;
    performedBy: string | null;
}

function formatDate(value: string | null) {
    return value ? new Date(value).toLocaleDateString("pt-PT") : "—";
}

/**
 * Calibration status, one row per (reactor, sensor channel).
 *
 * Rows come from CalibrationRecord rather than Device.lastCalibrated, because the
 * device-level pair cannot say WHICH probe it refers to - calibrating either
 * channel stamps the same two columns. CalibrationRecord.metric (added in
 * migration 20260822120000) is what makes the per-channel split real rather than
 * the same date repeated under two labels.
 *
 * `showDevice` collapses the reactor column on the device page, where every row
 * is the same hardware and repeating it is noise.
 *
 * Calibrating is blocked while a run is live: re-calibrating mid-experiment
 * changes the transform applied to readings partway through, silently splitting
 * the run's data across two calibrations.
 */
export function CalibrationTable({
    rows,
    locked,
    lockedReason,
    showDevice = true,
}: {
    rows: CalibrationRow[];
    locked: boolean;
    lockedReason?: string;
    showDevice?: boolean;
}) {
    const [active, setActive] = useState<CalibrationRow | null>(null);
    const router = useRouter();

    const now = new Date();

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <SlidersHorizontal className="size-4 text-brand" aria-hidden />
                    Calibração
                </CardTitle>
            </CardHeader>
            <CardContent>
                {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Nenhum canal deste reator tem procedimento de calibração.
                    </p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                {showDevice && <TableHead>Reator</TableHead>}
                                <TableHead>Sensor</TableHead>
                                <TableHead>Última calibração</TableHead>
                                <TableHead>Validade</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead className="w-px" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row) => {
                                const schema = SCHEMA_BY_KEY[row.metric];
                                const never = !row.calibratedAt;
                                const overdue = row.validUntil !== null && new Date(row.validUntil) < now;
                                const needsCalibration = never || overdue;

                                return (
                                    <TableRow key={`${row.deviceId}-${row.metric}`}>
                                        {showDevice && (
                                            <TableCell>
                                                <p className="font-medium">{row.deviceName}</p>
                                                <p className="tabular text-xs text-muted-foreground">{row.serialNumber}</p>
                                            </TableCell>
                                        )}
                                        <TableCell>
                                            <span className="flex items-center gap-2 font-medium">
                                                <span
                                                    className="size-2.5 shrink-0 rounded-full"
                                                    style={{ backgroundColor: schema?.color }}
                                                    aria-hidden
                                                />
                                                {schema?.label ?? row.metric}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {never ? (
                                                "—"
                                            ) : (
                                                <>
                                                    {formatDate(row.calibratedAt)}
                                                    {row.performedBy && ` por ${row.performedBy}`}
                                                </>
                                            )}
                                        </TableCell>
                                        <TableCell className={overdue ? "font-medium text-danger" : "text-muted-foreground"}>
                                            {formatDate(row.validUntil)}
                                        </TableCell>
                                        <TableCell>
                                            {needsCalibration ? (
                                                <Badge className="bg-danger/10 text-danger">
                                                    <TriangleAlert className="size-3" aria-hidden />
                                                    {never ? "Nunca calibrado" : "Expirada"}
                                                </Badge>
                                            ) : (
                                                <Badge className="bg-success/10 text-success">
                                                    <CircleCheck className="size-3" aria-hidden />
                                                    Válida
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={locked}
                                                title={locked ? lockedReason : undefined}
                                                onClick={() => setActive(row)}
                                            >
                                                Calibrar
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}

                {locked && lockedReason && (
                    <p className="mt-3 text-xs text-muted-foreground">{lockedReason}</p>
                )}
            </CardContent>

            {active && (
                <CalibrationWizard
                    deviceId={active.deviceId}
                    serialNumber={active.serialNumber}
                    metricKey={active.metric}
                    onClose={() => {
                        setActive(null);
                        router.refresh();
                    }}
                />
            )}
        </Card>
    );
}
