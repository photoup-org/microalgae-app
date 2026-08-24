"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Bell, BellOff, Send } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { subscribeToPushAction, unsubscribeFromPushAction, sendTestPushAction } from "@/actions/push";

/** VAPID public keys are base64url; PushManager wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const raw = window.atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    // Backed by an explicit ArrayBuffer so the type is not the SharedArrayBuffer
    // union, which applicationServerKey does not accept.
    const bytes = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes;
}

/**
 * Opt-in for push alerts, per browser.
 *
 * Per browser, not per user: a subscription belongs to one installed app on one
 * device, so someone signing in on a phone and a laptop has to enable it on each.
 * That is a property of the Push API, not a shortcut here.
 *
 * The whole control hides itself when the browser has no push support, or when
 * the page is not in a secure context. Both are real for this app - a LAN
 * deployment served over plain http://reactor.local has no service worker at all,
 * and rendering a button that can only ever fail would be worse than silence.
 */
export function PushToggle() {
    // Null until the service worker has actually registered. Both facts land in one
    // state so nothing is set synchronously in the effect body, and so an
    // unsupported browser simply never leaves the null (render nothing) state.
    const [status, setStatus] = useState<{ subscribed: boolean } | null>(null);
    const [pending, startTransition] = useTransition();
    const subscribed = status?.subscribed === true;

    useEffect(() => {
        let cancelled = false;

        (async () => {
            if (!("serviceWorker" in navigator) || !("PushManager" in window) || !window.isSecureContext) {
                return;
            }

            try {
                const registration = await navigator.serviceWorker.register(
                    new URL("../lib/service-worker.js", import.meta.url),
                    {
                        scope: "/",
                        // The worker itself must never be served from cache, or a fixed
                        // bug in it can survive indefinitely on a device.
                        updateViaCache: "none",
                    }
                );
                const existing = await registration.pushManager.getSubscription();
                if (!cancelled) setStatus({ subscribed: existing !== null });
            } catch (error) {
                console.error("[push] Service worker registration failed:", error);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    function enable() {
        startTransition(async () => {
            try {
                const permission = await Notification.requestPermission();
                if (permission !== "granted") {
                    toast.error("Permissão de notificações recusada.");
                    return;
                }

                const registration = await navigator.serviceWorker.ready;
                const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
                if (!key) {
                    toast.error("Chave VAPID não configurada no servidor.");
                    return;
                }

                const subscription = await registration.pushManager.subscribe({
                    // Required by Chrome: every push must produce a visible
                    // notification, which is why the service worker always shows one.
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(key),
                });

                const result = await subscribeToPushAction(
                    JSON.parse(JSON.stringify(subscription)),
                    navigator.userAgent
                );
                if (!result.success) {
                    // Roll the browser-side subscription back, or the device would sit
                    // registered with the push service while the server has no way to
                    // reach it.
                    await subscription.unsubscribe();
                    toast.error(result.error);
                    return;
                }

                setStatus({ subscribed: true });
                toast.success("Alertas críticos serão enviados para este dispositivo.");
            } catch (error) {
                console.error("[push] Subscribe failed:", error);
                toast.error("Não foi possível ativar as notificações.");
            }
        });
    }

    function disable() {
        startTransition(async () => {
            try {
                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.getSubscription();
                if (subscription) {
                    await unsubscribeFromPushAction(subscription.endpoint);
                    await subscription.unsubscribe();
                }
                setStatus({ subscribed: false });
                toast.success("Notificações desativadas neste dispositivo.");
            } catch (error) {
                console.error("[push] Unsubscribe failed:", error);
                toast.error("Não foi possível desativar as notificações.");
            }
        });
    }

    function sendTest() {
        startTransition(async () => {
            const result = await sendTestPushAction();
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            toast.success(`Enviado para ${result.data} dispositivo(s).`);
        });
    }

    if (status === null) return null;

    return (
        <>
            <DropdownMenuItem
                disabled={pending}
                onSelect={(e) => {
                    e.preventDefault();
                    if (subscribed) disable();
                    else enable();
                }}
            >
                {subscribed ? <BellOff className="size-4" /> : <Bell className="size-4" />}
                {subscribed ? "Desativar notificações" : "Ativar notificações"}
            </DropdownMenuItem>
            {subscribed && (
                <DropdownMenuItem
                    disabled={pending}
                    onSelect={(e) => {
                        e.preventDefault();
                        sendTest();
                    }}
                >
                    <Send className="size-4" />
                    Enviar notificação de teste
                </DropdownMenuItem>
            )}
        </>
    );
}
