"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { Server } from "./get-servers";
import { validateSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { encryptPassword } from "@/lib/crypto";

export async function createServer(server: Partial<Server> & { pass_servidor?: string }) {
    const session = await validateSession();
    if (!session) {
        return { success: false, error: "No autorizado. Inicie sesión." };
    }

    try {
        // Encriptar password con AES si existe (recuperable de forma segura)
        let encryptedPassword = "";

        if (server.pass_servidor && server.pass_servidor.trim() !== "") {
            encryptedPassword = encryptPassword(server.pass_servidor);
        }

        const command = new PutCommand({
            TableName: TABLE_NAMES.SERVERS,
            Item: {
                nombre_servidor: String(server.nombre_servidor), // Ensure it's always a string
                ip_servidor: server.ip_servidor || "",
                user_servidor: server.user_servidor || "",
                pass_servidor_encrypted: encryptedPassword, // Encriptación AES-256-GCM
                tipo_instancia: server.tipo_instancia || "",
                version_sistema: server.version_sistema || "",
                is_inactive: server.is_inactive ?? false,
            },
        });

        await db.send(command);
        revalidatePath("/claves");
        return { success: true };
    } catch (error) {
        console.error("Error creating server:", error);
        return { success: false, error: String(error) };
    }
}
