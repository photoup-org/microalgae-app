"use client";

import { useTheme } from "next-themes";
import { ChevronsUpDown, Sun, Moon, LogOut } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PushToggle } from "@/components/PushToggle";
import { PairDeviceMenuItem } from "@/components/PairDeviceMenuItem";

interface SidebarUserMenuProps {
    /** `paired` is null where pairing does not apply - see PairDeviceMenuItem. */
    user: { name: string | null; email: string; paired: boolean | null };
    collapsed?: boolean;
}

/** Bottom-of-sidebar identity + settings menu: theme and sign-out live here, not the topbar. */
export function SidebarUserMenu({ user, collapsed }: SidebarUserMenuProps) {
    const { theme, setTheme } = useTheme();
    const initial = (user.name ?? user.email).charAt(0).toUpperCase();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    className="flex w-full items-center gap-2.5 rounded-md p-2 text-left transition-colors hover:bg-sidebar-accent"
                    aria-label="Menu do utilizador"
                >
                    <span
                        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-bold text-sidebar-foreground"
                        aria-hidden
                    >
                        {initial}
                    </span>
                    {!collapsed && (
                        <>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-sidebar-foreground">
                                    {user.name ?? user.email}
                                </span>
                                <span className="block truncate text-xs text-sidebar-foreground/50">{user.email}</span>
                            </span>
                            <ChevronsUpDown className="size-4 shrink-0 text-sidebar-foreground/50" aria-hidden />
                        </>
                    )}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-56">
                <DropdownMenuLabel className="font-normal">
                    <span className="block truncate text-sm font-medium">{user.name ?? user.email}</span>
                    <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                    {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                    {theme === "dark" ? "Modo claro" : "Modo escuro"}
                </DropdownMenuItem>
                <PushToggle />
                {user.paired !== null && <PairDeviceMenuItem paired={user.paired} />}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild variant="destructive">
                    <a href="/auth/logout" className="flex items-center gap-2">
                        <LogOut className="size-4" />
                        Sair
                    </a>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
