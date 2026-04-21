"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { validateSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function renameHolding(oldName: string, newName: string) {
    const session = await validateSession();
    if (!session) return { ok: false, error: "No autorizado" };

    if (!oldName || !newName) return { ok: false, error: "Faltan datos" };

    try {
        // Encontrar todos los sistemas con este holding
        const params = {
            TableName: TABLE_NAMES.SYSTEMS,
            FilterExpression: "holding = :oldName",
            ExpressionAttributeValues: {
                ":oldName": oldName
            }
        };

        let items: any[] = [];
        let startKey: any;
        do {
            const result = await db.send(new ScanCommand({
                ...params,
                ExclusiveStartKey: startKey
            }));
            if (result.Items) {
                items = items.concat(result.Items);
            }
            startKey = result.LastEvaluatedKey;
        } while (startKey);

        if (items.length === 0) return { ok: true, count: 0 };

        // Actualizar cada sistema individualmente (DynamoDB no tiene updateMany nativo por filtro)
        for (const item of items) {
            await db.send(new UpdateCommand({
                TableName: TABLE_NAMES.SYSTEMS,
                Key: { url_sitio: item.url_sitio },
                UpdateExpression: "SET holding = :newName",
                ExpressionAttributeValues: {
                    ":newName": newName
                }
            }));
        }

        revalidatePath("/sistemas");
        return { ok: true, count: items.length };

    } catch (error: any) {
        console.error("Error renaming holding:", error);
        return { ok: false, error: error.message };
    }
}

export async function deleteHolding(name: string) {
    const session = await validateSession();
    if (!session) return { ok: false, error: "No autorizado" };

    if (!name) return { ok: false, error: "Falta el nombre del holding" };

    try {
        const params = {
            TableName: TABLE_NAMES.SYSTEMS,
            FilterExpression: "holding = :name",
            ExpressionAttributeValues: {
                ":name": name
            }
        };

        let items: any[] = [];
        let startKey: any;
        do {
            const result = await db.send(new ScanCommand({
                ...params,
                ExclusiveStartKey: startKey
            }));
            if (result.Items) {
                items = items.concat(result.Items);
            }
            startKey = result.LastEvaluatedKey;
        } while (startKey);

        if (items.length === 0) return { ok: true, count: 0 };

        for (const item of items) {
            await db.send(new UpdateCommand({
                TableName: TABLE_NAMES.SYSTEMS,
                Key: { url_sitio: item.url_sitio },
                UpdateExpression: "REMOVE holding",
            }));
        }

        revalidatePath("/sistemas");
        return { ok: true, count: items.length };

    } catch (error: any) {
        console.error("Error deleting holding:", error);
        return { ok: false, error: error.message };
    }
}
