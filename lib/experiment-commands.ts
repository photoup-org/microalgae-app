import "server-only";
import { publishMQTTMessage } from "@/lib/core/mqtt";
import { DEFAULT_DB_INTERVAL_SECONDS } from "@/lib/experiment-defaults";

/**
 * Publishes the command that opens the worker's in-memory buffer for a set of
 * devices, which is what makes it start flushing telemetry to InfluxDB - confirmed
 * during testing that nothing is persisted without this, even though the live
 * MQTT fan-out works regardless.
 *
 * Every id in the map resolves to serialNumber, never the Prisma cuid: the worker
 * derives a "db_id" from these keys and uses it for the live topic segments, the
 * calibration/config key, and the InfluxDB device_id tag. Mapping to the wire id
 * keeps all of those addressable by one identity.
 *
 * Lives here rather than in actions/experiments.ts because three callers need it:
 * starting a run, the manual Resync button, and app/api/edge/resync (which the
 * worker calls itself after a restart).
 */
export { DEFAULT_DB_INTERVAL_SECONDS } from "@/lib/experiment-defaults";

export interface ExperimentDevice {
    serialNumber: string;
    name: string | null;
}

export interface ExperimentSettings {
    devices?: Record<string, Record<string, number>>;
    dbInterval?: number;
}

/**
 * `liveInterval` is fixed at 1s, not configurable - live/alert-detection telemetry
 * always samples every second. `dbInterval` is the only tunable rate: how often
 * the worker flushes its buffer to InfluxDB (device_buffer.py's storage_frequency,
 * read from settings.dbInterval - see main.py's cmd/experiments/+/start handler).
 * Faster live sampling without a matching storage rate would otherwise silently
 * write every sample to Influx, which is what dbInterval exists to prevent.
 */
export async function publishExperimentStart(
    experimentId: string,
    devices: ExperimentDevice[],
    deviceLimits?: Record<string, Record<string, number>>,
    dbInterval = DEFAULT_DB_INTERVAL_SECONDS
) {
    const deviceMap = Object.fromEntries(devices.map((d) => [d.serialNumber, d.serialNumber]));
    // The worker writes the alert text itself and only knows the names we send
    // here: device_buffer.py falls back to the literal "Dispositivo Desconhecido"
    // for any db_id missing from deviceLabels, which is what every threshold alert
    // read before this. Keyed by serialNumber to match deviceMap's db_id.
    const deviceLabels = Object.fromEntries(
        devices.map((d) => [d.serialNumber, d.name ?? d.serialNumber])
    );
    await publishMQTTMessage(`cmd/experiments/${experimentId}/start`, {
        storageFrequency: dbInterval,
        aggregationStrategy: "AVG",
        anchorTime: Math.floor(Date.now() / 1000),
        departmentId: process.env.DEPARTMENT_ID,
        deviceMap,
        deviceSns: deviceMap,
        deviceLabels,
        deviceNames: deviceLabels,
        // `devices` here is what the edge worker's threshold-breach check reads
        // (device_buffer.py: `{metric}Min`/`{metric}Max` per serialNumber) - without
        // it the check silently no-ops, since an empty dict has no keys to breach.
        settings: { liveInterval: 1, dbInterval, devices: deviceLimits ?? {} },
    });
}
