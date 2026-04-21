"use server";

import { getMonitoringLogs, MonitorLog } from "./get-monitoring-logs";
import * as XLSX from "xlsx";

function formatDuration(start: string, end?: string): string {
    if (!end) return "En curso";

    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const diffMs = endTime - startTime;

    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

function formatDate(isoString: string): string {
    return new Date(isoString).toLocaleString('es-CL', {
        timeZone: 'America/Santiago',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

export async function exportMonitoringToExcel() {
    try {
        const logs = await getMonitoringLogs();

        // Preparar datos para Excel
        // Agrupar y consolidar logs por URL
        const logsByUrl: { [key: string]: MonitorLog[] } = {};
        logs.forEach(log => {
            if (!logsByUrl[log.url_sitio]) {
                logsByUrl[log.url_sitio] = [];
            }
            logsByUrl[log.url_sitio].push(log);
        });

        const consolidatedLogs: MonitorLog[] = [];

        Object.keys(logsByUrl).forEach(url => {
            // Ordenar por fecha ascendente para procesar secuencia
            const urlLogs = logsByUrl[url].sort((a, b) =>
                new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );

            if (urlLogs.length === 0) return;

            let currentLog = { ...urlLogs[0] };

            for (let i = 1; i < urlLogs.length; i++) {
                const nextLog = urlLogs[i];

                // Convertir fechas para comparación
                const currentStart = new Date(currentLog.timestamp).getTime();
                const currentEnd = currentLog.end_timestamp ? new Date(currentLog.end_timestamp).getTime() : Infinity;
                const nextStart = new Date(nextLog.timestamp).getTime();

                // Si el siguiente log empieza antes de que termine el actual 
                // o dentro de un margen de tolerancia (ej. 5 minutos) después de que termine
                const tolerance = 5 * 60 * 1000; // 5 minutos

                if (nextStart <= currentEnd + tolerance) {
                    // Fusionar logs
                    // Si el siguiente sigue abierto, el actual se queda abierto
                    if (!nextLog.end_timestamp) {
                        delete currentLog.end_timestamp;
                    } else if (currentLog.end_timestamp) {
                        // Si ambos tienen fin, extendemos el fin al mayor de los dos
                        const nextEnd = new Date(nextLog.end_timestamp).getTime();
                        if (nextEnd > currentEnd) {
                            currentLog.end_timestamp = nextLog.end_timestamp;
                        }
                    } else {
                        // Caso: currentLog está abierto (sin fin), pero nextLog está cerrado (tiene fin).
                        // Al fusionarlos, el evento consolidado adopta el fin del último segmento.
                        currentLog.end_timestamp = nextLog.end_timestamp;
                    }
                } else {
                    // No hay superposición, guardar el actual e iniciar uno nuevo
                    consolidatedLogs.push(currentLog);
                    currentLog = { ...nextLog };
                }
            }
            // Agregar el último log procesado
            consolidatedLogs.push(currentLog);
        });

        // Ordenar resultado final por fecha descendente (más reciente primero)
        consolidatedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        // Filtrar 'programados' del reporte
        const finalLogs = consolidatedLogs.filter(log => !log.is_scheduled);

        // Preparar datos para Excel
        const excelData = finalLogs.map(log => ({
            "Empresa": log.nombre_empresa || "Desconocido",
            "URL Sitio": log.url_sitio,
            "Fecha Caída": formatDate(log.timestamp),
            "Fecha Recuperación": log.end_timestamp ? formatDate(log.end_timestamp) : "Pendiente",
            "Estado": log.end_timestamp ? "Resuelto" : "Offline",
            "Duración": formatDuration(log.timestamp, log.end_timestamp)
        }));

        const headers = ["Empresa", "URL Sitio", "Fecha Caída", "Fecha Recuperación", "Estado", "Duración"];

        // Crear libro con encabezados incluso si no hay datos
        const worksheet = XLSX.utils.json_to_sheet(excelData, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Historial Caídas");

        // Ajustar anchos
        const columnWidths = [
            { wch: 30 }, // Empresa
            { wch: 35 }, // URL
            { wch: 22 }, // Fecha Caída
            { wch: 22 }, // Fecha Recuperación
            { wch: 12 }, // Estado
            { wch: 15 }, // Duración
        ];
        worksheet['!cols'] = columnWidths;

        // Buffer & Base64
        const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
        const base64 = excelBuffer.toString('base64');

        return {
            success: true,
            data: base64,
            filename: `reporte_monitoreo_${new Date().toISOString().split('T')[0]}.xlsx`
        };

    } catch (error) {
        console.error("Error exporting monitoring logs:", error);
        return {
            success: false,
            error: "Error al generar el reporte de monitoreo"
        };
    }
}
