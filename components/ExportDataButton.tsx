"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { getExperimentExportDataAction } from "@/actions/export";
import { Button } from "@/components/ui/button";

export function ExportDataButton({ experimentId }: { experimentId: string }) {
    const [isExporting, setIsExporting] = useState(false);

    async function handleExport() {
        setIsExporting(true);
        try {
            const result = await getExperimentExportDataAction(experimentId);
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            const { downloadExperimentExcel } = await import("@/lib/export-excel");
            downloadExperimentExcel(result.data!);
            toast.success(
                result.data!.telemetry.length > 0
                    ? "Exportação concluída."
                    : "Exportado, mas sem dados de telemetria no intervalo."
            );
        } catch {
            toast.error("Ocorreu um erro durante a exportação.");
        } finally {
            setIsExporting(false);
        }
    }

    return (
        <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
            {isExporting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
            Exportar para Excel
        </Button>
    );
}
