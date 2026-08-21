import Link from "next/link";
import { Plus, Bell } from "lucide-react";
import { LogLevel } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import { getCurrentUser } from "@/lib/core/auth/user";
import { MqttConnectionManager } from "@/components/MqttConnectionManager";
import { DesktopSidebar } from "@/components/SidebarNav";
import { MobileNav } from "@/components/MobileNav";
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
            where: { departmentId: process.env.DEPARTMENT_ID, level: { in: [LogLevel.WARN, LogLevel.ERROR, LogLevel.CRITICAL] } },
        }),
        getCurrentUser(),
    ]);
    // AppShell only renders behind proxy.ts's auth gate, so a session always exists here.
    const sidebarUser = { name: user?.name ?? null, email: user?.email ?? "" };

    return (
        <div className="flex h-screen overflow-hidden">
            <MqttConnectionManager />
            <DesktopSidebar user={sidebarUser} />
            <div className="flex min-h-0 flex-1 flex-col">
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
                    <Button variant="ghost" size="icon" asChild className="relative" aria-label="Alertas">
                        <Link href="/incidents">
                            <Bell className="size-4" aria-hidden />
                            {alertCount > 0 && (
                                <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-danger" aria-hidden />
                            )}
                        </Link>
                    </Button>
                </header>
                <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
            </div>
        </div>
    );
}
