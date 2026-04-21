"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { revalidatePath } from "next/cache";
import { validateSession } from "@/lib/session";

export interface ImportSystemRow {
    nombre_empresa: string;
    url_sitio: string;
    nombre_servidor: string;
    memoria_sistema: string;
    puerto_web?: string;
}

export async function bulkImportSystems(rows: ImportSystemRow[]) {
    const session = await validateSession();
    if (!session) {
        return { success: false, error: "No autorizado. Inicie sesión." };
    }

    try {
        let createdCount = 0;
        let updatedCount = 0;

        for (const row of rows) {
            // Validate required fields
            if (!row.url_sitio || !row.nombre_empresa) {
                continue; // Skip invalid rows
            }

            // 1. Check existence and get current data
            const existingItemResult = await db.send(new GetCommand({
                TableName: TABLE_NAMES.SYSTEMS,
                Key: { url_sitio: row.url_sitio }
            }));

            // Allow newItem to hold any system properties
            let newItem: any = { ...row };

            if (existingItemResult.Item) {
                // Update: Merge existing fields with new Excel fields
                newItem = { ...existingItemResult.Item, ...row };
                updatedCount++;
            } else {
                // Create: New item
                newItem = {
                    ...row,
                    disabled_state: false,
                    usuarios_totales: 0,
                    estado_sitio: "Offline",
                    modulos_activos: [],
                    usuarios_contratados: 0,
                };
                createdCount++;
            }

            await db.send(new PutCommand({
                TableName: TABLE_NAMES.SYSTEMS,
                Item: newItem
            }));
        }

        revalidatePath("/sistemas");
        return { success: true, created: createdCount, updated: updatedCount };
    } catch (error) {
        console.error("Error creating system:", error);
        return { success: false, error: "Failed to import systems" };
    }
}
