"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { UpdateCommand, BatchWriteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { logUserIncrease } from "./log-growth";

export async function updateUserCountsBatch(systems: { url_sitio: string; nombre_empresa?: string }[]) {
    console.log(`[Batch User Update] Processing ${systems.length} systems...`);
    try {
        const results = await Promise.all(systems.map(async (sys) => {
            try {
                if (!sys.url_sitio) {
                    console.warn(`[Batch User Update] Skipping ${sys.url_sitio} - Missing URL`);
                    return { success: false, url: sys.url_sitio, error: "Missing URL" };
                }

                console.log(`[Batch User Update] Fetching for ${sys.url_sitio}...`);

                // Get current user count before updating
                let previousCount = 0;
                let empresaName = sys.nombre_empresa || "";

                try {
                    const currentData = await db.send(new GetCommand({
                        TableName: TABLE_NAMES.SYSTEMS,
                        Key: { url_sitio: sys.url_sitio }
                    }));

                    if (currentData.Item) {
                        previousCount = currentData.Item.usuarios_totales || 0;
                        empresaName = currentData.Item.nombre_empresa || empresaName;
                    }
                } catch (err) {
                    console.warn(`[Batch User Update] Could not fetch previous count for ${sys.url_sitio}`);
                }

                // 1. Fetch users from external API
                // API expects the base URL (origin) without trailing paths
                let baseUrl = sys.url_sitio;
                try {
                    const urlObj = new URL(sys.url_sitio);
                    baseUrl = urlObj.origin; // Gets e.g., "https://hlprod.unabase.com"
                } catch (e) {
                    console.warn(`[Batch User Update] Invalid URL format ${sys.url_sitio}, using raw value`);
                }

                const apiUrl = `https://lisboa.unabase.com/node/app/users?hostname=${baseUrl}&limit=10000`;

                // Add short timeout to avoid hanging
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);

                let usersArray: any[] = [];
                try {
                    const response = await fetch(apiUrl, { signal: controller.signal, cache: 'no-store' });
                    clearTimeout(timeoutId);

                    if (response.ok) {
                        const jsonResponse = await response.json();
                        // Handle structure { success: true, users: [...] }
                        if (jsonResponse.users && Array.isArray(jsonResponse.users)) {
                            usersArray = jsonResponse.users;
                        } else if (Array.isArray(jsonResponse)) {
                            // Fallback if it ever sends array
                            usersArray = jsonResponse;
                        } else {
                            console.error(`[Batch User Update] Unexpected structure for ${sys.url_sitio}`);
                            return { success: false, url: sys.url_sitio, error: "Invalid data format (no users array)" };
                        }
                    } else {
                        console.error(`[Batch User Update] API Error for ${sys.url_sitio}: ${response.status}`);
                        return { success: false, url: sys.url_sitio, error: `API error: ${response.status}` };
                    }
                } catch (fetchErr) {
                    clearTimeout(timeoutId);
                    console.error(`[Batch User Update] Fetch Error for ${sys.url_sitio}:`, fetchErr);
                    return { success: false, url: sys.url_sitio, error: "Fetch timeout or error" };
                }

                // Deduplicate users by their login to prevent DynamoDB 'Duplicate item keys' error
                const uniqueUsersMap = new Map();
                for (const user of usersArray) {
                    const loginKey = user.login || "unknown";
                    uniqueUsersMap.set(loginKey, user);
                }
                const deduplicatedUsersArray = Array.from(uniqueUsersMap.values());

                // 2. Filter users (exclude @unabase.com)
                const filteredUsers = deduplicatedUsersArray.filter((user: any) => {
                    const email = user.email || "";
                    return !email.toLowerCase().includes("@unabase.com");
                });

                const count = filteredUsers.length;

                // Save individual users to MonitoredUsers table
                // Requirement: "Usuarios" page must show ALL users (including @unabase.com)
                // So we save deduplicatedUsersArray to DB, but use filteredUsers for the system count statistic.
                const usersToSave = deduplicatedUsersArray;
                const saveCount = usersToSave.length;

                if (saveCount > 0) {
                    const chunkSize = 25;
                    for (let i = 0; i < saveCount; i += chunkSize) {
                        const chunk = usersToSave.slice(i, i + chunkSize);
                        const putRequests = chunk.map((u: any) => ({
                            PutRequest: {
                                Item: {
                                    id: `${sys.url_sitio}#${u.login || "unknown"}`,
                                    hostname: sys.url_sitio,
                                    nombres: u.nombres || "-",
                                    ape_paterno: u.ape_paterno || "-",
                                    login: u.login || "-",
                                    email: u.email || "-",
                                    tipo_ultima_conex: u.tipo_ultima_conex || "-"
                                }
                            }
                        }));

                        try {
                            await db.send(new BatchWriteCommand({
                                RequestItems: {
                                    [TABLE_NAMES.MONITORED_USERS]: putRequests
                                }
                            }));
                        } catch (err) {
                            console.error(`[Batch User Update] Failed to write batch for ${sys.url_sitio}`, err);
                        }
                    }
                }

                // 3. Find most recent connection date from filtered users
                let mostRecentDate = "";
                if (filteredUsers.length > 0) {
                    // Parse dates and find the most recent
                    // Format from API: "28-12-2025 06:28:53 WEB"
                    // We need to convert to comparable format
                    const parseDateString = (dateStr: string): Date | null => {
                        if (!dateStr) return null;
                        try {
                            // Extract date part: "28-12-2025 06:28:53 WEB" -> "28-12-2025 06:28:53"
                            const parts = dateStr.split(' ');
                            if (parts.length < 2) return null;

                            const datePart = parts[0]; // "28-12-2025" or "28/12/2025"
                            const timePart = parts[1]; // "06:28:53"

                            let day, month, year;
                            if (datePart.includes('-')) {
                                [day, month, year] = datePart.split('-');
                            } else if (datePart.includes('/')) {
                                [day, month, year] = datePart.split('/');
                            } else {
                                return null;
                            }

                            // Create ISO format: "2025-12-28T06:28:53"
                            const isoString = `${year}-${month}-${day}T${timePart}`;
                            const d = new Date(isoString);

                            if (isNaN(d.getTime())) {
                                console.warn(`[Date Parse Warning] Invalid date created from ${dateStr} -> ${isoString}`);
                                return null;
                            }
                            return d;
                        } catch (e) {
                            console.error(`[Date Parse Error] Failed to parse ${dateStr}`, e);
                            return null;
                        }
                    };

                    let latestDate: Date | null = null;
                    let latestDateString = "";

                    for (const user of filteredUsers) {
                        const dateStr = user.tipo_ultima_conex;
                        if (!dateStr) continue;

                        const parsedDate = parseDateString(dateStr);
                        if (parsedDate && (!latestDate || parsedDate > latestDate)) {
                            latestDate = parsedDate;
                            latestDateString = dateStr;
                        }
                    }

                    // Store as date string (YYYY-MM-DD) for consistent parsing and sorting
                    if (latestDate) {
                        mostRecentDate = latestDate.toISOString().split('T')[0];
                    }
                }

                console.log(`[Batch User Update] ${sys.url_sitio}: ${count} users, last connection: ${mostRecentDate || 'N/A'}`);

                // 4. Update DynamoDB with both count and last connection
                await db.send(new UpdateCommand({
                    TableName: TABLE_NAMES.SYSTEMS,
                    Key: { url_sitio: sys.url_sitio },
                    UpdateExpression: "set usuarios_totales = :c, ultima_conexion = :d",
                    ExpressionAttributeValues: {
                        ":c": count,
                        ":d": mostRecentDate,
                    },
                }));

                // 5. Log user increase if applicable
                if (count > previousCount && empresaName) {
                    await logUserIncrease(empresaName, previousCount, count);
                }

                return { success: true, url: sys.url_sitio, count, lastConnection: mostRecentDate };

            } catch (innerError) {
                console.error(`Error processing user count for ${sys.url_sitio}:`, innerError);
                return { success: false, url: sys.url_sitio, error: String(innerError) };
            }
        }));

        return { success: true, results };
    } catch (error) {
        console.error("Batch user count update failed:", error);
        return { success: false, error: "Batch failed" };
    }
}
