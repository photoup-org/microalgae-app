"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LogLevel } from "@prisma/client";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { ALL_LEVELS, LEVEL_LABEL } from "@/lib/log-levels";

export function IncidentsFilter({ selectedLevels }: { selectedLevels: LogLevel[] }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    function toggleLevel(level: LogLevel) {
        const next = selectedLevels.includes(level)
            ? selectedLevels.filter((l) => l !== level)
            : [...selectedLevels, level];

        const params = new URLSearchParams(searchParams);
        params.set("levels", next.join(","));
        router.push(`${pathname}?${params.toString()}`);
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                    <Filter className="size-4" aria-hidden />
                    Filtrar
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>Filtrar por tipo</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ALL_LEVELS.map((level) => (
                    <DropdownMenuCheckboxItem
                        key={level}
                        checked={selectedLevels.includes(level)}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={() => toggleLevel(level)}
                    >
                        {LEVEL_LABEL[level]}
                    </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
