/**
 * Push receiver.
 *
 * Deliberately does NOT cache anything. Next 16's own offline handling
 * (experimental.useOffline) covers connectivity drops, and a hand-rolled cache
 * here would fight the framework's RSC payloads rather than help. If real
 * offline shell caching is wanted later, that is Serwist's job, not this file's.
 *
 * Registered from components/PushToggle.tsx via new URL(...), so it is bundled
 * and versioned by the build rather than served as a static asset.
 */

self.addEventListener("push", (event) => {
    if (!event.data) return;

    let data;
    try {
        data = event.data.json();
    } catch {
        // A push body that is not our JSON is not something we can render
        // meaningfully. Showing nothing would violate userVisibleOnly and cost the
        // subscription, so fall back to the raw text.
        data = { title: "Microalgas", body: event.data.text() };
    }

    event.waitUntil(
        self.registration.showNotification(data.title ?? "Microalgas", {
            body: data.body,
            icon: "/icon-192.png",
            badge: "/badge-96.png",
            // Collapses repeats of the same condition into one notification instead
            // of stacking. Mirrors the dedupKey the incident itself carries.
            tag: data.tag,
            renotify: Boolean(data.tag),
            // A reactor problem at 3am should survive being missed on the lock
            // screen, so it does not auto-dismiss.
            requireInteraction: data.requireInteraction === true,
            vibrate: [100, 50, 100],
            data: { url: data.url ?? "/incidents" },
        })
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const target = event.notification.data?.url ?? "/incidents";

    // Focus an already-open tab rather than piling up windows - someone acting on
    // an alert usually has the console open on another screen already.
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ("focus" in client) {
                    client.navigate(target);
                    return client.focus();
                }
            }
            return self.clients.openWindow(target);
        })
    );
});
