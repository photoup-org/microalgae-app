"use server";

import { prisma } from "@/lib/core/prisma";
import { getDeviceTelemetry } from "@/lib/db/influx";
import { requireUser } from "@/lib/core/auth/user";
import type { ActionResult } from "@/lib/action-result";
import type { SensorReading } from "@/lib/types";

export interface ExperimentExportData {
    project: { name: string; description: string | null };
    experiment: { name: string; status: string; startDate: string; endDate: string | null };
    devices: { name: string; serialNumber: string; sensors: string[]; description: string | null }[];
    telemetry: SensorReading[];
}

/**
 * Gathers everything needed to export one experiment to Excel.
 *
 * Two things this deliberately does differently from app-gui's version:
 *  1. Scoped by department - app-gui's getExperimentTelemetryForExport takes any
 *     experimentId with no ownership check at all.
 *  2. Reads InfluxDB per device over [startDate, endDate ?? now] instead of an
 *     unbounded Prisma.sensorReading.findMany - this app never writes that table
 *     (telemetry lives only in InfluxDB), and getDeviceTelemetry already
 *     downsamples via aggregateWindow, so the row count stays bounded even for a
 *     months-long continuous experiment.
 */
export async function getExperimentExportDataAction(experimentId: string): Promise<ActionResult<ExperimentExportData>> {
    try {
        await requireUser();
    } catch {
        return { success: false, error: "Não autenticado." };
    }

    const experiment = await prisma.experiment.findFirst({
        where: { id: experimentId, project: { departmentId: process.env.DEPARTMENT_ID } },
        include: { project: true, devices: true },
    });
    if (!experiment) return { success: false, error: "Experiência não encontrada." };

    const end = experiment.endDate ?? new Date();
    const perDevice = await Promise.all(
        experiment.devices.map(async (device) => {
            try {
                return await getDeviceTelemetry(device.serialNumber, experiment.startDate, end);
            } catch (error) {
                console.error(`[export] InfluxDB read failed for ${device.serialNumber}:`, error);
                return [];
            }
        })
    );

    return {
        success: true,
        data: {
            project: { name: experiment.project.name, description: experiment.project.description },
            experiment: {
                name: experiment.name,
                status: experiment.status,
                startDate: experiment.startDate.toISOString(),
                endDate: experiment.endDate?.toISOString() ?? null,
            },
            devices: experiment.devices.map((d) => {
                const config = (d.config ?? {}) as { sensors?: string[]; description?: string };
                return {
                    name: d.name ?? d.serialNumber,
                    serialNumber: d.serialNumber,
                    sensors: config.sensors ?? [],
                    description: config.description ?? null,
                };
            }),
            telemetry: perDevice.flat(),
        },
    };
}
