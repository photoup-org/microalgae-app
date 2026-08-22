/**
 * Counts the device log card offers. Anything else is rejected rather than clamped.
 *
 * Lives here rather than in actions/devices.ts because a "use server" module may
 * only export async functions - a plain const exported from one is rewritten into
 * an action reference, so `.map` on it throws at runtime.
 */
export const DEVICE_LOG_LIMITS = [5, 10, 25] as const;
