"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { revalidatePath } from "next/cache";
import { validateSession } from "@/lib/session";


export async function updateSystemText(url_sitio: string, text: string) {
    const session = await validateSession();
    if (!session) {
        return { success: false, error: "No autorizado. Inicie sesión." };
    }

    try {
        await db.send(new UpdateCommand({
            TableName: TABLE_NAMES.SYSTEMS,
            Key: { url_sitio },
            UpdateExpression: "set texto_libre = :t",
            ExpressionAttributeValues: {
                ":t": text,
            },
        }));
        revalidatePath("/sistemas");
        return { success: true };
    } catch (error) {
        console.error(`[Security] Failed update text attempt by ${session?.email}:`, error);
        return { success: false, error: "Error al actualizar el texto" };
    }
}



export async function updateSystemFields(url_sitio: string, fields: Record<string, any>) {
    const session = await validateSession();
    if (!session) {
        return { success: false, error: "No autorizado. Inicie sesión." };
    }

    try {
        const updateExpressionParts: string[] = [];
        const expressionAttributeValues: Record<string, any> = {};
        const expressionAttributeNames: Record<string, string> = {};

        Object.keys(fields).forEach((key, index) => {
            // Skip url_sitio if present as it is the key
            if (key === 'url_sitio') return;

            const attrName = `#attr${index}`;
            const attrValue = `:val${index}`;

            updateExpressionParts.push(`${attrName} = ${attrValue}`);
            expressionAttributeNames[attrName] = key;
            expressionAttributeValues[attrValue] = fields[key];
        });

        if (updateExpressionParts.length === 0) return { success: true };

        const result = await db.send(new UpdateCommand({
            TableName: TABLE_NAMES.SYSTEMS,
            Key: { url_sitio },
            UpdateExpression: `set ${updateExpressionParts.join(", ")}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: "ALL_NEW"
        }));
        revalidatePath("/sistemas");
        return { success: true, updatedAttributes: result.Attributes };
    } catch (error) {
        console.error(`[Security] Failed update fields attempt by ${session?.email}:`, error);
        return { success: false, error: "Error al actualizar los campos" };
    }
}
