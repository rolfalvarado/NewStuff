"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { revalidatePath } from "next/cache";
import { validateSession } from "@/lib/session";
import { encryptPassword } from "@/lib/crypto";

export interface ImportServerRow {
    nombre_servidor: string;
    ip_servidor?: string;
    user_servidor?: string;
    pass_servidor?: string;
    tipo_instancia?: string;
    version_sistema?: string;
}

export async function bulkImportServers(rows: ImportServerRow[]) {
    const session = await validateSession();
    if (!session) {
        return { success: false, error: "No autorizado. Inicie sesión." };
    }

    try {
        let createdCount = 0;
        let updatedCount = 0;

        for (const row of rows) {
            // Validate required fields
            if (!row.nombre_servidor) {
                continue; // Skip invalid rows
            }

            const nombreServidorStr = String(row.nombre_servidor).trim();

            // 1. Check existence and get current data
            const existingItemResult = await db.send(new GetCommand({
                TableName: TABLE_NAMES.SERVERS,
                Key: { nombre_servidor: nombreServidorStr }
            }));

            let newItem: any = {};

            // Handle password - encriptar con AES
            let encryptedPassword = "";
            const passServidorStr = row.pass_servidor ? String(row.pass_servidor).trim() : "";
            const ipServidorStr = row.ip_servidor ? String(row.ip_servidor).trim() : "";
            const userServidorStr = row.user_servidor ? String(row.user_servidor).trim() : "";
            const tipoInstanciaStr = row.tipo_instancia ? String(row.tipo_instancia).trim() : "";
            const versionSistemaStr = row.version_sistema ? String(row.version_sistema).trim() : "";

            if (passServidorStr !== "") {
                encryptedPassword = encryptPassword(passServidorStr);
            }

            if (existingItemResult.Item) {
                // Update
                newItem = { ...existingItemResult.Item };

                // Update fields if they exist in the row
                if (ipServidorStr) newItem.ip_servidor = ipServidorStr;
                if (userServidorStr) newItem.user_servidor = userServidorStr;
                if (tipoInstanciaStr) newItem.tipo_instancia = tipoInstanciaStr;
                if (versionSistemaStr) newItem.version_sistema = versionSistemaStr;


                // Only update password if provided in Excel
                if (passServidorStr !== "") {
                    newItem.pass_servidor_encrypted = encryptedPassword;
                    // Limpiar campos antiguos si existen
                    delete newItem.pass_servidor;
                    delete newItem.pass_servidor_plain;
                }

                updatedCount++;
            } else {
                // Create
                newItem = {
                    nombre_servidor: nombreServidorStr,
                    is_inactive: false,
                };

                if (ipServidorStr) newItem.ip_servidor = ipServidorStr;
                if (userServidorStr) newItem.user_servidor = userServidorStr;
                if (tipoInstanciaStr) newItem.tipo_instancia = tipoInstanciaStr;
                if (versionSistemaStr) newItem.version_sistema = versionSistemaStr;
                if (encryptedPassword) newItem.pass_servidor_encrypted = encryptedPassword;

                createdCount++;
            }

            // Sanitizar objeto para evitar strings vacíos que DynamoDB rechaza
            Object.keys(newItem).forEach(key => {
                if (newItem[key] === "") {
                    delete newItem[key];
                }
            });

            await db.send(new PutCommand({
                TableName: TABLE_NAMES.SERVERS,
                Item: newItem
            }));
        }

        revalidatePath("/claves");
        return { success: true, created: createdCount, updated: updatedCount };
    } catch (error) {
        console.error("Error importing servers:", error);
        return { success: false, error: "Failed to import servers" };
    }
}

