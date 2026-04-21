"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { GetCommand, DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { validateSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { RecycledItem } from "./get-recycled";

export async function restoreRecycledItem(id: string): Promise<{ success: boolean; error?: string }> {
    const session = await validateSession();
    if (!session) return { success: false, error: "No autorizado" };

    try {
        // 1. Get the recycled item
        const result = await db.send(new GetCommand({
            TableName: TABLE_NAMES.RECYCLEBIN,
            Key: { id },
        }));

        if (!result.Item) {
            return { success: false, error: "Elemento no encontrado en la papelera" };
        }

        const recycledItem = result.Item as RecycledItem;
        const originalData = JSON.parse(recycledItem.original_data);

        // 2. Restore to original table
        const targetTable = recycledItem.type === "system" ? TABLE_NAMES.SYSTEMS : TABLE_NAMES.SERVERS;

        await db.send(new PutCommand({
            TableName: targetTable,
            Item: originalData,
        }));

        // 3. Remove from RecycleBin
        await db.send(new DeleteCommand({
            TableName: TABLE_NAMES.RECYCLEBIN,
            Key: { id },
        }));

        revalidatePath("/reciclaje");
        revalidatePath(recycledItem.type === "system" ? "/sistemas" : "/claves");
        return { success: true };
    } catch (error) {
        console.error("Error restoring recycled item:", error);
        return { success: false, error: `Error al restaurar: ${(error as Error).message}` };
    }
}
