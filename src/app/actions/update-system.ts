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



export async function updateSystemUrl(oldUrlSitio: string, newUrlSitio: string, fields: Record<string, any>) {
    const session = await validateSession();
    if (!session) {
        return { success: false, error: "No autorizado. Inicie sesión." };
    }

    try {
        // Normalize URL
        newUrlSitio = newUrlSitio.trim().replace(/\/+$/, "");

        if (!newUrlSitio) {
            return { success: false, error: "La URL no puede estar vacía." };
        }

        // 1. Get existing item
        const { GetCommand } = await import("@aws-sdk/lib-dynamodb");
        const existing = await db.send(new GetCommand({
            TableName: TABLE_NAMES.SYSTEMS,
            Key: { url_sitio: oldUrlSitio },
        }));

        if (!existing.Item) {
            return { success: false, error: "Sistema no encontrado." };
        }

        const existingItem = existing.Item;
        if (fields.nombre_servidor !== undefined && fields.nombre_servidor !== existingItem.nombre_servidor) {
            let serverHistory = Array.isArray(existingItem.historial_servidores) ? [...existingItem.historial_servidores] : [];
            if (serverHistory.length === 0 && existingItem.nombre_servidor) {
                serverHistory.push({
                    servidor: existingItem.nombre_servidor,
                    fecha: existingItem.ultima_conexion || new Date().toISOString()
                });
            }
            if (fields.nombre_servidor) {
                serverHistory.unshift({
                    servidor: fields.nombre_servidor,
                    fecha: new Date().toISOString()
                });
            }
            fields.historial_servidores = serverHistory;
        }

        if (fields.version_sistema !== undefined && fields.version_sistema !== existingItem.version_sistema) {
            let versionHistory = Array.isArray(existingItem.historial_versiones) ? [...existingItem.historial_versiones] : [];
            if (versionHistory.length === 0 && existingItem.version_sistema) {
                versionHistory.push({
                    version: existingItem.version_sistema,
                    fecha: existingItem.ultima_conexion || new Date().toISOString(),
                    servidor: existingItem.nombre_servidor || ""
                });
            }
            if (fields.version_sistema) {
                versionHistory.unshift({
                    version: fields.version_sistema,
                    fecha: new Date().toISOString(),
                    servidor: fields.nombre_servidor || existingItem.nombre_servidor || ""
                });
            }
            fields.historial_versiones = versionHistory;
        }

        // 2. Create new item with new url_sitio and updated fields
        const { PutCommand, DeleteCommand } = await import("@aws-sdk/lib-dynamodb");
        const newItem = { ...existingItem, ...fields, url_sitio: newUrlSitio };

        await db.send(new PutCommand({
            TableName: TABLE_NAMES.SYSTEMS,
            Item: newItem,
        }));

        // 3. Delete old item
        await db.send(new DeleteCommand({
            TableName: TABLE_NAMES.SYSTEMS,
            Key: { url_sitio: oldUrlSitio },
        }));

        revalidatePath("/sistemas");
        return { success: true };
    } catch (error) {
        console.error(`[Security] Failed update URL attempt by ${session?.email}:`, error);
        return { success: false, error: "Error al actualizar la URL del sistema" };
    }
}


export async function updateSystemFields(url_sitio: string, fields: Record<string, any>) {
    const session = await validateSession();
    if (!session) {
        return { success: false, error: "No autorizado. Inicie sesión." };
    }

    try {
        // Track history if nombre_servidor or version_sistema is modified
        if (fields.nombre_servidor !== undefined || fields.version_sistema !== undefined) {
            try {
                const { GetCommand } = await import("@aws-sdk/lib-dynamodb");
                const existingRes = await db.send(new GetCommand({
                    TableName: TABLE_NAMES.SYSTEMS,
                    Key: { url_sitio }
                }));
                const existingItem = existingRes.Item;

                if (existingItem) {
                    if (fields.nombre_servidor !== undefined && fields.nombre_servidor !== existingItem.nombre_servidor) {
                        let serverHistory = Array.isArray(existingItem.historial_servidores) ? [...existingItem.historial_servidores] : [];
                        if (serverHistory.length === 0 && existingItem.nombre_servidor) {
                            serverHistory.push({
                                servidor: existingItem.nombre_servidor,
                                fecha: existingItem.ultima_conexion || new Date().toISOString()
                            });
                        }
                        if (fields.nombre_servidor) {
                            serverHistory.unshift({
                                servidor: fields.nombre_servidor,
                                fecha: new Date().toISOString()
                            });
                        }
                        fields.historial_servidores = serverHistory;
                    }

                    if (fields.version_sistema !== undefined && fields.version_sistema !== existingItem.version_sistema) {
                        let versionHistory = Array.isArray(existingItem.historial_versiones) ? [...existingItem.historial_versiones] : [];
                        if (versionHistory.length === 0 && existingItem.version_sistema) {
                            versionHistory.push({
                                version: existingItem.version_sistema,
                                fecha: existingItem.ultima_conexion || new Date().toISOString(),
                                servidor: existingItem.nombre_servidor || ""
                            });
                        }
                        if (fields.version_sistema) {
                            versionHistory.unshift({
                                version: fields.version_sistema,
                                fecha: new Date().toISOString(),
                                servidor: fields.nombre_servidor || existingItem.nombre_servidor || ""
                            });
                        }
                        fields.historial_versiones = versionHistory;
                    }
                }
            } catch (err) {
                console.error("Error retrieving existing item for history tracking:", err);
            }
        }

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
