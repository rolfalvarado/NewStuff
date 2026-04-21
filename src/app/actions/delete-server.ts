"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { GetCommand, DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { validateSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";

export async function deleteServer(nombre_servidor: string) {
    const session = await validateSession();
    if (!session) {
        return { success: false, error: "No autorizado. Inicie sesión." };
    }

    try {
        // 1. Get the full server data before deleting
        const existing = await db.send(new GetCommand({
            TableName: TABLE_NAMES.SERVERS,
            Key: { nombre_servidor: String(nombre_servidor) },
        }));

        if (!existing.Item) {
            return { success: false, error: "Servidor no encontrado." };
        }

        const serverData = existing.Item;

        // 2. Move to RecycleBin (do NOT store encrypted password in recyclebin display fields)
        await db.send(new PutCommand({
            TableName: TABLE_NAMES.RECYCLEBIN,
            Item: {
                id: randomUUID(),
                type: "server",
                deleted_at: new Date().toISOString(),
                deleted_by: session.email,
                nombre_servidor: serverData.nombre_servidor || "",
                ip_servidor: serverData.ip_servidor || "",
                original_data: JSON.stringify(serverData),
            },
        }));

        // 3. Delete from Servers table
        await db.send(new DeleteCommand({
            TableName: TABLE_NAMES.SERVERS,
            Key: { nombre_servidor: String(nombre_servidor) },
        }));

        revalidatePath("/claves");
        revalidatePath("/reciclaje");
        return { success: true };
    } catch (error) {
        console.error("Error deleting server:", error);
        return { success: false, error: String(error) };
    }
}
