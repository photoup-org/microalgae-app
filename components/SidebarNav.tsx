"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/components/nav-items";
import { ConnectionBadge } from "@/components/ConnectionBadge";

export function SidebarNavItems({ onNavigate }: { onNavigate?: () => void }) {
    const pathname = usePathname();

    return (
        <nav className="flex flex-1 flex-col gap-1 p-3">
            {NAV_ITEMS.map((item) => {
                // startsWith so /projects/[id] still highlights "Projetos" -
                // app-gui's version uses strict equality, which doesn't.
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                            "flex items-center gap-2.5 rounded-md border-l-2 px-3 py-2 text-sm transition-colors",
                            active
                                ? "border-sidebar-primary bg-sidebar-accent font-medium text-sidebar-foreground"
                                : "border-transparent text-sidebar-foreground/60 hover:border-sidebar-border hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                        )}
                    >
                        <Icon className="size-4" aria-hidden />
                        {item.label}
                    </Link>
                );
            })}
        </nav>
    );
}

export function SidebarBrand() {
    return (
        <Link href="/dashboard" className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4">
            <span
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground"
                aria-hidden
            >
                μA
            </span>
            <span className="flex flex-col leading-tight">
                <span className="font-heading font-semibold text-sidebar-foreground">Microalgas</span>
                <span className="gauge-label text-sidebar-foreground/50">Consola de cultivo</span>
            </span>
        </Link>
    );
}

/** Desktop-only fixed sidebar, styled as a dark instrument-panel bezel regardless of theme. */
export function DesktopSidebar() {
    return (
        <aside className="hidden w-60 shrink-0 flex-col bg-sidebar lg:flex">
            <SidebarBrand />
            <SidebarNavItems />
            <div className="border-t border-sidebar-border p-3">
                <ConnectionBadge />
            </div>
        </aside>
    );
}
