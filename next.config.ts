import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    experimental: {
        // Holds and retries a navigation or Server Action that fails because the
        // network dropped, instead of throwing, and exposes the useOffline hook
        // that OfflineBanner reads. Without the flag that hook always returns false.
        //
        // This is connectivity handling, not offline caching: nothing is stored
        // for a cold start with no network. Real offline needs a caching service
        // worker (Serwist) or the app running on the Pi itself.
        useOffline: true,
    },
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    // The console has no embeddable surface, so framing it can only
                    // ever be clickjacking - and the things a frame could click here
                    // actuate valves.
                    { key: "X-Frame-Options", value: "DENY" },
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                ],
            },
        ];
    },
};

export default nextConfig;
