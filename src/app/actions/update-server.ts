"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { validateSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { encryptPassword } from "@/lib/crypto";

export async function updateServer(nombre_servidor: string, updates: {
    ip_servidor?: string;
    user_servidor?: string;
    pass_servidor?: string; // Nueva contraseña en texto plano que viene del form
    tipo_instancia?: string;
    version_sistema?: string;
    is_inactive?: boolean;
}) {
    const session = await validateSession();
    if (!session) {
        return { success: false, error: "No autorizado. Inicie sesión." };
    }

    try {
        let updateExpression = "SET ";
        const expressionAttributeValues: any = {};
        const expressionAttributeNames: any = {};

        if (updates.is_inactive !== undefined) {
            updateExpression += "#inactive = :inactive, ";
            expressionAttributeNames["#inactive"] = "is_inactive";
            expressionAttributeValues[":inactive"] = updates.is_inactive;
        }

        if (updates.ip_servidor !== undefined) {
            updateExpression += "#ip = :ip, ";
            expressionAttributeNames["#ip"] = "ip_servidor";
            expressionAttributeValues[":ip"] = updates.ip_servidor;
        }

        if (updates.user_servidor !== undefined) {
            updateExpression += "#user = :user, ";
            expressionAttributeNames["#user"] = "user_servidor";
            expressionAttributeValues[":user"] = updates.user_servidor;
        }

        if (updates.tipo_instancia !== undefined) {
            updateExpression += "#tipo = :tipo, ";
            expressionAttributeNames["#tipo"] = "tipo_instancia";
            expressionAttributeValues[":tipo"] = updates.tipo_instancia;
        }

        if (updates.version_sistema !== undefined) {
            updateExpression += "#ver = :ver, ";
            expressionAttributeNames["#ver"] = "version_sistema";
            expressionAttributeValues[":ver"] = updates.version_sistema;
        }


        // Si se envía una contraseña nueva (no vacía), encriptarla con AES
        if (updates.pass_servidor !== undefined && updates.pass_servidor.trim() !== "") {
            const encryptedPassword = encryptPassword(updates.pass_servidor);
            updateExpression += "#pass_enc = :pass_enc, ";
            expressionAttributeNames["#pass_enc"] = "pass_servidor_encrypted";
            expressionAttributeValues[":pass_enc"] = encryptedPassword;
        }

        // Remove trailing comma and space
        updateExpression = updateExpression.slice(0, -2);

        // Si no hay nada que actualizar
        if (Object.keys(expressionAttributeValues).length === 0) {
            return { success: true };
        }

        const command = new UpdateCommand({
            TableName: TABLE_NAMES.SERVERS,
            Key: {
                nombre_servidor: String(nombre_servidor), // Ensure it's always a string
            },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
        });

        await db.send(command);
        revalidatePath("/claves");
        return { success: true };
    } catch (error) {
        console.error("Error updating server:", error);
        return { success: false, error: String(error) };
    }
}

