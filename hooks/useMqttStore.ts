"use client";

import { create } from "zustand";
import mqtt, { MqttClient } from "mqtt";
import { SensorReading } from "@/lib/types";

const DEPARTMENT_ID = process.env.NEXT_PUBLIC_DEPARTMENT_ID ?? "";
const MAX_SERIES_POINTS = 1000;
const FLUSH_INTERVAL_MS = 100;

type Listener = (payload: unknown) => void;

interface MqttState {
    client: MqttClient | null;
    isConnected: boolean;
    listeners: Record<string, Set<Listener>>;
    /** deviceId -> latest wide /sync payload. */
    liveValues: Record<string, Record<string, number | string | null>>;
    /** deviceId -> rolling long-form history. */
    chartSeries: Record<string, SensorReading[]>;
    /** hardware id -> "online" | "offline", from the retained LWT topic. */
    deviceStatus: Record<string, string>;
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
let isBufferDirty = false;
let flushTimer: ReturnType<typeof setInterval> | null = null;

export const useMqttStore = create<MqttState & MqttActions>((set, get) => ({
    client: null,
    isConnected: false,
    listeners: {},
    liveValues: {},
    chartSeries: {},
    deviceStatus: {},

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
                statusBuffer = { ...statusBuffer, [parts[1]]: buffer.toString() };
                isBufferDirty = true;
                return;
            }

            let payload: Record<string, unknown>;
            try {
                payload = JSON.parse(buffer.toString());
            } catch {
                return;
            }

            // ui/live/department/{dept}/device/{id}/sync -> 7 segments
            if (parts.length === 7 && parts[4] === "device") {
                const deviceId = parts[5];
                const kind = parts[6];

                if (kind === "sync") {
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
            }));

            liveValuesBuffer = {};
            chartSeriesBuffer = {};
            statusBuffer = {};
        }, FLUSH_INTERVAL_MS);
    },

    disconnect: () => {
        if (flushTimer) {
            clearInterval(flushTimer);
            flushTimer = null;
        }
        liveValuesBuffer = {};
        chartSeriesBuffer = {};
        statusBuffer = {};
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
