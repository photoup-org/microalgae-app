import Link from "next/link";
import { Waves } from "lucide-react";
import { MqttConnectionManager } from "@/components/MqttConnectionManager";
import { ConnectionBadge } from "@/components/ConnectionBadge";

export function AppShell({ children }: { children: React.ReactNode }) {
    return (
        <>
            <MqttConnectionManager />
            <header className="border-b border-border bg-surface">
                <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-6">
                    <Link href="/reactors" className="flex items-center gap-2 font-medium">
                        <Waves className="h-5 w-5 text-accent" aria-hidden />
                        <span>Microalgas</span>
                    </Link>
                    <div className="ml-auto flex items-center gap-4">
                        <ConnectionBadge />
                        <a
                            href="/auth/logout"
                            className="text-sm text-muted-foreground hover:text-foreground"
                        >
                            Sair
                        </a>
                    </div>
                </div>
            </header>
            <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
        </>
    );
}
