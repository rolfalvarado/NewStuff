"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { isSafePublicUrl } from "@/lib/security";
import { revalidatePath } from "next/cache";

export function extractVersionFromHtml(html: string): string | null {
    if (!html) return null;

    // 1. Look for elements with class "version" (e.g. <span class="version"...>Versión (3.14)</span>)
    const spanRegex = /<[^>]*class=["'][^"']*\bversion\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi;
    let match: RegExpExecArray | null;

    while ((match = spanRegex.exec(html)) !== null) {
        const innerText = match[1].replace(/<[^>]*>/g, "").trim();
        if (!innerText) continue;

        // Matches e.g. "Versión (3.14)" or "(3.14)" or "(3.214)" -> "3.14" / "3.214"
        const parenMatch = innerText.match(/\(([^)]+)\)/);
        if (parenMatch && parenMatch[1].trim()) {
            return parenMatch[1].trim();
        }

        // Matches e.g. "Versión 3.14" or "Versión: 3.14" or "Version 3.14" -> "3.14"
        const verMatch = innerText.match(/Versi[oó]n[:\s]+([0-9a-zA-Z._-]+)/i);
        if (verMatch && verMatch[1].trim()) {
            return verMatch[1].trim();
        }

        // Standalone version pattern like "3.14" or "v3.14"
        const numMatch = innerText.match(/v?[0-9]+(?:\.[0-9a-zA-Z._-]+)+/i);
        if (numMatch && numMatch[0].trim()) {
            return numMatch[0].trim();
        }

        if (innerText.length > 0 && innerText.length < 30) {
            return innerText;
        }
    }

    // 2. Fallback: Search for 'Versión (X.XX)' anywhere in HTML
    const globalParenMatch = html.match(/Versi[oó]n\s*\(([^)]+)\)/i);
    if (globalParenMatch && globalParenMatch[1].trim()) {
        return globalParenMatch[1].trim();
    }

    return null;
}

export async function updateVersionsBatch(systems: { url_sitio: string; nombre_servidor?: string }[]) {
    try {
        const results = await Promise.all(systems.map(async (sys) => {
            try {
                if (!sys.url_sitio || sys.url_sitio === "dynamodb_local_backup") {
                    return { success: false, url: sys.url_sitio, error: "No URL or backup entry" };
                }

                let targetUrl = sys.url_sitio.trim();
                if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
                    targetUrl = `https://${targetUrl}`;
                }

                // SSRF Security Check
                if (!isSafePublicUrl(targetUrl)) {
                    console.warn(`[Security] Blocked potential SSRF attempt for URL: ${targetUrl}`);
                    return { success: false, url: sys.url_sitio, error: "Blocked: Unsafe URL" };
                }

                // Fetch HTML with 10s timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);

                try {
                    const response = await fetch(targetUrl, {
                        signal: controller.signal,
                        cache: "no-store",
                        headers: {
                            "User-Agent": "SiteMonitor/1.0 (Version Checker)",
                            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                        }
                    });
                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        return { success: false, url: sys.url_sitio, error: `Fetch failed: ${response.status}` };
                    }

                    const html = await response.text();
                    const version = extractVersionFromHtml(html);

                    if (!version) {
                        return { success: false, url: sys.url_sitio, error: "Version not found in HTML" };
                    }

                    // Fetch existing system data to check for history changes
                    let currentVersion = "";
                    let versionHistory: { version: string; fecha: string; servidor?: string }[] = [];

                    try {
                        const existingRes = await db.send(new GetCommand({
                            TableName: TABLE_NAMES.SYSTEMS,
                            Key: { url_sitio: sys.url_sitio }
                        }));
                        const currentItem = existingRes.Item;
                        currentVersion = currentItem?.version_sistema || "";
                        versionHistory = Array.isArray(currentItem?.historial_versiones) ? [...currentItem.historial_versiones] : [];

                        // If history is empty and currentVersion exists, seed it
                        if (versionHistory.length === 0 && currentVersion) {
                            versionHistory.push({
                                version: currentVersion,
                                fecha: currentItem?.ultima_conexion || new Date().toISOString(),
                                servidor: currentItem?.nombre_servidor || sys.nombre_servidor || ""
                            });
                        }
                    } catch { /* ignore get error */ }

                    // If version changed (or was empty/unrecorded), record new entry at top
                    if (!currentVersion || currentVersion !== version || versionHistory.length === 0) {
                        versionHistory.unshift({
                            version: version,
                            fecha: new Date().toISOString(),
                            servidor: sys.nombre_servidor || ""
                        });
                    }

                    // 1. Update System in DynamoDB
                    await db.send(new UpdateCommand({
                        TableName: TABLE_NAMES.SYSTEMS,
                        Key: { url_sitio: sys.url_sitio },
                        UpdateExpression: "set version_sistema = :v, historial_versiones = :hv",
                        ExpressionAttributeValues: {
                            ":v": version,
                            ":hv": versionHistory
                        }
                    }));

                    // 2. Update Server in DynamoDB if associated with a server
                    if (sys.nombre_servidor && String(sys.nombre_servidor).trim() !== "") {
                        try {
                            await db.send(new UpdateCommand({
                                TableName: TABLE_NAMES.SERVERS,
                                Key: { nombre_servidor: String(sys.nombre_servidor).trim() },
                                UpdateExpression: "set version_sistema = :v",
                                ExpressionAttributeValues: {
                                    ":v": version
                                }
                            }));
                        } catch (serverErr) {
                            console.error(`[Version Update] Error updating server ${sys.nombre_servidor}:`, serverErr);
                        }
                    }

                    return { success: true, url: sys.url_sitio, version, server: sys.nombre_servidor };

                } catch (fetchError: any) {
                    clearTimeout(timeoutId);
                    if (fetchError.name === "AbortError") {
                        return { success: false, url: sys.url_sitio, error: "Timeout (10s)" };
                    }
                    throw fetchError;
                }

            } catch (innerError) {
                console.error(`Error processing version for ${sys.url_sitio}:`, innerError);
                return { success: false, url: sys.url_sitio, error: String(innerError) };
            }
        }));

        revalidatePath("/sistemas");
        revalidatePath("/claves");
        revalidatePath("/datos");
        revalidatePath("/stuff");

        return { success: true, results };
    } catch (error) {
        console.error("Batch version update failed:", error);
        return { success: false, error: "Batch failed" };
    }
}
