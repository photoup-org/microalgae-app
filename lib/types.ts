/**
 * One metric sample at one instant, in long form.
 *
 * Defined here rather than alongside a component on purpose: app-gui's
 * lib/db/influx.ts imports this type *from a React component*, which makes the
 * data layer depend on the view layer.
 */
export interface SensorReading {
    id: string;
    deviceId: string;
    metricType: string;
    value: number;
    timestamp: Date | string;
    /** True once the point has been persisted to InfluxDB, false while it is live-only. */
    isSaved?: boolean;
}

/** Latest value per metric for one device, as carried by the live /sync payload. */
export interface LiveSnapshot {
    timestamp: string;
    [metric: string]: number | string | null;
}
