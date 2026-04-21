"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export interface MonitorLog {
    url_sitio: string;
    timestamp: string; // Start time
    nombre_empresa?: string;
    type: string;
    status: string;
    end_timestamp?: string; // Recovery time
    is_scheduled?: boolean;
}

export async function getMonitoringLogs(): Promise<MonitorLog[]> {
    try {
        const result = await db.send(new ScanCommand({
            TableName: TABLE_NAMES.LOGS
        }));

        const logs = ((result.Items || []) as MonitorLog[]).filter(
            log => log.url_sitio !== "dynamodb_local_backup"
        );

        // Sort by timestamp descending
        logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        return logs;
    } catch (error) {
        console.error("Error fetching monitoring logs:", error);
        return [];
    }
}

export interface HistoryEntry {
    fecha_caida: string;
    fecha_recuperacion: string;
    estado: string;
    duracion: string;
    is_scheduled: boolean;
    original_timestamp: string; // Key for updates
}

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

export async function getSystemHistory(url: string): Promise<HistoryEntry[]> {
    try {
        const { QueryCommand } = await import("@aws-sdk/lib-dynamodb");

        const result = await db.send(new QueryCommand({
            TableName: TABLE_NAMES.LOGS,
            KeyConditionExpression: "url_sitio = :url",
            ExpressionAttributeValues: { ":url": url }
        }));

        const logs = (result.Items || []) as MonitorLog[];

        // 1. Sort by timestamp ASC for processing
        logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        const consolidatedLogs: MonitorLog[] = [];

        if (logs.length > 0) {
            let currentLog = { ...logs[0] };

            for (let i = 1; i < logs.length; i++) {
                const nextLog = logs[i];

                const currentStart = new Date(currentLog.timestamp).getTime();
                const currentEnd = currentLog.end_timestamp ? new Date(currentLog.end_timestamp).getTime() : Infinity;
                const nextStart = new Date(nextLog.timestamp).getTime();

                const tolerance = 5 * 60 * 1000; // 5 minutos

                if (nextStart <= currentEnd + tolerance) {
                    // Merge logic
                    if (!nextLog.end_timestamp) {
                        delete currentLog.end_timestamp;
                    } else if (currentLog.end_timestamp) {
                        const nextEnd = new Date(nextLog.end_timestamp).getTime();
                        if (nextEnd > currentEnd) {
                            currentLog.end_timestamp = nextLog.end_timestamp;
                        }
                    } else {
                        // Current open, Next closed -> Close current
                        currentLog.end_timestamp = nextLog.end_timestamp;
                    }
                } else {
                    consolidatedLogs.push(currentLog);
                    currentLog = { ...nextLog };
                }
            }
            consolidatedLogs.push(currentLog);
        }

        // 2. Sort by timestamp DESC for display
        consolidatedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        return consolidatedLogs.map(log => ({
            fecha_caida: formatDate(log.timestamp),
            fecha_recuperacion: log.end_timestamp ? formatDate(log.end_timestamp) : "Pendiente",
            estado: log.end_timestamp ? "Resuelto" : "Offline",
            duracion: formatDuration(log.timestamp, log.end_timestamp),
            is_scheduled: !!log.is_scheduled,
            original_timestamp: log.timestamp
        }));

    } catch (error) {
        console.error("Error getting system history:", error);
        return [];
    }
}
