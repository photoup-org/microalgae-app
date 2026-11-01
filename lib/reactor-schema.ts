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
    /**
     * Display conversion. Values travel and are stored in `unit` on the wire;
     * the UI multiplies by `factor` and labels with `displayUnit`, and `min`/`max`
     * are given in display units. CO2 stays ppm in InfluxDB (the carbonate maths
     * reads ppm) but a 0-100 % sensor is unreadable in ppm next to pH and °C.
     */
    display?: { unit: string; factor: number };
    /**
     * How the channel reads before a calibration exists for it. The edge only
     * converts pH and turbidity into real units once Device.calibrationConfig
     * has an entry, so until then the value is the sensor's raw voltage.
     */
    raw?: { unit: string; min: number; max: number };
}

export const REACTOR_SCHEMA: SchemaItem[] = [
    // Raw: electrode volts referenced to the pH-7 point (0 V at pH 7, about
    // +/-0.4 V over the useful range) - see the reactor node driver.
    { key: "ph", label: "pH", unit: "", min: 0, max: 14, color: "var(--metric-ph)", requires: ["temp"],
      raw: { unit: "V", min: -0.5, max: 0.5 } },
    { key: "temp", label: "Temperatura", unit: "°C", min: 0, max: 50, color: "var(--metric-temp)", requires: [] },
    // Raw: probe output volts, high in clear water and falling as turbidity rises.
    { key: "turbidity", label: "Turbidez", unit: "NTU", min: 0, max: 100, color: "var(--metric-turbidity)", requires: [],
      raw: { unit: "V", min: 0, max: 4.5 } },
    // "gasoso" because this is the headspace gas sensor, and the carbonate chart
    // derives a DISSOLVED CO2 series alongside it. `key` stays "co2" - it is an
    // InfluxDB field name, a calibrationConfig key and a /sync payload property,
    // and renaming it would orphan every recorded series.
    // The INIR2 on the reactor is the 0-100 % vol part, so the gauge spans that.
    { key: "co2", label: "CO₂ gasoso", unit: "ppm", min: 0, max: 100, color: "var(--metric-co2)", requires: ["temp"],
      display: { unit: "%", factor: 1e-4 } },
];

/** Not a sensor channel: actuator state reported back in telemetry. */
export const VALVE_METRIC = "valve_open";

export const SCHEMA_BY_KEY: Record<string, SchemaItem> = Object.fromEntries(
    REACTOR_SCHEMA.map((m) => [m.key, m])
);

/** How one channel is shown: unit label, gauge range and wire-to-display factor. */
export interface MetricPresentation {
    unit: string;
    min: number;
    max: number;
    factor: number;
    /** True while the value is a raw sensor reading awaiting calibration. */
    uncalibrated: boolean;
}

/**
 * `calibrated` lists the channels with a calibration on the device. Undefined
 * means the caller does not know, and the calibrated presentation is assumed -
 * the behaviour before raw units were distinguished.
 */
export function presentMetric(metric: SchemaItem, calibrated?: string[]): MetricPresentation {
    if (metric.raw && calibrated && !calibrated.includes(metric.key)) {
        return { unit: metric.raw.unit, min: metric.raw.min, max: metric.raw.max, factor: 1, uncalibrated: true };
    }
    return {
        unit: metric.display?.unit ?? metric.unit,
        min: metric.min,
        max: metric.max,
        factor: metric.display?.factor ?? 1,
        uncalibrated: false,
    };
}

/** Channels with an entry in Device.calibrationConfig. */
export function calibratedMetrics(calibrationConfig: unknown): string[] {
    if (!calibrationConfig || typeof calibrationConfig !== "object") return [];
    return Object.entries(calibrationConfig as Record<string, unknown>)
        .filter(([, value]) => Boolean(value))
        .map(([key]) => key);
}

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
