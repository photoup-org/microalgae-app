"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Waves } from "lucide-react";
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
                            "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                            active
                                ? "bg-secondary font-medium text-secondary-foreground"
                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
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
        <Link href="/dashboard" className="flex items-center gap-2 px-4 py-4 font-medium">
            <Waves className="size-5 text-brand" aria-hidden />
            <span>Microalgas</span>
        </Link>
    );
}

/** Desktop-only fixed sidebar. */
export function DesktopSidebar() {
    return (
        <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface lg:flex">
            <SidebarBrand />
            <SidebarNavItems />
            <div className="border-t border-border p-3">
                <ConnectionBadge />
            </div>
        </aside>
    );
}
