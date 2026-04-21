"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { PutCommand } from "@aws-sdk/lib-dynamodb";

export type GrowthLogType = "new_system" | "user_increase";

export interface GrowthLog {
    id: string; // timestamp-type-empresa
    timestamp: string; // ISO format
    date: string; // dd/mm/yy format for display
    type: GrowthLogType;
    empresa: string;
    url?: string; // For new systems
    valor_anterior?: number; // For user increases
    nuevo_valor?: number; // For user increases
}

export async function logNewSystem(empresa: string, url: string) {
    try {
        const now = new Date();
        const timestamp = now.toISOString();

        // Format date as dd/mm/yy
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = String(now.getFullYear()).slice(-2);
        const dateFormatted = `${day}/${month}/${year}`;

        const log: GrowthLog = {
            id: `${timestamp}-new_system-${empresa}`,
            timestamp,
            date: dateFormatted,
            type: "new_system",
            empresa,
            url,
        };

        await db.send(new PutCommand({
            TableName: TABLE_NAMES.GROWTH_LOGS,
            Item: log
        }));

        console.log(`[Growth Log] New system registered: ${empresa}`);
        return { success: true };
    } catch (error) {
        console.error("[Growth Log] Error logging new system:", error);
        return { success: false, error: String(error) };
    }
}

export async function logUserIncrease(empresa: string, valorAnterior: number, nuevoValor: number) {
    try {
        // Only log if there's an actual increase
        if (nuevoValor <= valorAnterior) {
            return { success: true, skipped: true };
        }

        const now = new Date();
        const timestamp = now.toISOString();

        // Format date as dd/mm/yy
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = String(now.getFullYear()).slice(-2);
        const dateFormatted = `${day}/${month}/${year}`;

        const log: GrowthLog = {
            id: `${timestamp}-user_increase-${empresa}`,
            timestamp,
            date: dateFormatted,
            type: "user_increase",
            empresa,
            valor_anterior: valorAnterior,
            nuevo_valor: nuevoValor,
        };

        await db.send(new PutCommand({
            TableName: TABLE_NAMES.GROWTH_LOGS,
            Item: log
        }));

        console.log(`[Growth Log] User increase registered: ${empresa} (${valorAnterior} -> ${nuevoValor})`);
        return { success: true };
    } catch (error) {
        console.error("[Growth Log] Error logging user increase:", error);
        return { success: false, error: String(error) };
    }
}
