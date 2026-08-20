/**
 * Reduces a device's pH calibration to a single linear {m, b} the firmware can
 * apply locally, for the automatic dosing loop only.
 *
 * The authoritative calibration (used for logged/displayed pH) lives at the edge
 * and can be piecewise (device_buffer.py applies per-segment m/b with a
 * rawBoundary). The firmware never receives that - it has no calibration data at
 * all today - so the automatic loop needs its own, deliberately simplified,
 * locally-held estimate to compare against a real pH threshold without depending
 * on the network. Precision lost by linearizing is an acceptable tradeoff here:
 * this value drives a safety hysteresis band, not the scientific record.
 */
export function deriveLinearPhApprox(
    calibration: unknown
): { m: number; b: number } | null {
    if (!calibration || typeof calibration !== "object") return null;
    const cal = calibration as { m?: number; b?: number; segments?: { m: number; b: number }[] };

    if (typeof cal.m === "number" && typeof cal.b === "number") {
        return { m: cal.m, b: cal.b };
    }
    if (Array.isArray(cal.segments) && cal.segments.length > 0) {
        // The segment nearest the operating target would be more accurate, but the
        // control-loop caller passes phCloseThreshold-aware selection is not worth
        // the complexity here - the first segment is a reasonable single estimate.
        const first = cal.segments[0];
        if (typeof first.m === "number" && typeof first.b === "number") return first;
    }
    return null;
}
