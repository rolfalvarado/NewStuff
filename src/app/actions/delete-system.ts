"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { GetCommand, DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { validateSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";

export async function deleteSystem(url_sitio: string) {
    const session = await validateSession();
    if (!session) {
        return { success: false, error: "No autorizado. Inicie sesión." };
    }

    try {
        // 1. Get the full system data before deleting
        const existing = await db.send(new GetCommand({
            TableName: TABLE_NAMES.SYSTEMS,
            Key: { url_sitio },
        }));

        if (!existing.Item) {
            return { success: false, error: "Sistema no encontrado." };
        }

        const systemData = existing.Item;

        // 2. Move to RecycleBin
        await db.send(new PutCommand({
            TableName: TABLE_NAMES.RECYCLEBIN,
            Item: {
                id: randomUUID(),
                type: "system",
                deleted_at: new Date().toISOString(),
                deleted_by: session.email,
                nombre_empresa: systemData.nombre_empresa || "",
                url_sitio: systemData.url_sitio || "",
                nombre_servidor: systemData.nombre_servidor || "",
                original_data: JSON.stringify(systemData),
            },
        }));

        // 3. Delete from Systems table
        await db.send(new DeleteCommand({
            TableName: TABLE_NAMES.SYSTEMS,
            Key: { url_sitio },
        }));

        revalidatePath("/sistemas");
        revalidatePath("/reciclaje");
        return { success: true };
    } catch (error) {
        console.error(`[Security] Failed deletion attempt by ${session.email}:`, error);
        return { success: false, error: `Error al eliminar el sistema: ${(error as Error).message}` };
    }
}
