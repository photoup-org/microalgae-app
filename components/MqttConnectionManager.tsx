"use client";

import { useEffect } from "react";
import { useMqttStore } from "@/hooks/useMqttStore";

/**
 * Headless. Opens the single browser MQTT connection for the app and tears it
 * down on unmount. Mounted once in the authenticated layout.
 */
export function MqttConnectionManager() {
    const connect = useMqttStore((s) => s.connect);
    const disconnect = useMqttStore((s) => s.disconnect);

    useEffect(() => {
        connect();
        return () => disconnect();
    }, [connect, disconnect]);

    return null;
}
