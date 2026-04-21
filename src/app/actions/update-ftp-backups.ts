"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { getAllSystems } from "./get-systems";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

export async function updateFTPBackupsAction() {
    try {
        console.log("[FTP Backup Update] Starting automated retrieval...");

        // 0. Fetch Global DB Backup from /stuff folder
        let globalBackupDate = "-";
        try {
            const ftpUser = "vespinoza@una.cl";
            const ftpPass = "Soporte_una18";
            const stuffUrl = "ftp://ftp.livedrive.com/stuff/";
            const { stdout } = await execPromise(`curl -u "${ftpUser}:${ftpPass}" "${stuffUrl}"`);

            const lines = stdout.split("\n").filter(l => l.includes("dynamodb_prod_"));
            if (lines.length > 0) {
                // Find the latest one by filename
                let latestFile = "";
                let latestTs = 0;

                for (const line of lines) {
                    const parts = line.split(/\s+/);
                    if (parts.length < 9) continue;
                    const fileName = parts.slice(8).join(" ");
                    // Name format: dynamodb_prod_YYYYMMDD_HHMM.zip
                    const match = fileName.match(/dynamodb_prod_(\d{8})_(\d{4})/);
                    if (match) {
                        const ts = parseInt(match[1] + match[2]);
                        if (ts > latestTs) {
                            latestTs = ts;
                            latestFile = fileName;

                            // Format date for display: dd/mm/aa
                            const y = match[1].substring(2, 4);
                            const m = match[1].substring(4, 6);
                            const d = match[1].substring(6, 8);
                            globalBackupDate = `${d}/${m}/${y}`;
                        }
                    }
                }

                if (globalBackupDate !== "-") {
                    // Update special system entry for global backup
                    await db.send(new UpdateCommand({
                        TableName: TABLE_NAMES.SYSTEMS,
                        Key: { url_sitio: "dynamodb_local_backup" },
                        UpdateExpression: "set ultimo_backup = :b, nombre_empresa = :n, estado_sitio = :s",
                        ExpressionAttributeValues: {
                            ":b": globalBackupDate,
                            ":n": "DynamoDB Local Backup",
                            ":s": "Online"
                        }
                    }));
                }
            }
        } catch (e) {
            console.error("[FTP Backup Update] Error fetching global backup:", e);
        }

        const systems = await getAllSystems();

        // 1. Get current date for FTP path
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');

        // Month abbreviations for matching FTP output (which uses Jan, Feb, Mar...)
        const monthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const currentMonthShort = monthsShort[now.getMonth()];
        const todayMatchStr = `${currentMonthShort} ${day}`; // e.g., "Feb 13"

        // display format dd/mm/aa
        const d = day;
        const m = month;
        const a = String(year).slice(-2);
        const todayDisplayDate = `${d}/${m}/${a}`;

        // 2. Fetch list from FTP
        const ftpUrl = `ftp://ftp.livedrive.com/Backupdiario/${year}/${month}/${day}/`;
        const ftpUser = "vespinoza@una.cl";
        const ftpPass = "Soporte_una18";

        console.log(`[FTP Backup Update] Fetching list from: ${ftpUrl}`);

        let ftpOutput = "";
        try {
            // Using curl to get the directory listing
            const { stdout } = await execPromise(`curl --fail -u "${ftpUser}:${ftpPass}" "${ftpUrl}"`);
            ftpOutput = stdout;
        } catch (curlError: any) {
            console.error("[FTP Backup Update] Curl error:", curlError);
            // If the folder doesn't exist yet (e.g., early morning), we might want to try the previous day or just fail gracefully
            return { success: false, error: "No se pudo conectar al FTP o la carpeta del día aún no existe." };
        }

        const backupLines = ftpOutput.split("\n").filter(line => line.trim() !== "");
        console.log(`[FTP Backup Update] Found ${backupLines.length} files in FTP.`);

        const results = [];
        const detailedMatches = [];

        for (const system of systems) {
            const name = system.nombre_empresa || "";
            const normalizedName = name.replace(/\s+/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

            let bestMatch = null;
            for (const line of backupLines) {
                const parts = line.split(/\s+/);
                if (parts.length < 9) continue;

                const fileName = parts.slice(8).join(" ");
                const normalizedFileName = fileName.replace(/\[.*\]/, "").replace(/\.4BK/i, "").replace(/\s+/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

                // Match by name
                if (normalizedName === normalizedFileName || normalizedFileName.includes(normalizedName) || normalizedName.includes(normalizedFileName)) {
                    const ftpDatePart = parts.slice(5, 8).join(" "); // e.g. "Feb 13 04:30"

                    let displayDate = "";
                    if (ftpDatePart.includes(todayMatchStr)) {
                        displayDate = todayDisplayDate;
                    } else {
                        displayDate = ftpDatePart; // Keep original if not today
                    }

                    // Prefer matches from today
                    if (!bestMatch || ftpDatePart.includes(todayMatchStr)) {
                        bestMatch = {
                            displayDate: displayDate,
                            fileName: fileName
                        };
                    }
                }
            }

            if (bestMatch) {
                detailedMatches.push({
                    systemName: name,
                    fileName: bestMatch.fileName,
                    backupDate: bestMatch.displayDate
                });

                // Only update if it's different to avoid redundant writes
                if (system.ultimo_backup !== bestMatch.displayDate) {
                    await db.send(new UpdateCommand({
                        TableName: TABLE_NAMES.SYSTEMS,
                        Key: { url_sitio: system.url_sitio },
                        UpdateExpression: "set ultimo_backup = :b",
                        ExpressionAttributeValues: {
                            ":b": bestMatch.displayDate
                        }
                    }));
                    results.push({ url: system.url_sitio, backup: bestMatch.displayDate });
                }
            }
        }

        console.log(`[FTP Backup Update] Completed. Updated ${results.length} systems in DB.`);
        return {
            success: true,
            count: results.length,
            matches: detailedMatches,
            globalBackupDate: globalBackupDate
        };

    } catch (error) {
        console.error("[FTP Backup Update] Global Error:", error);
        return { success: false, error: String(error) };
    }
}

export async function getGlobalBackupDateAction() {
    try {
        const result = await db.send(new GetCommand({
            TableName: TABLE_NAMES.SYSTEMS,
            Key: { url_sitio: "dynamodb_local_backup" }
        }));
        return result.Item?.ultimo_backup || "-";
    } catch (error) {
        console.error("Error getting global backup date:", error);
        return "-";
    }
}
