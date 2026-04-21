"use server";

import { getAllSystems } from "./get-systems";
import * as XLSX from "xlsx";

export async function exportBackupReportToExcel() {
    try {
        const systems = await getAllSystems();

        // Preparar los datos para el Excel
        const excelData = systems.map(system => {
            return {
                "Nombre Empresa": system.nombre_empresa || "",
                "URL Sitio": system.url_sitio || "",
                "Nombre Servidor": system.nombre_servidor || "",
                "Último Backup": system.ultimo_backup || "N/A",
            };
        });

        const headers = [
            "Nombre Empresa",
            "URL Sitio",
            "Nombre Servidor",
            "Último Backup"
        ];

        // Crear el libro de trabajo
        const worksheet = XLSX.utils.json_to_sheet(excelData, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte Backup");

        // Ajustar el ancho de las columnas
        const columnWidths = [
            { wch: 35 }, // Nombre Empresa
            { wch: 45 }, // URL Sitio
            { wch: 25 }, // Nombre Servidor
            { wch: 20 }, // Último Backup
        ];
        worksheet['!cols'] = columnWidths;

        // Convertir a buffer
        const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

        // Convertir a base64 para enviar al cliente
        const base64 = excelBuffer.toString('base64');

        return {
            success: true,
            data: base64,
            filename: `reporte_backup_${new Date().toISOString().split('T')[0]}.xlsx`
        };
    } catch (error) {
        console.error("Error exporting backup report to Excel:", error);
        return {
            success: false,
            error: "Error al generar el archivo Excel"
        };
    }
}
