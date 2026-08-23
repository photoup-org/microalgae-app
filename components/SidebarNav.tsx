"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/components/nav-items";
import { ConnectionBadge } from "@/components/ConnectionBadge";
import { SidebarUserMenu } from "@/components/SidebarUserMenu";

const COLLAPSE_KEY = "sidebar-collapsed";

export function SidebarNavItems({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
    const pathname = usePathname();

    return (
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
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
                        title={collapsed ? item.label : undefined}
                        className={cn(
                            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                            collapsed && "justify-center px-2",
                            active
                                ? "bg-sidebar-primary/10 font-semibold text-sidebar-primary"
                                : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        )}
                    >
                        <Icon className="size-4 shrink-0" aria-hidden />
                        {!collapsed && item.label}
                    </Link>
                );
            })}
        </nav>
    );
}

export function SidebarBrand({ collapsed }: { collapsed?: boolean }) {
    return (
        <Link
            href="/dashboard"
            className={cn(
                "flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4",
                collapsed && "justify-center px-0"
            )}
        >
            <span
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground"
                aria-hidden
            >
                μA
            </span>
            {!collapsed && (
                <span className="flex flex-col leading-tight">
                    <span className="font-heading font-semibold text-sidebar-foreground">Microalgas</span>
                    <span className="gauge-label text-sidebar-foreground/50">Consola de cultivo</span>
                </span>
            )}
        </Link>
    );
}

interface SidebarUser {
    name: string | null;
    email: string;
}

/** Desktop-only fixed sidebar. Tracks the app's own light/dark surface tokens - see the --sidebar-* aliases in globals.css. */
export function DesktopSidebar({ user }: { user: SidebarUser }) {
    const [collapsed, setCollapsed] = useState(false);
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        // Reads localStorage post-mount to avoid an SSR/client markup mismatch -
        // the same tradeoff next-themes (already a dependency here) makes internally.
        try {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
        } catch {
            // Private browsing / storage blocked - default to expanded.
        }
        setHydrated(true);
    }, []);

    function toggle() {
        setCollapsed((cur) => {
            const next = !cur;
            try {
                localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
            } catch {
                // Nothing to persist to - the toggle still works for this session.
            }
            return next;
        });
    }

    return (
        <aside
            className={cn(
                "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex",
                hydrated ? "transition-[width] duration-200" : undefined,
                collapsed ? "w-16" : "w-60"
            )}
        >
            <div className="relative">
                <SidebarBrand collapsed={collapsed} />
                <button
                    onClick={toggle}
                    aria-label={collapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
                    className="absolute top-1/2 -right-3 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground/60 hover:text-sidebar-foreground"
                >
                    {collapsed ? <PanelLeftOpen className="size-3.5" aria-hidden /> : <PanelLeftClose className="size-3.5" aria-hidden />}
                </button>
            </div>
            <SidebarNavItems collapsed={collapsed} />
            <div className="space-y-2 border-t border-sidebar-border p-3">
                <ConnectionBadge collapsed={collapsed} />
                <SidebarUserMenu user={user} collapsed={collapsed} />
            </div>
        </aside>
    );
}
