"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { validateSession } from "@/lib/session";
import { unstable_noStore as noStore } from "next/cache";

// ---------- Tipos ----------
export interface ChatMessage {
    id: string;
    author: string;
    text: string;
    timestamp: number;
    fileName?: string;      // nombre original del archivo
    fileData?: string;       // base64 del archivo
    fileType?: string;       // MIME type
}

export interface ChatTopic {
    id: string;
    title: string;
    status: "activo" | "resuelto";
    archived: boolean;
    createdAt: number;
    lastMessageAt?: number;
    lastMessageAuthor?: string;
    lastMessageText?: string;
}

// ---------- Helpers ----------
function shortId() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// ---------- Tópicos ----------

/** Obtener todos los tópicos */
export async function getTopics(): Promise<{ success: boolean; topics: ChatTopic[] }> {
    noStore();
    const session = await validateSession();
    if (!session) return { success: false, topics: [] };

    try {
        const result = await db.send(new QueryCommand({
            TableName: TABLE_NAMES.CHAT,
            KeyConditionExpression: "PK = :pk",
            ExpressionAttributeValues: { ":pk": "TOPICS" },
            ScanIndexForward: false // más recientes primero
        }));

        const topics: ChatTopic[] = (result.Items || []).map((item: any) => ({
            id: item.id,
            title: item.title,
            status: item.status || "activo",
            archived: item.archived || false,
            createdAt: item.SK,
            lastMessageAt: item.lastMessageAt,
            lastMessageAuthor: item.lastMessageAuthor,
            lastMessageText: item.lastMessageText,
        }));

        return { success: true, topics };
    } catch (error) {
        console.error("[Chat] Error fetching topics:", error);
        return { success: false, topics: [] };
    }
}

/** Crear un nuevo tópico */
export async function createTopic(title: string): Promise<{ success: boolean; topic?: ChatTopic }> {
    const session = await validateSession();
    if (!session) return { success: false };

    try {
        const id = shortId();
        const now = Date.now();

        const topic: ChatTopic = {
            id,
            title,
            status: "activo",
            archived: false,
            createdAt: now,
        };

        await db.send(new PutCommand({
            TableName: TABLE_NAMES.CHAT,
            Item: {
                PK: "TOPICS",
                SK: now,
                ...topic,
            }
        }));

        return { success: true, topic };
    } catch (error) {
        console.error("[Chat] Error creating topic:", error);
        return { success: false };
    }
}

/** Actualizar estado de un tópico (activo/resuelto, archived) */
export async function updateTopicStatus(
    topicId: string,
    createdAt: number,
    fields: { status?: "activo" | "resuelto"; archived?: boolean }
): Promise<{ success: boolean }> {
    const session = await validateSession();
    if (!session) return { success: false };

    try {
        const parts: string[] = [];
        const values: Record<string, any> = {};

        if (fields.status !== undefined) {
            parts.push("#st = :st");
            values[":st"] = fields.status;
        }
        if (fields.archived !== undefined) {
            parts.push("archived = :ar");
            values[":ar"] = fields.archived;
        }

        if (parts.length === 0) return { success: true };

        const names: Record<string, string> = {};
        if (fields.status !== undefined) names["#st"] = "status";

        await db.send(new UpdateCommand({
            TableName: TABLE_NAMES.CHAT,
            Key: { PK: "TOPICS", SK: createdAt },
            UpdateExpression: `SET ${parts.join(", ")}`,
            ...(Object.keys(names).length > 0 ? { ExpressionAttributeNames: names } : {}),
            ExpressionAttributeValues: values,
        }));

        return { success: true };
    } catch (error) {
        console.error("[Chat] Error updating topic:", error);
        return { success: false };
    }
}

// ---------- Mensajes ----------

/** Obtener mensajes de un tópico */
export async function getMessages(topicId: string): Promise<{ success: boolean; messages: ChatMessage[] }> {
    noStore();
    const session = await validateSession();
    if (!session) return { success: false, messages: [] };

    try {
        const result = await db.send(new QueryCommand({
            TableName: TABLE_NAMES.CHAT,
            KeyConditionExpression: "PK = :pk",
            ExpressionAttributeValues: { ":pk": `TOPIC#${topicId}` },
            ScanIndexForward: true // orden cronológico
        }));

        const messages: ChatMessage[] = (result.Items || []).map((item: any) => ({
            id: item.id,
            author: item.author,
            text: item.text || "",
            timestamp: item.SK,
            fileName: item.fileName,
            fileData: item.fileData,
            fileType: item.fileType,
        }));

        return { success: true, messages };
    } catch (error) {
        console.error("[Chat] Error fetching messages:", error);
        return { success: false, messages: [] };
    }
}

/** Enviar un mensaje de texto */
export async function sendMessage(
    topicId: string,
    topicCreatedAt: number,
    author: string,
    text: string
): Promise<{ success: boolean; message?: ChatMessage }> {
    const session = await validateSession();
    if (!session) return { success: false };

    try {
        const id = shortId();
        const now = Date.now();

        const msg: ChatMessage = { id, author, text, timestamp: now };

        // Guardar mensaje
        await db.send(new PutCommand({
            TableName: TABLE_NAMES.CHAT,
            Item: {
                PK: `TOPIC#${topicId}`,
                SK: now,
                ...msg,
            }
        }));

        // Actualizar último mensaje en el tópico
        await db.send(new UpdateCommand({
            TableName: TABLE_NAMES.CHAT,
            Key: { PK: "TOPICS", SK: topicCreatedAt },
            UpdateExpression: "SET lastMessageAt = :lma, lastMessageAuthor = :lmau, lastMessageText = :lmt",
            ExpressionAttributeValues: {
                ":lma": now,
                ":lmau": author,
                ":lmt": text.length > 80 ? text.substring(0, 80) + "..." : text,
            }
        }));

        return { success: true, message: msg };
    } catch (error) {
        console.error("[Chat] Error sending message:", error);
        return { success: false };
    }
}

/** Enviar un archivo adjunto */
export async function sendFileMessage(
    topicId: string,
    topicCreatedAt: number,
    author: string,
    fileName: string,
    fileData: string,  // base64
    fileType: string
): Promise<{ success: boolean; message?: ChatMessage }> {
    const session = await validateSession();
    if (!session) return { success: false };

    try {
        const id = shortId();
        const now = Date.now();

        const msg: ChatMessage = {
            id,
            author,
            text: "",
            timestamp: now,
            fileName,
            fileData,
            fileType,
        };

        // Guardar mensaje con archivo
        await db.send(new PutCommand({
            TableName: TABLE_NAMES.CHAT,
            Item: {
                PK: `TOPIC#${topicId}`,
                SK: now,
                ...msg,
            }
        }));

        // Actualizar último mensaje en el tópico
        await db.send(new UpdateCommand({
            TableName: TABLE_NAMES.CHAT,
            Key: { PK: "TOPICS", SK: topicCreatedAt },
            UpdateExpression: "SET lastMessageAt = :lma, lastMessageAuthor = :lmau, lastMessageText = :lmt",
            ExpressionAttributeValues: {
                ":lma": now,
                ":lmau": author,
                ":lmt": `📎 ${fileName}`,
            }
        }));

        return { success: true, message: msg };
    } catch (error) {
        console.error("[Chat] Error sending file:", error);
        return { success: false };
    }
}
