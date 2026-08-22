import "server-only";
import { prisma } from "@/lib/core/prisma";
import { REACTOR_CALIBRATION } from "@/lib/calibration-config";
import type { CalibrationRow } from "@/components/CalibrationTable";

interface DeviceForCalibration {
    id: string;
    name: string | null;
    serialNumber: string;
    config: unknown;
}

/**
 * One row per (device, calibratable channel), carrying that channel's own latest
 * CalibrationRecord.
 *
 * Channels are enumerated from REACTOR_CALIBRATION rather than from the records,
 * so a probe that has never been calibrated still gets a row to flag - the whole
 * point of the table is spotting what needs attention, and a missing row would
 * hide exactly that case. Only channels the device was provisioned with are
 * listed, and only those with a defined wet-standard procedure (CO2 and
 * temperature have none).
 */
export async function getCalibrationRows(devices: DeviceForCalibration[]): Promise<CalibrationRow[]> {
    if (devices.length === 0) return [];

    // Newest first, so the first record seen for a (device, metric) pair wins.
    const records = await prisma.calibrationRecord.findMany({
        where: { deviceId: { in: devices.map((d) => d.id) } },
        orderBy: { calibratedAt: "desc" },
        select: { deviceId: true, metric: true, calibratedAt: true, validUntil: true, performedBy: true },
    });

    const latest = new Map<string, (typeof records)[number]>();
    for (const record of records) {
        if (!record.metric) continue;
        const key = `${record.deviceId}-${record.metric}`;
        if (!latest.has(key)) latest.set(key, record);
    }

    const rows: CalibrationRow[] = [];
    for (const device of devices) {
        const enabled = ((device.config ?? {}) as { sensors?: string[] }).sensors ?? [];
        const calibratable = Object.keys(REACTOR_CALIBRATION).filter(
            (metric) => enabled.length === 0 || enabled.includes(metric)
        );

        for (const metric of calibratable) {
            const record = latest.get(`${device.id}-${metric}`);
            rows.push({
                deviceId: device.id,
                deviceName: device.name,
                serialNumber: device.serialNumber,
                metric,
                calibratedAt: record?.calibratedAt.toISOString() ?? null,
                validUntil: record?.validUntil?.toISOString() ?? null,
                performedBy: record?.performedBy ?? null,
            });
        }
    }

    return rows;
}
