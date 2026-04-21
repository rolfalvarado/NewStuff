"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { validateSession } from "@/lib/session";

export interface RecycledItem {
    id: string;
    type: "system" | "server";
    deleted_at: string;
    deleted_by: string;
    // System fields
    nombre_empresa?: string;
    url_sitio?: string;
    nombre_servidor?: string;  // For system: which server hosted it
    // Server fields
    ip_servidor?: string;
    // Full original data (JSON string)
    original_data: string;
}

export async function getRecycledItems(): Promise<RecycledItem[]> {
    const session = await validateSession();
    if (!session) throw new Error("No autorizado");

    try {
        const result = await db.send(new ScanCommand({
            TableName: TABLE_NAMES.RECYCLEBIN,
        }));

        const items = (result.Items || []) as RecycledItem[];
        // Sort by most recently deleted first
        return items.sort((a, b) =>
            new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime()
        );
    } catch (error) {
        console.error("Error fetching recycled items:", error);
        return [];
    }
}
