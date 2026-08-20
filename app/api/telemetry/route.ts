import { NextRequest, NextResponse } from "next/server";
import { isEdgeAuthorized } from "@/lib/core/edge-auth";

/**
 * Telemetry sink for the edge worker's periodic flush.
 *
 * This app reads telemetry straight from InfluxDB measurement `sensor_reading`,
 * which the worker writes itself (storage/influx_manager.py). It does NOT need the
 * data in this POST — app-gui uses this route to write a second, differently-shaped
 * measurement called `telemetry`, and we deliberately do not duplicate that.
 *
 * The route exists anyway because the worker derives BOTH this URL and the
 * device-online webhook URL from a single NEXTJS_API_URL env var. If that points
 * here and this route is missing, every flush fails, gets retried three times with
 * backoff, and then lands in the worker's SQLite dead-letter queue. Acknowledging
 * and discarding keeps that queue empty.
 *
 * So: only one app can own NEXTJS_API_URL. If app-gui owns it, this route is never
 * called and everything still works, because the InfluxDB read path is independent.
 */
export async function POST(req: NextRequest) {
    // Excluded from the proxy matcher, so this bearer check is the only guard.
    if (!isEdgeAuthorized(req.headers.get("authorization"))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const count = Array.isArray(body?.readings) ? body.readings.length : 0;
        console.log(
            `[telemetry] Acknowledged ${count} reading(s) for experiment ${body?.experimentId}; ` +
            `not persisted here (read path uses InfluxDB measurement sensor_reading).`
        );
    } catch {
        // A malformed body is still acknowledged; retrying it would not help.
    }

    return NextResponse.json({ success: true, persisted: false });
}
