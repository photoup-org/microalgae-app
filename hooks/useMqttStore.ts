"use client";

import { create } from "zustand";
import mqtt, { MqttClient } from "mqtt";
import { SensorReading } from "@/lib/types";

const DEPARTMENT_ID = process.env.NEXT_PUBLIC_DEPARTMENT_ID ?? "";
const MAX_SERIES_POINTS = 1000;
const FLUSH_INTERVAL_MS = 100;
/** How often liveness is re-evaluated when no message arrives at all. */
const LIVENESS_TICK_MS = 5000;
/**
 * A node that says "online" but has sent no reading for this long - or for three
 * of its own sample intervals, whichever is longer - is shown as "stale". The
 * broker's Last Will only fires once the TCP link times out, and never fires for
 * a node that is connected but stuck, so the retained status alone over-reports.
 */
const STALE_MIN_MS = 30_000;
const STALE_INTERVALS = 3;
const DEFAULT_INTERVAL_S = 10;

type Listener = (payload: unknown) => void;

/** Retained gateway/{id}/update payload from the Pi's edge updater. */
export interface EdgeUpdateState {
    state: "up_to_date" | "available" | "building" | "applying" | "failed" | "blocked" | "offline";
    message?: string;
    checked_at?: number;
    repos?: Record<string, { current?: string; latest?: string; behind?: number; changes?: string[] }>;
}

interface MqttState {
    client: MqttClient | null;
    isConnected: boolean;
    listeners: Record<string, Set<Listener>>;
    /** deviceId -> latest wide /sync payload. */
    liveValues: Record<string, Record<string, number | string | null>>;
    /** deviceId -> rolling long-form history. */
    chartSeries: Record<string, SensorReading[]>;
    /**
     * hardware id -> "online" | "offline" | "stale". "online"/"offline" come from
     * the retained LWT topic; "stale" overrides "online" when readings stopped.
     */
    deviceStatus: Record<string, string>;
    /** "online" | "offline" | null (no retained message seen yet), from gateway/{id}/status. */
    edgeServerStatus: string | null;
    /** Latest state of the edge updater, or null if none was ever published. */
    edgeUpdate: EdgeUpdateState | null;
}

interface MqttActions {
    connect: () => void;
    disconnect: () => void;
    subscribe: (topic: string, cb: Listener) => () => void;
}

/*
 * Incoming messages are written to these module-level buffers and flushed into
 * React state on a timer. At a 1s publish rate across several devices, writing
 * straight to the store re-renders every subscriber per message; batching caps
 * that at 10Hz. Ported from app-gui, whose version never cleared the interval —
 * this one does, in disconnect().
 */
let liveValuesBuffer: MqttState["liveValues"] = {};
let chartSeriesBuffer: MqttState["chartSeries"] = {};
let statusBuffer: MqttState["deviceStatus"] = {};
// Liveness inputs, kept outside React state: raw retained status, when each node
// last sent a reading, when it last announced "online", and its sample interval.
let rawStatus: Record<string, string> = {};
let lastSeen: Record<string, number> = {};
let onlineSince: Record<string, number> = {};
let sampleInterval: Record<string, number> = {};
let livenessTimer: ReturnType<typeof setInterval> | null = null;

function effectiveStatus(now: number): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [id, raw] of Object.entries(rawStatus)) {
        if (raw !== "online") {
            out[id] = raw;
            continue;
        }
        const reference = lastSeen[id] ?? onlineSince[id] ?? now;
        const threshold = Math.max(STALE_MIN_MS, STALE_INTERVALS * (sampleInterval[id] ?? DEFAULT_INTERVAL_S) * 1000);
        out[id] = now - reference > threshold ? "stale" : "online";
    }
    return out;
}

function sameStatus(a: Record<string, string>, b: Record<string, string>): boolean {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}
let edgeServerStatusBuffer: string | null = null;
let isBufferDirty = false;
let flushTimer: ReturnType<typeof setInterval> | null = null;

export const useMqttStore = create<MqttState & MqttActions>((set, get) => ({
    client: null,
    isConnected: false,
    listeners: {},
    liveValues: {},
    chartSeries: {},
    deviceStatus: {},
    edgeServerStatus: null,
    edgeUpdate: null,

    connect: () => {
        if (get().client) return;

        const url = process.env.NEXT_PUBLIC_MQTT_CONNECTION_URL;
        if (!url) {
            console.error("[MQTT] NEXT_PUBLIC_MQTT_CONNECTION_URL is not set.");
            return;
        }

        const client = mqtt.connect(url);
        set({ client });

        client.on("connect", () => {
            set({ isConnected: true });

            client.subscribe([
                `ui/live/department/${DEPARTMENT_ID}/device/+/sync`,
                `ui/live/department/${DEPARTMENT_ID}/device/+/raw`,
                "nodes/+/status",
                "nodes/+/metadata",
                "gateway/+/status",
                "gateway/+/update",
            ]);

            // Re-subscribe anything registered through subscribe() before we connected.
            Object.keys(get().listeners).forEach((topic) => client.subscribe(topic));
        });

        client.on("close", () => set({ isConnected: false }));
        client.on("error", (err) => console.error("[MQTT] error:", err));

        client.on("message", (topic, buffer) => {
            const parts = topic.split("/");

            // nodes/{id}/status carries a bare string, not JSON.
            if (parts[0] === "nodes" && parts[2] === "status") {
                const value = buffer.toString();
                rawStatus = { ...rawStatus, [parts[1]]: value };
                if (value === "online") onlineSince = { ...onlineSince, [parts[1]]: Date.now() };
                statusBuffer = effectiveStatus(Date.now());
                isBufferDirty = true;
                return;
            }

            // nodes/{id}/metadata (retained, JSON): only the sample interval is used,
            // to scale how long a silent node may stay "online".
            if (parts[0] === "nodes" && parts[2] === "metadata") {
                try {
                    const interval = Number((JSON.parse(buffer.toString()) as { interval?: unknown }).interval);
                    if (Number.isFinite(interval) && interval > 0) {
                        sampleInterval = { ...sampleInterval, [parts[1]]: interval };
                    }
                } catch {
                    // Malformed metadata: keep the default interval.
                }
                return;
            }

            // gateway/{id}/status: the edge worker's own retained LWT, bare string.
            if (parts[0] === "gateway" && parts[2] === "status") {
                edgeServerStatusBuffer = buffer.toString();
                isBufferDirty = true;
                return;
            }

            let payload: Record<string, unknown>;
            try {
                payload = JSON.parse(buffer.toString());
            } catch {
                return;
            }

            // gateway/{id}/update: rare and human-paced, so set directly.
            if (parts[0] === "gateway" && parts[2] === "update") {
                set({ edgeUpdate: payload as unknown as EdgeUpdateState });
                return;
            }

            // ui/live/department/{dept}/device/{id}/sync -> 7 segments
            if (parts.length === 7 && parts[4] === "device") {
                const deviceId = parts[5];
                const kind = parts[6];

                if (kind === "sync") {
                    lastSeen = { ...lastSeen, [deviceId]: Date.now() };
                    if (rawStatus[deviceId] === "online") {
                        statusBuffer = effectiveStatus(Date.now());
                    }
                    liveValuesBuffer = {
                        ...liveValuesBuffer,
                        [deviceId]: payload as Record<string, number | string | null>,
                    };

                    const timestamp = (payload.timestamp as string) ?? new Date().toISOString();
                    const additions: SensorReading[] = [];

                    for (const [metric, value] of Object.entries(payload)) {
                        if (metric === "timestamp" || metric === "experimentId") continue;
                        const numeric = Number(value);
                        if (value === null || Number.isNaN(numeric)) continue;

                        additions.push({
                            // Stable key, unlike app-gui's Math.random(), so React can
                            // reconcile these rows instead of remounting them.
                            id: `${deviceId}-${timestamp}-${metric}`,
                            deviceId,
                            metricType: metric,
                            value: numeric,
                            timestamp,
                            isSaved: false,
                        });
                    }

                    const existing = chartSeriesBuffer[deviceId] ?? get().chartSeries[deviceId] ?? [];
                    chartSeriesBuffer = {
                        ...chartSeriesBuffer,
                        [deviceId]: [...existing, ...additions].slice(-MAX_SERIES_POINTS),
                    };
                    isBufferDirty = true;
                }
                // `raw` has no store branch by design: it is uncalibrated and only the
                // calibration wizard wants it, which reads it through subscribe().
            }

            get().listeners[topic]?.forEach((cb) => cb(payload));
        });

        flushTimer = setInterval(() => {
            if (!isBufferDirty) return;
            isBufferDirty = false;

            set((state) => ({
                liveValues: { ...state.liveValues, ...liveValuesBuffer },
                chartSeries: { ...state.chartSeries, ...chartSeriesBuffer },
                deviceStatus: { ...state.deviceStatus, ...statusBuffer },
                edgeServerStatus: edgeServerStatusBuffer ?? state.edgeServerStatus,
            }));

            liveValuesBuffer = {};
            chartSeriesBuffer = {};
            statusBuffer = {};
            edgeServerStatusBuffer = null;
        }, FLUSH_INTERVAL_MS);

        // Without traffic nothing flushes, so a node that goes silent would keep
        // its "online" forever. Re-evaluate on a slow tick.
        livenessTimer = setInterval(() => {
            const next = effectiveStatus(Date.now());
            if (!sameStatus(next, get().deviceStatus)) set({ deviceStatus: next });
        }, LIVENESS_TICK_MS);
    },

    disconnect: () => {
        if (flushTimer) {
            clearInterval(flushTimer);
            flushTimer = null;
        }
        liveValuesBuffer = {};
        chartSeriesBuffer = {};
        if (livenessTimer) {
            clearInterval(livenessTimer);
            livenessTimer = null;
        }
        statusBuffer = {};
        rawStatus = {};
        lastSeen = {};
        onlineSince = {};
        sampleInterval = {};
        edgeServerStatusBuffer = null;
        isBufferDirty = false;

        get().client?.end(true);
        set({ client: null, isConnected: false, listeners: {} });
    },

    /** Ref-counted: subscribes on the first listener, unsubscribes after the last. */
    subscribe: (topic, cb) => {
        const { client, listeners } = get();
        const existing = listeners[topic] ?? new Set<Listener>();

        existing.add(cb);
        set({ listeners: { ...listeners, [topic]: existing } });

        if (existing.size === 1) client?.subscribe(topic);

        return () => {
            const current = get().listeners[topic];
            if (!current) return;

            current.delete(cb);
            if (current.size === 0) {
                get().client?.unsubscribe(topic);
                const next = { ...get().listeners };
                delete next[topic];
                set({ listeners: next });
            }
        };
    },
}));
