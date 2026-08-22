import "server-only";
import { InfluxDB } from "@influxdata/influxdb-client";
import { SensorReading } from "@/lib/types";

const INFLUX_URL = process.env.INFLUX_URL || "http://localhost:8086";
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || "";
const INFLUX_ORG = process.env.INFLUX_ORG || "";
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || "";

const client = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN });

/**
 * Tag and column names on the measurement the edge worker writes directly
 * (storage/influx_manager.py). Note `device_id` with an underscore — app-gui's
 * separate `telemetry` measurement uses `deviceId`, and mixing them silently
 * returns nothing.
 */
const MEASUREMENT = "sensor_reading";
const SYSTEM_COLUMNS = new Set([
    "result", "table", "_start", "_stop", "_time", "_measurement", "device_id", "profile",
]);

/** Device ids are cuids. Flux has no bound parameters here, so validate before interpolating. */
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Picks an aggregation window that keeps a query near `targetPoints` regardless of
 * range. Without this a reactor logging for months returns every raw point; app-gui
 * has no downsampling at all and truncates client-side with .slice(-1000).
 */
function pickWindow(startMs: number, endMs: number, targetPoints = 720): string {
    const seconds = Math.max(1, Math.floor((endMs - startMs) / 1000 / targetPoints));

    // Below 10s the window has to follow `seconds` exactly, not clamp up to "10s":
    // a hard 10s floor silently averages two 5s-apart points into one bucket, so a
    // 5s acquisition frequency reads back as 10s. Aggregating finer than the real
    // write interval is lossless (each point lands in its own bucket), so erring
    // small here is safe; the targetPoints cap still handles long ranges.
    if (seconds < 10) return `${seconds}s`;
    if (seconds < 60) return `${Math.ceil(seconds / 10) * 10}s`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.ceil(seconds / 3600)}h`;
    return `${Math.ceil(seconds / 86400)}d`;
}

/**
 * Reads telemetry for one device as long-form rows, one per (timestamp x metric).
 *
 * Caveat: the worker never calls Point.time(), so these carry InfluxDB write time,
 * not the instant the sensor was read. Aggregated flushes therefore land at flush
 * time. Do not present these as exact sample times.
 */
export async function getDeviceTelemetry(
    deviceId: string,
    start: Date,
    end?: Date | null
): Promise<SensorReading[]> {
    if (!DEVICE_ID_RE.test(deviceId)) {
        throw new Error(`Refusing to query InfluxDB with a malformed device id: ${deviceId}`);
    }
    if (!INFLUX_BUCKET || !INFLUX_ORG) {
        throw new Error("INFLUX_BUCKET and INFLUX_ORG must be set.");
    }

    const startIso = start.toISOString();
    const endIso = end ? end.toISOString() : null;
    const every = pickWindow(start.getTime(), (end ?? new Date()).getTime());

    const query = `
        from(bucket: "${INFLUX_BUCKET}")
            |> range(start: ${startIso}${endIso ? `, stop: ${endIso}` : ""})
            |> filter(fn: (r) => r._measurement == "${MEASUREMENT}")
            |> filter(fn: (r) => r.device_id == "${deviceId}")
            |> aggregateWindow(every: ${every}, fn: mean, createEmpty: false)
            |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
            |> sort(columns: ["_time"], desc: false)
    `;

    const rows = await client.getQueryApi(INFLUX_ORG).collectRows<Record<string, unknown>>(query);
    const readings: SensorReading[] = [];

    for (const row of rows) {
        const time = row._time as string;

        for (const [key, value] of Object.entries(row)) {
            if (SYSTEM_COLUMNS.has(key) || value === null || value === undefined) continue;

            const numeric = Number(value);
            if (Number.isNaN(numeric)) continue;

            readings.push({
                id: `${deviceId}-${time}-${key}`,
                deviceId,
                metricType: key,
                value: numeric,
                timestamp: time,
                isSaved: true,
            });
        }
    }

    return readings;
}

/** Most recent value per metric for one device, for server-rendered tiles. */
export async function getLatestReadings(deviceId: string): Promise<Record<string, number>> {
    if (!DEVICE_ID_RE.test(deviceId)) {
        throw new Error(`Refusing to query InfluxDB with a malformed device id: ${deviceId}`);
    }

    const query = `
        from(bucket: "${INFLUX_BUCKET}")
            |> range(start: -24h)
            |> filter(fn: (r) => r._measurement == "${MEASUREMENT}")
            |> filter(fn: (r) => r.device_id == "${deviceId}")
            |> last()
    `;

    const rows = await client.getQueryApi(INFLUX_ORG).collectRows<Record<string, unknown>>(query);
    const latest: Record<string, number> = {};

    for (const row of rows) {
        const field = row._field as string;
        const numeric = Number(row._value);
        if (field && !Number.isNaN(numeric)) latest[field] = numeric;
    }

    return latest;
}
