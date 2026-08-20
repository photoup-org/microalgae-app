"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SidebarBrand, SidebarNavItems } from "@/components/SidebarNav";

export function MobileNav() {
    const [open, setOpen] = useState(false);

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
                    <Menu />
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
                <SheetHeader className="sr-only">
                    <SheetTitle>Navegação</SheetTitle>
                </SheetHeader>
                <SidebarBrand />
                <SidebarNavItems onNavigate={() => setOpen(false)} />
            </SheetContent>
        </Sheet>
    );
}
