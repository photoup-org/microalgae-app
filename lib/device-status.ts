import type { DeviceStatus } from "@prisma/client";

/**
 * Whether a reactor is actually reachable right now.
 *
 * The only evidence of liveness is the retained `nodes/{id}/status` topic, which
 * the firmware publishes as "online" on connect and which the broker flips to
 * "offline" via the Last Will when the connection drops
 * (esp32-sensor-firmware/src/lib/mqtt_client.py).
 *
 * This must fail CLOSED - absence of evidence is not evidence of liveness. Three
 * separate situations leave `liveStatus[serialNumber]` undefined:
 *
 *   - the device has never connected since the broker last started, so there is
 *     no retained message for it at all
 *   - mosquitto.conf sets no `persistence`, so a broker restart discards every
 *     retained message until each node reconnects and republishes
 *   - the browser's own MQTT link is down, so the store is empty regardless
 *
 * Testing `!== "offline"` treats all three as online, which is what produced
 * "ghost" devices: reactors reported online on the dashboard while nothing was
 * running at all. `Device.status` in Postgres is the registration state (is this
 * reactor commissioned?), never a liveness signal - it stays ACTIVE whether or
 * not the hardware is powered on.
 */
export function isDeviceOnline(
    device: { serialNumber: string; status?: DeviceStatus | string },
    liveStatus: Record<string, string>
): boolean {
    if (device.status !== undefined && device.status !== "ACTIVE") return false;
    return liveStatus[device.serialNumber] === "online";
}
