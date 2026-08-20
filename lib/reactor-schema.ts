/**
 * The metric contract for a microalgae reactor node.
 *
 * `key` values are load-bearing strings shared with the edge. They must match the
 * dict keys returned by MicroalgaeReactorDriver.map_values in
 * edge-gateway-docker/python-worker/src/drivers/microalgae_driver.py, because the
 * same strings are used as InfluxDB field names, as calibrationConfig keys, and as
 * the properties of the live /sync MQTT payload.
 *
 * Note we use `temp`, not `temperature`. app-gui carries a hardcoded remap between
 * the two; starting clean avoids inheriting it.
 */
export interface SchemaItem {
    key: string;
    label: string;
    unit: string;
    min: number;
    max: number;
    color: string;
    /**
     * Sibling metrics this reading depends on. Mirrors REQUIREMENTS on the edge
     * driver, which drops a metric outright when its dependency is missing rather
     * than emitting an uncompensated value.
     */
    requires: string[];
}

export const REACTOR_SCHEMA: SchemaItem[] = [
    { key: "ph", label: "pH", unit: "", min: 0, max: 14, color: "#3b82f6", requires: ["temp"] },
    { key: "temp", label: "Temperatura", unit: "°C", min: 0, max: 50, color: "#ef4444", requires: [] },
    { key: "turbidity", label: "Turbidez", unit: "NTU", min: 0, max: 100, color: "#22c55e", requires: [] },
    { key: "co2", label: "CO2", unit: "ppm", min: 0, max: 2000, color: "#a855f7", requires: ["temp"] },
];

/** Not a sensor channel: actuator state reported back in telemetry. */
export const VALVE_METRIC = "valve_open";

export const SCHEMA_BY_KEY: Record<string, SchemaItem> = Object.fromEntries(
    REACTOR_SCHEMA.map((m) => [m.key, m])
);

/**
 * Returns the metrics that cannot be trusted given the set of enabled channels,
 * keyed by metric with its missing dependencies. Used to block an invalid sensor
 * set at provisioning time instead of letting the edge silently degrade it.
 */
export function unmetRequirements(enabled: string[]): Record<string, string[]> {
    const present = new Set(enabled);
    const unmet: Record<string, string[]> = {};

    for (const key of enabled) {
        const missing = (SCHEMA_BY_KEY[key]?.requires ?? []).filter((dep) => !present.has(dep));
        if (missing.length > 0) unmet[key] = missing;
    }

    return unmet;
}
