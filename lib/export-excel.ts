"use client";

import * as XLSX from "xlsx";
import type { ExperimentExportData } from "@/actions/export";

/**
 * Builds and downloads the workbook. Client-only by construction: XLSX.writeFile
 * feature-detects the browser and handles the Blob/download itself, and this
 * function must never run in a server bundle (the "use client" directive here is
 * enforcement, not just documentation - app-gui's equivalent file lacked one).
 *
 * Ported from app-gui's downloadExcel with one addition (a device-info sheet) and
 * one fix (the filename now carries a date, so repeat exports don't silently
 * overwrite each other in the downloads folder).
 */
export function downloadExperimentExcel(data: ExperimentExportData) {
    const workbook = XLSX.utils.book_new();

    const projectSheet = XLSX.utils.aoa_to_sheet([
        ["Propriedade", "Valor"],
        ["Nome do Projeto", data.project.name],
        ["Descrição", data.project.description || "N/A"],
    ]);
    projectSheet["!cols"] = [{ wch: 20 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(workbook, projectSheet, "Detalhes do Projeto");

    const experimentSheet = XLSX.utils.aoa_to_sheet([
        ["Configuração", "Valor"],
        ["Nome da Experiência", data.experiment.name],
        ["Estado", data.experiment.status],
        ["Data de Início", new Date(data.experiment.startDate).toLocaleString("pt-PT")],
        ["Data de Fim", data.experiment.endDate ? new Date(data.experiment.endDate).toLocaleString("pt-PT") : "N/A"],
    ]);
    experimentSheet["!cols"] = [{ wch: 25 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(workbook, experimentSheet, "Configurações");

    const deviceRows = data.devices.map((d) => ({
        Nome: d.name,
        "Número de Série": d.serialNumber,
        Canais: d.sensors.join(", "),
        Descrição: d.description || "N/A",
    }));
    const deviceSheet = XLSX.utils.json_to_sheet(
        deviceRows.length > 0 ? deviceRows : [{ Aviso: "Nenhum dispositivo." }]
    );
    XLSX.utils.book_append_sheet(workbook, deviceSheet, "Dispositivos");

    // Pivot long-form readings (one row per device/metric/timestamp) into wide
    // rows keyed by dd/MM/yyyy HH:mm:ss, one column per "${Metric} (${serial})".
    // This already handles multiple devices correctly, since the column key
    // includes the serial number.
    const grouped: Record<string, Record<string, string | number>> = {};
    for (const reading of data.telemetry) {
        const date = new Date(reading.timestamp);
        const dateStr =
            [date.getDate(), date.getMonth() + 1, date.getFullYear()].map((n) => String(n).padStart(2, "0")).join("/") +
            " " +
            [date.getHours(), date.getMinutes(), date.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");

        grouped[dateStr] ??= { "Data/Hora": dateStr };
        const metricLabel = reading.metricType.charAt(0).toUpperCase() + reading.metricType.slice(1);
        grouped[dateStr][`${metricLabel} (${reading.deviceId})`] = reading.value;
    }
    const flat = Object.values(grouped);
    const telemetrySheet = XLSX.utils.json_to_sheet(
        flat.length > 0 ? flat : [{ Aviso: "Nenhum dado de telemetria registado." }]
    );
    XLSX.utils.book_append_sheet(workbook, telemetrySheet, "Telemetria");

    const isoDate = new Date().toISOString().slice(0, 10);
    const safeName = data.experiment.name.replace(/[\s/\\?*[\]:]+/g, "_");
    XLSX.writeFile(workbook, `Experiencia_${safeName}_${isoDate}.xlsx`);
}
