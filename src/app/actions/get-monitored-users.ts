"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export interface MonitoredUser {
    id: string; // hostname#login
    hostname: string;
    nombres: string;
    ape_paterno: string;
    login: string;
    email: string;
    tipo_ultima_conex: string;
}

export async function getMonitoredUsers(): Promise<MonitoredUser[]> {
    try {
        let items: MonitoredUser[] = [];
        let lastEvaluatedKey = undefined;

        do {
            const command: ScanCommand = new ScanCommand({
                TableName: TABLE_NAMES.MONITORED_USERS,
                ExclusiveStartKey: lastEvaluatedKey,
            });

            const response = await db.send(command);
            if (response.Items) {
                items = items.concat(response.Items as MonitoredUser[]);
            }
            lastEvaluatedKey = response.LastEvaluatedKey;

        } while (lastEvaluatedKey);

        return items;
    } catch (error) {
        console.error("Error fetching monitored users:", error);
        return [];
    }
}
