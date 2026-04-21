import { NextRequest, NextResponse } from "next/server";
import { db, TABLE_NAMES } from "@/lib/db";
import { ScanCommand, UpdateCommand, GetCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { logUserIncrease } from "@/app/actions/log-growth";

const execPromise = promisify(exec);

// Secret key to protect the endpoint - only the cron job should call this
const CRON_SECRET = process.env.CRON_SECRET || "daily-update-secret-key-2026";

interface SystemItem {
    url_sitio: string;
    nombre_empresa?: string;
    usuarios_totales?: number;
    ultimo_backup?: string;
    [key: string]: any;
}

// ============================================================
// PHASE 1: UPDATE LOGOS
// ============================================================
async function updateLogos(systems: SystemItem[]) {
    console.log(`[Daily Update] Phase 1: Updating logos for ${systems.length} systems...`);
    let updated = 0;

    const BATCH_SIZE = 10;
    for (let i = 0; i < systems.length; i += BATCH_SIZE) {
        const batch = systems.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (sys) => {
            try {
                if (!sys.url_sitio || sys.url_sitio === "dynamodb_local_backup") return;

                const urlObj = new URL(sys.url_sitio);
                const baseUrl = sys.url_sitio.replace(/\/$/, "");
                const logoUrl = `${baseUrl}/4DACTION/logo_empresa_web`;
                const slug = urlObj.hostname.replace(/\./g, '_');
                const filename = `${slug}.jpg`;
                const savePath = path.join(process.cwd(), "public", "logos", filename);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);

                try {
                    const response = await fetch(logoUrl, {
                        signal: controller.signal,
                        cache: 'no-store'
                    });
                    clearTimeout(timeoutId);

                    if (response.ok) {
                        const arrayBuffer = await response.arrayBuffer();
                        const buffer = Buffer.from(arrayBuffer);
                        const dir = path.dirname(savePath);
                        if (!fs.existsSync(dir)) {
                            fs.mkdirSync(dir, { recursive: true });
                        }
                        fs.writeFileSync(savePath, buffer);
                        updated++;
                    }
                } catch {
                    clearTimeout(timeoutId);
                }
            } catch { /* skip invalid URLs */ }
        }));
    }

    console.log(`[Daily Update] Logos updated: ${updated}`);
    return updated;
}

// ============================================================
// PHASE 2: UPDATE USER COUNTS
// ============================================================
async function updateUserCounts(systems: SystemItem[]) {
    console.log(`[Daily Update] Phase 2: Updating user counts for ${systems.length} systems...`);
    let updated = 0;

    const BATCH_SIZE = 10;
    for (let i = 0; i < systems.length; i += BATCH_SIZE) {
        const batch = systems.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (sys) => {
            try {
                if (!sys.url_sitio || sys.url_sitio === "dynamodb_local_backup") return;

                // Get current user count
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
                } catch { /* ignore */ }

                // Fetch users from external API
                const apiUrl = `https://lisboa.unabase.com/node/app/users?hostname=${sys.url_sitio}`;
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);

                let usersArray: any[] = [];
                try {
                    const response = await fetch(apiUrl, { signal: controller.signal, cache: 'no-store' });
                    clearTimeout(timeoutId);

                    if (response.ok) {
                        const jsonResponse = await response.json();
                        if (jsonResponse.users && Array.isArray(jsonResponse.users)) {
                            usersArray = jsonResponse.users;
                        } else if (Array.isArray(jsonResponse)) {
                            usersArray = jsonResponse;
                        }
                    }
                } catch {
                    clearTimeout(timeoutId);
                    return;
                }

                // Filter users (exclude @unabase.com)
                const filteredUsers = usersArray.filter((user: any) => {
                    const email = user.email || "";
                    return !email.toLowerCase().includes("@unabase.com");
                });

                const count = filteredUsers.length;

                // Save individual users to MonitoredUsers table
                if (usersArray.length > 0) {
                    const chunkSize = 25;
                    for (let j = 0; j < usersArray.length; j += chunkSize) {
                        const chunk = usersArray.slice(j, j + chunkSize);
                        const putRequests = chunk.map((u: any) => ({
                            PutRequest: {
                                Item: {
                                    id: `${sys.url_sitio}#${u.login}`,
                                    hostname: sys.url_sitio,
                                    nombres: u.nombres || "",
                                    ape_paterno: u.ape_paterno || "",
                                    login: u.login || "",
                                    email: u.email || "",
                                    tipo_ultima_conex: u.tipo_ultima_conex || ""
                                }
                            }
                        }));

                        try {
                            await db.send(new BatchWriteCommand({
                                RequestItems: {
                                    [TABLE_NAMES.MONITORED_USERS]: putRequests
                                }
                            }));
                        } catch { /* ignore batch errors */ }
                    }
                }

                // Find most recent connection date
                let mostRecentDate = "";
                if (filteredUsers.length > 0) {
                    let latestDate: Date | null = null;

                    for (const user of filteredUsers) {
                        const dateStr = user.tipo_ultima_conex;
                        if (!dateStr) continue;

                        try {
                            const parts = dateStr.split(' ');
                            if (parts.length < 2) continue;

                            const datePart = parts[0];
                            const timePart = parts[1];

                            let day, month, year;
                            if (datePart.includes('-')) {
                                [day, month, year] = datePart.split('-');
                            } else if (datePart.includes('/')) {
                                [day, month, year] = datePart.split('/');
                            } else {
                                continue;
                            }

                            const isoString = `${year}-${month}-${day}T${timePart}`;
                            const d = new Date(isoString);
                            if (!isNaN(d.getTime()) && (!latestDate || d > latestDate)) {
                                latestDate = d;
                            }
                        } catch { continue; }
                    }

                    if (latestDate) {
                        mostRecentDate = latestDate.toISOString().split('T')[0];
                    }
                }

                // Update DynamoDB
                await db.send(new UpdateCommand({
                    TableName: TABLE_NAMES.SYSTEMS,
                    Key: { url_sitio: sys.url_sitio },
                    UpdateExpression: "set usuarios_totales = :c, ultima_conexion = :d",
                    ExpressionAttributeValues: {
                        ":c": count,
                        ":d": mostRecentDate,
                    },
                }));

                // Log user increase if applicable
                if (count > previousCount && empresaName) {
                    await logUserIncrease(empresaName, previousCount, count);
                }

                updated++;
            } catch { /* skip errors */ }
        }));
    }

    console.log(`[Daily Update] User counts updated: ${updated}`);
    return updated;
}

// ============================================================
// PHASE 3: UPDATE FTP BACKUPS (same logic as updateFTPBackupsAction)
// ============================================================
async function updateFTPBackups(systems: SystemItem[]) {
    console.log(`[Daily Update] Phase 3: Updating FTP backups...`);

    const ftpUser = "vespinoza@una.cl";
    const ftpPass = "Soporte_una18";

    // 3a. Global DB Backup
    let globalBackupDate = "-";
    try {
        const stuffUrl = "ftp://ftp.livedrive.com/stuff/";
        const { stdout } = await execPromise(`curl -u "${ftpUser}:${ftpPass}" "${stuffUrl}"`);

        const lines = stdout.split("\n").filter((l: string) => l.includes("dynamodb_prod_"));
        let latestTs = 0;

        for (const line of lines) {
            const parts = line.split(/\s+/);
            if (parts.length < 9) continue;
            const fileName = parts.slice(8).join(" ");
            const match = fileName.match(/dynamodb_prod_(\d{8})_(\d{4})/);
            if (match) {
                const ts = parseInt(match[1] + match[2]);
                if (ts > latestTs) {
                    latestTs = ts;
                    const y = match[1].substring(2, 4);
                    const m = match[1].substring(4, 6);
                    const d = match[1].substring(6, 8);
                    globalBackupDate = `${d}/${m}/${y}`;
                }
            }
        }

        if (globalBackupDate !== "-") {
            await db.send(new UpdateCommand({
                TableName: TABLE_NAMES.SYSTEMS,
                Key: { url_sitio: "dynamodb_local_backup" },
                UpdateExpression: "set ultimo_backup = :b, nombre_empresa = :n",
                ExpressionAttributeValues: {
                    ":b": globalBackupDate,
                    ":n": "DynamoDB Local Backup"
                }
            }));
        }
    } catch (e) {
        console.error("[Daily Update] Error fetching global backup:", e);
    }

    // 3b. Per-system backups
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const monthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const currentMonthShort = monthsShort[now.getMonth()];
    const todayMatchStr = `${currentMonthShort} ${day}`;
    const todayDisplayDate = `${day}/${month}/${String(year).slice(-2)}`;

    const ftpUrl = `ftp://ftp.livedrive.com/Backupdiario/${year}/${month}/${day}/`;

    let ftpOutput = "";
    try {
        const { stdout } = await execPromise(`curl --fail -u "${ftpUser}:${ftpPass}" "${ftpUrl}"`);
        ftpOutput = stdout;
    } catch {
        console.error("[Daily Update] Could not access FTP daily folder.");
        return { globalBackupDate, updatedSystems: 0 };
    }

    const backupLines = ftpOutput.split("\n").filter((line: string) => line.trim() !== "");
    let updatedSystems = 0;

    for (const system of systems) {
        if (system.url_sitio === "dynamodb_local_backup") continue;

        const name = system.nombre_empresa || "";
        const normalizedName = name.replace(/\s+/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

        let bestMatch: { displayDate: string; fileName: string } | null = null;
        for (const line of backupLines) {
            const parts = line.split(/\s+/);
            if (parts.length < 9) continue;

            const fileName = parts.slice(8).join(" ");
            const normalizedFileName = fileName.replace(/\[.*\]/, "").replace(/\.4BK/i, "").replace(/\s+/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

            if (normalizedName === normalizedFileName || normalizedFileName.includes(normalizedName) || normalizedName.includes(normalizedFileName)) {
                const ftpDatePart = parts.slice(5, 8).join(" ");
                let displayDate = ftpDatePart.includes(todayMatchStr) ? todayDisplayDate : ftpDatePart;

                if (!bestMatch || ftpDatePart.includes(todayMatchStr)) {
                    bestMatch = { displayDate, fileName };
                }
            }
        }

        if (bestMatch && system.ultimo_backup !== bestMatch.displayDate) {
            await db.send(new UpdateCommand({
                TableName: TABLE_NAMES.SYSTEMS,
                Key: { url_sitio: system.url_sitio },
                UpdateExpression: "set ultimo_backup = :b",
                ExpressionAttributeValues: { ":b": bestMatch.displayDate }
            }));
            updatedSystems++;
        }
    }

    console.log(`[Daily Update] FTP backups updated: ${updatedSystems}`);
    return { globalBackupDate, updatedSystems };
}

// ============================================================
// API ROUTE HANDLER
// ============================================================
export async function GET(request: NextRequest) {
    // Verify secret
    const authHeader = request.headers.get("authorization");
    const urlSecret = request.nextUrl.searchParams.get("secret");
    const providedSecret = authHeader?.replace("Bearer ", "") || urlSecret;

    if (providedSecret !== CRON_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const startTime = Date.now();
    console.log(`[Daily Update] ========== STARTING DAILY UPDATE ==========`);
    console.log(`[Daily Update] Time: ${new Date().toISOString()}`);

    try {
        // Fetch all systems
        let systems: SystemItem[] = [];
        let startKey = undefined;
        do {
            const params: any = {
                TableName: TABLE_NAMES.SYSTEMS,
                ExclusiveStartKey: startKey
            };
            const result = await db.send(new ScanCommand(params));
            if (result.Items) {
                systems = systems.concat(result.Items as SystemItem[]);
            }
            startKey = result.LastEvaluatedKey;
        } while (startKey);

        console.log(`[Daily Update] Found ${systems.length} systems.`);

        // Phase 1: Logos
        const logosUpdated = await updateLogos(systems);

        // Phase 2: User Counts
        const usersUpdated = await updateUserCounts(systems);

        // Phase 3: FTP Backups
        const ftpResult = await updateFTPBackups(systems);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Daily Update] ========== COMPLETED in ${elapsed}s ==========`);

        return NextResponse.json({
            success: true,
            elapsed: `${elapsed}s`,
            logosUpdated,
            usersUpdated,
            ftpBackupsUpdated: ftpResult.updatedSystems,
            globalBackupDate: ftpResult.globalBackupDate,
            totalSystems: systems.length
        });

    } catch (error) {
        console.error("[Daily Update] Fatal error:", error);
        return NextResponse.json({
            success: false,
            error: String(error)
        }, { status: 500 });
    }
}
