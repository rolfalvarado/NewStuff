"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { isSafePublicUrl } from "@/lib/security";
import { revalidatePath } from "next/cache";

const LOGIN_USER = "soporte";
const LOGIN_PASS = "Beyo5_1**";

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

    // 2. Look for version_Actual in script tags (e.g. version_Actual = "3.93";)
    const vActMatch = html.match(/version_Actual\s*=\s*["']([^"']+)["']/i);
    if (vActMatch && vActMatch[1].trim()) {
        return vActMatch[1].trim();
    }

    // 3. Fallback: Search for 'Versión (X.XX)' anywhere in HTML
    const globalParenMatch = html.match(/Versi[oó]n\s*\(([0-9a-zA-Z._-]+)\)/i);
    if (globalParenMatch && globalParenMatch[1].trim()) {
        return globalParenMatch[1].trim();
    }

    return null;
}

export async function fetchSystemVersion(rawUrl: string, timeoutMs: number = 10000): Promise<string | null> {
    try {
        let targetUrl = rawUrl.trim();
        if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
            targetUrl = `https://${targetUrl}`;
        }

        if (!isSafePublicUrl(targetUrl)) {
            console.warn(`[Security] Blocked potential SSRF attempt for URL: ${targetUrl}`);
            return null;
        }

        const urlObj = new URL(targetUrl);
        const baseUrl = urlObj.origin;
        const actionUrl = `${baseUrl}/4DACTION/W_INICIA_SESION`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            // 1. Attempt login with credentials
            const params = new URLSearchParams();
            params.append("txtUsuario", LOGIN_USER);
            params.append("txtPassword", LOGIN_PASS);
            params.append("fromUrl", "home");
            params.append("enter", "Ingresar");

            const postRes = await fetch(actionUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
                },
                body: params.toString(),
                redirect: "manual",
                signal: controller.signal
            });

            const setCookies: string[] = postRes.headers.getSetCookie 
                ? postRes.headers.getSetCookie() 
                : ([postRes.headers.get("set-cookie")].filter(Boolean) as string[]);
            const cookieHeader = setCookies
                .filter((c): c is string => Boolean(c))
                .map(c => c.split(';')[0])
                .join('; ');
            const location = postRes.headers.get("location") || "/4DACTION/wbienvenidos";

            // 2. Fetch authenticated page with cookie
            const redirectUrl = new URL(location, baseUrl).toString();
            const getRes = await fetch(redirectUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                    ...(cookieHeader ? { "Cookie": cookieHeader } : {})
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (getRes.ok) {
                const html = await getRes.text();
                const version = extractVersionFromHtml(html);
                if (version) return version;
            }

            // Fallback: direct fetch targetUrl if login page already has version
            const directRes = await fetch(targetUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                }
            });
            if (directRes.ok) {
                const directHtml = await directRes.text();
                return extractVersionFromHtml(directHtml);
            }

            return null;
        } catch {
            clearTimeout(timeoutId);
            return null;
        }
    } catch {
        return null;
    }
}

export async function updateVersionsBatch(systems: { url_sitio: string; nombre_servidor?: string }[]) {
    try {
        const results = await Promise.all(systems.map(async (sys) => {
            try {
                if (!sys.url_sitio || sys.url_sitio === "dynamodb_local_backup") {
                    return { success: false, url: sys.url_sitio, error: "No URL or backup entry" };
                }

                // Authenticate and fetch version
                const version = await fetchSystemVersion(sys.url_sitio, 10000);

                if (!version) {
                    // Gracefully skip if cannot login or version not found
                    return { success: false, url: sys.url_sitio, error: "Could not authenticate or find version" };
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
