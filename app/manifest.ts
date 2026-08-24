import type { MetadataRoute } from "next";

/**
 * Makes the console installable to a phone home screen.
 *
 * That is not cosmetic here: on iOS, web push only works for a site the user has
 * installed to the home screen, so this file is a hard prerequisite for a
 * threshold breach ever reaching someone's phone at 3am.
 *
 * `start_url` is /dashboard rather than /, because / only redirects there and an
 * installed app opening on a redirect wastes a round trip on a cold start.
 */
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Consola de cultivo de microalgas",
        short_name: "Microalgas",
        description: "Monitorização e controlo de fotobiorreatores de microalgas.",
        start_url: "/dashboard",
        display: "standalone",
        // Matches --background / --brand in globals.css. background_color is what
        // the OS paints behind the splash screen before the app renders.
        background_color: "#f4f6f8",
        theme_color: "#2ac5c1",
        lang: "pt",
        // The same full-bleed square serves both purposes, listed separately
        // because Next types `purpose` as one value per entry. Full-bleed on
        // purpose: the platform crops its own shape out of a maskable icon, so a
        // pre-rounded asset would render double-rounded on Android.
        icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
    };
}
