"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { GrowthLog } from "./log-growth";
import { validateSession } from "@/lib/session";

export async function getGrowthLogs() {
    const session = await validateSession();
    if (!session) {
        return { success: false, error: "Unauthorized" };
    }

    try {
        const result = await db.send(new ScanCommand({
            TableName: TABLE_NAMES.GROWTH_LOGS,
        }));

        const items = (result.Items as GrowthLog[]) || [];

        // Sort by timestamp descending (newest first)
        items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        return { success: true, data: items };
    } catch (error) {
        console.error("Error fetching growth logs:", error);
        return { success: false, error: "Failed to fetch logs" };
    }
}
