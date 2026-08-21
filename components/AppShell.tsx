import { LogOut } from "lucide-react";
import { MqttConnectionManager } from "@/components/MqttConnectionManager";
import { DesktopSidebar } from "@/components/SidebarNav";
import { MobileNav } from "@/components/MobileNav";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-screen">
            <MqttConnectionManager />
            <DesktopSidebar />
            <div className="flex flex-1 flex-col">
                <header className="recorder-paper flex h-14 items-center gap-3 border-b border-border bg-surface px-4 lg:px-6">
                    <MobileNav />
                    <div className="flex-1" />
                    <Button variant="ghost" size="sm" asChild>
                        <a href="/auth/logout" className="flex items-center gap-1.5">
                            <LogOut className="size-4" aria-hidden />
                            Sair
                        </a>
                    </Button>
                </header>
                <main className="flex-1 p-4 lg:p-6">{children}</main>
            </div>
        </div>
    );
}
