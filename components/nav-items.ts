import { LayoutDashboard, Folder, Cpu } from "lucide-react";

export const NAV_ITEMS = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Projetos", href: "/projects", icon: Folder },
    { label: "Dispositivos", href: "/devices", icon: Cpu },
] as const;
