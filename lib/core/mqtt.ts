import "server-only";
import mqtt from "mqtt";

const CONNECT_TIMEOUT_MS = 5000;

/**
 * Publishes one message from a Server Action, then disconnects.
 *
 * Connect-publish-disconnect per call rather than a pooled client: Server Actions
 * run in short-lived request scopes, and a module-level client would leak
 * connections across hot reloads in dev and across lambda instances in prod.
 * Command volume here is human-scale, so the reconnect cost is irrelevant.
 */
export async function publishMQTTMessage(topic: string, payload: unknown): Promise<void> {
    const brokerUrl = process.env.MQTT_CONNECTION_URL;
    if (!brokerUrl) {
        throw new Error("MQTT_CONNECTION_URL is not set. See .env.example.");
    }

    return new Promise((resolve, reject) => {
        const client = mqtt.connect(brokerUrl);
        let settled = false;

        const fail = (error: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            client.end(true);
            reject(error);
        };

        const timer = setTimeout(
            () => fail(new Error(`[MQTT] Timed out publishing to ${topic} via ${brokerUrl}`)),
            CONNECT_TIMEOUT_MS
        );

        client.on("connect", () => {
            const body = typeof payload === "string" ? payload : JSON.stringify(payload);

            client.publish(topic, body, (err) => {
                if (err) return fail(err);
                if (settled) return;
                settled = true;
                clearTimeout(timer);

                // Close gracefully, and only resolve once the client has actually
                // shut down. client.end(true) force-closes the socket, which at QoS 0
                // discards the packet before it is flushed to the broker: the publish
                // callback still reports success, so the command is lost silently.
                client.end(false, {}, () => resolve());
            });
        });

        client.on("error", (err) => fail(err));
    });
}
