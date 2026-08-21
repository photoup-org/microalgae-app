import { LayoutDashboard, Folder, Cpu, TriangleAlert } from "lucide-react";

export const NAV_ITEMS = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Projetos", href: "/projects", icon: Folder },
    { label: "Dispositivos", href: "/devices", icon: Cpu },
    { label: "Incidentes", href: "/incidents", icon: TriangleAlert },
] as const;
