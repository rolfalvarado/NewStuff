"use server";

import fs from "fs";
import path from "path";
import { isSafePublicUrl } from "@/lib/security";
import { revalidatePath } from "next/cache";

export async function updateLogosBatch(systems: { url_sitio: string }[]) {
    try {
        const results = await Promise.all(systems.map(async (sys) => {
            try {
                if (!sys.url_sitio) return { success: false, url: sys.url_sitio, error: "No URL" };

                // 0. SSRF Security Check
                if (!isSafePublicUrl(sys.url_sitio)) {
                    console.warn(`[Security] Blocked potential SSRF attempt for URL: ${sys.url_sitio}`);
                    return { success: false, url: sys.url_sitio, error: "Blocked: Unsafe URL" };
                }

                // 1. Construct the download URL securely
                let logoUrl: string;
                let filename: string;

                try {
                    // Use URL object for robust parsing
                    // If url only has domain, new URL might fail if no protocol. Assume protocol exists as per data.
                    const urlObj = new URL(sys.url_sitio);
                    // Remove trailing slash from user input part before appending
                    const baseUrl = sys.url_sitio.replace(/\/$/, "");
                    logoUrl = `${baseUrl}/4DACTION/logo_empresa_web`;

                    // 2. Derive filename independently
                    const slug = urlObj.hostname.replace(/\./g, '_');
                    filename = `${slug}.jpg`;
                } catch (e) {
                    return { success: false, url: sys.url_sitio, error: "Invalid URL format" };
                }

                const savePath = path.join(process.cwd(), "public", "logos", filename);

                // 3. Fetch the image with 10s TIMEOUT
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds timeout

                try {
                    const response = await fetch(logoUrl, {
                        signal: controller.signal,
                        cache: 'no-store'
                    });
                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        return { success: false, url: sys.url_sitio, error: `Fetch failed: ${response.status}` };
                    }

                    const arrayBuffer = await response.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);

                    // 4. Save to disk
                    const dir = path.dirname(savePath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }

                    fs.writeFileSync(savePath, buffer);
                    return { success: true, url: sys.url_sitio, savedAs: filename };

                } catch (fetchError: any) {
                    clearTimeout(timeoutId);
                    if (fetchError.name === 'AbortError') {
                        return { success: false, url: sys.url_sitio, error: "Timeout (10s)" };
                    }
                    throw fetchError;
                }

            } catch (innerError) {
                console.error(`Error processing logo for ${sys.url_sitio}:`, innerError);
                return { success: false, url: sys.url_sitio, error: String(innerError) };
            }
        }));

        // En Next.js < 15 los static assets no requieren revalidatePath per se, pero si el componente Image usa caché, esto ayuda
        // Sin embargo, este action no modifica datos de DB, sino archivos estáticos. 
        // Revalidar el path donde se muestran los logos es buena práctica.
        revalidatePath("/sistemas");

        return { success: true, results };
    } catch (error) {
        console.error("Batch logo update failed:", error);
        return { success: false, error: "Batch failed" };
    }
}
