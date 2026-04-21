"use server";

import { getServers } from "./get-servers";
import * as XLSX from "xlsx";

export async function exportServersToExcel() {
    try {
        const servers = await getServers();

        // Preparar los datos para el Excel (sin contraseñas)
        const excelData = servers.map(server => {
            return {
                "nombre_servidor": server.nombre_servidor || "",
                "ip_servidor": server.ip_servidor || "",
                "user_servidor": server.user_servidor || "",
                "tipo_instancia": server.tipo_instancia || "",
                "version_sistema": server.version_sistema || "",
                "pass_servidor": "" // No mostrar contraseñas
            };
        });

        const headers = [
            "nombre_servidor",
            "ip_servidor",
            "user_servidor",
            "tipo_instancia",
            "version_sistema",
            "pass_servidor"
        ];
        const worksheet = XLSX.utils.json_to_sheet(excelData, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Servidores");

        // Ajustar el ancho de las columnas
        const columnWidths = [
            { wch: 25 }, // nombre_servidor
            { wch: 20 }, // ip_servidor
            { wch: 15 }, // user_servidor
            { wch: 15 }, // tipo_instancia
            { wch: 15 }, // version_sistema
            { wch: 15 }, // pass_servidor
        ];
        worksheet['!cols'] = columnWidths;

        // Convertir a buffer
        const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

        // Convertir a base64 para enviar al cliente
        const base64 = excelBuffer.toString('base64');

        return {
            success: true,
            data: base64,
            filename: `servidores_${new Date().toISOString().split('T')[0]}.xlsx`
        };
    } catch (error) {
        console.error("Error exporting servers to Excel:", error);
        return {
            success: false,
            error: "Error al generar el archivo Excel"
        };
    }
}
