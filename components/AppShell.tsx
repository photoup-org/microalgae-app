import Link from "next/link";
import { cookies } from "next/headers";
import { Plus, Bell } from "lucide-react";
import { LogLevel } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { getCurrentUser } from "@/lib/core/auth/user";
import { LOCAL_SESSION_COOKIE, localSessionEnabled, verifyLocalSession } from "@/lib/core/auth/local-session";
import { MqttConnectionManager } from "@/components/MqttConnectionManager";
import { DesktopSidebar } from "@/components/SidebarNav";
import { MobileNav } from "@/components/MobileNav";
import { OfflineBanner } from "@/components/OfflineBanner";
import { Button } from "@/components/ui/button";

interface AppShellProps {
    children: React.ReactNode;
    /** Renders in the topbar instead of the page body. Omit to leave the topbar title-less. */
    title?: string;
    eyebrow?: string;
}

export async function AppShell({ children, title, eyebrow }: AppShellProps) {
    const [alertCount, user] = await Promise.all([
        prisma.systemLog.count({
            // Unacknowledged only. Counting every WARN+ ever written left the dot
            // permanently lit, which made it mean nothing.
            where: {
                departmentId: process.env.DEPARTMENT_ID,
                level: { in: [LogLevel.WARN, LogLevel.ERROR, LogLevel.CRITICAL] },
                acknowledgedAt: null,
            },
        }),
        getCurrentUser(),
    ]);
    // Null on the cloud instance, where pairing does not apply at all. Only the LAN
    // instance issues offline credentials.
    const paired = localSessionEnabled()
        ? (await verifyLocalSession((await cookies()).get(LOCAL_SESSION_COOKIE)?.value)) !== null
        : null;

    // AppShell only renders behind proxy.ts's auth gate, so a session always exists here.
    const sidebarUser = { name: user?.name ?? null, email: user?.email ?? "", paired };

    return (
        <div className="flex h-screen overflow-hidden">
            <MqttConnectionManager />
            <DesktopSidebar user={sidebarUser} />
            {/* min-w-0: a flex item defaults to min-width:auto, so a wide child (the
                calibration table, a chart) would stretch this column past the viewport
                and scroll the whole page sideways instead of scrolling inside its own
                overflow-x-auto container. */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <OfflineBanner />
                <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 lg:px-6">
                    <MobileNav user={sidebarUser} />
                    {title && (
                        <div className="min-w-0">
                            {eyebrow && <p className="gauge-label truncate text-muted-foreground">{eyebrow}</p>}
                            <h1 className="truncate font-heading text-base font-semibold leading-tight">{title}</h1>
                        </div>
                    )}
                    <div className="flex-1" />
                    <Button variant="ghost" size="icon" asChild aria-label="Novo projeto">
                        <Link href="/projects?new=1">
                            <Plus className="size-4" aria-hidden />
                        </Link>
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        asChild
                        className="relative"
                        aria-label={alertCount > 0 ? `Alertas: ${alertCount} por tratar` : "Alertas"}
                    >
                        <Link href="/incidents">
                            <Bell className="size-4" aria-hidden />
                            {alertCount > 0 && (
                                <span
                                    className="tabular absolute top-0.5 right-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white"
                                    aria-hidden
                                >
                                    {alertCount > 99 ? "99+" : alertCount}
                                </span>
                            )}
                        </Link>
                    </Button>
                </header>
                <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
            </div>
        </div>
    );
}
