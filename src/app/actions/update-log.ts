"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";

export async function toggleLogScheduled(url_sitio: string, timestamp: string, is_scheduled: boolean) {
    try {
        await db.send(new UpdateCommand({
            TableName: TABLE_NAMES.LOGS,
            Key: {
                url_sitio: url_sitio,
                timestamp: timestamp
            },
            UpdateExpression: "set is_scheduled = :s",
            ExpressionAttributeValues: {
                ":s": is_scheduled
            }
        }));
        return { success: true };
    } catch (error) {
        console.error("Error toggling scheduled status:", error);
        return { success: false, error: "Failed to update status" };
    }
}
