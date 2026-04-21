"use server";

import { getAllSystems, System } from "./get-systems";
import { getMonitoredUsers, MonitoredUser } from "./get-monitored-users";
import * as XLSX from "xlsx";

function getHostnameFromUrl(url: string): string {
    try {
        // Remove protocol
        let hostname = url.replace(/^https?:\/\//, '');
        // Remove www.
        hostname = hostname.replace(/^www\./, '');
        // Remove path and query
        hostname = hostname.split('/')[0].split('?')[0];
        return hostname.toLowerCase().trim();
    } catch (e) {
        return url.toLowerCase();
    }
}

export async function exportHoldingsToExcel() {
    try {
        const [systems, users] = await Promise.all([
            getAllSystems(),
            getMonitoredUsers()
        ]);

        // Create a map of Cleaned Hostname -> System URL
        // This helps us match User Hostname -> System directly
        const systemUrlByHostname = new Map<string, string>();

        console.log(`[DEBUG] Initial Systems Count: ${systems.length}`);

        systems.forEach(s => {
            if (!s.url_sitio) return;
            const h = getHostnameFromUrl(s.url_sitio);
            systemUrlByHostname.set(h, s.url_sitio);
        });

        // Debug sample
        const debugHosts = Array.from(systemUrlByHostname.keys()).slice(0, 3);
        console.log("[DEBUG] Sample System Hostnames:", debugHosts);

        // Map containing Set of emails per System URL
        const usersBySystemUrl = new Map<string, Set<string>>();

        let matchedCount = 0;
        let unmatchedCount = 0;

        users.forEach(u => {
            if (!u.hostname || !u.email) return;
            const email = u.email.toLowerCase().trim();
            // Filter out unabase.com users
            if (email.endsWith("@unabase.com")) return;

            // Clean user hostname
            const uHost = getHostnameFromUrl(u.hostname);

            // Check if this hostname belongs to a known system
            if (systemUrlByHostname.has(uHost)) {
                const sysUrl = systemUrlByHostname.get(uHost)!;
                if (!usersBySystemUrl.has(sysUrl)) {
                    usersBySystemUrl.set(sysUrl, new Set());
                }
                usersBySystemUrl.get(sysUrl)!.add(email);
                matchedCount++;
            } else {
                unmatchedCount++;
                if (unmatchedCount <= 5) {
                    console.log(`[DEBUG] Unmatched User Hostname: ${u.hostname} (Cleaned: ${uHost})`);
                }
            }
        });

        console.log(`[DEBUG] User Matching Results - Matched: ${matchedCount}, Unmatched: ${unmatchedCount}`);

        // Group systems by Holding
        const holdingMap = new Map<string, System[]>();

        systems.forEach(system => {
            const holdingName = system.holding || "Sin Holding";
            if (!holdingMap.has(holdingName)) {
                holdingMap.set(holdingName, []);
            }
            holdingMap.get(holdingName)!.push(system);
        });

        const reportData: any[] = [];

        // Sort holdings: real holdings alphabetically, "Sin Holding" at the end
        const sortedHoldingNames = Array.from(holdingMap.keys()).sort((a, b) => {
            if (a === "Sin Holding") return 1;
            if (b === "Sin Holding") return -1;
            return a.localeCompare(b);
        });

        // Process each Holding in the sorted order
        for (const holdingName of sortedHoldingNames) {
            const holdingSystems = holdingMap.get(holdingName)!;

            // Sort systems by name for consistent output
            holdingSystems.sort((a, b) => a.nombre_empresa.localeCompare(b.nombre_empresa));

            // Populate system sets for this holding
            const systemUserSets: Set<string>[] = [];
            holdingSystems.forEach(sys => {
                const usersSet = usersBySystemUrl.get(sys.url_sitio) || new Set();
                systemUserSets.push(usersSet);
            });

            // Calculate counts for this holding
            const userOccurrenceCount = new Map<string, number>();
            const isRealHolding = holdingName !== "Sin Holding";

            if (isRealHolding && systemUserSets.length > 0) {
                // Count in how many systems each user appears within this holding
                systemUserSets.forEach(set => {
                    set.forEach(email => {
                        userOccurrenceCount.set(email, (userOccurrenceCount.get(email) || 0) + 1);
                    });
                });
            }

            // Total unique users in the entire holding is the number of keys in the occurrence map
            const totalUniqueUsersInHolding = userOccurrenceCount.size;
            const sortedEmails = Array.from(userOccurrenceCount.keys()).sort();

            // Determine how many rows this holding section needs
            const numRows = isRealHolding
                ? Math.max(holdingSystems.length, sortedEmails.length)
                : holdingSystems.length;

            // Add rows for this holding
            for (let i = 0; i < numRows; i++) {
                const sys = holdingSystems[i];
                const email = sortedEmails[i] || "";

                let uniqueToSystemCount: string | number = "";
                let sharedInSystemCount: string | number = "";

                if (isRealHolding && sys) {
                    const currentSystemSet = usersBySystemUrl.get(sys.url_sitio) || new Set();
                    let uCount = 0;
                    let sCount = 0;

                    currentSystemSet.forEach(e => {
                        const occurrences = userOccurrenceCount.get(e) || 0;
                        if (occurrences === 1) {
                            uCount++;
                        } else if (occurrences > 1) {
                            sCount++;
                        }
                    });
                    uniqueToSystemCount = uCount;
                    sharedInSystemCount = sCount;
                }

                // Logic for Holding column: First row is name, second row is count
                let holdingCell = "";
                if (i === 0) holdingCell = holdingName;
                else if (i === 1 && isRealHolding) holdingCell = totalUniqueUsersInHolding.toString();

                reportData.push({
                    "Holding": holdingCell,
                    "Total Usuarios Únicos (Holding)": isRealHolding ? email : "",
                    "Sistema": sys ? sys.nombre_empresa : "",
                    "Usuarios Totales": sys ? (sys.usuarios_totales || 0) : "",
                    "Usuarios Contratados": sys ? (sys.usuarios_contratados || 0) : "",

                    // Specific to this system
                    "Usuarios Únicos (Sistema)": uniqueToSystemCount,
                    "Usuarios Compartidos (Sistema)": sharedInSystemCount
                });
            }
        }

        // Create Workbook
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(reportData);

        // Auto-width adjustment
        worksheet['!cols'] = [
            { wch: 25 }, // Holding
            { wch: 30 }, // Total Usuarios Únicos (Holding)
            { wch: 30 }, // Sistema
            { wch: 15 }, // Usuarios Totales
            { wch: 15 }, // Usuarios Contratados
            { wch: 25 }, // Usuarios Únicos (Sistema)
            { wch: 25 }  // Usuarios Compartidos (Sistema)
        ];

        // Optional: Merge Holding cells if desired for visual grouping?
        // Let's keep it flat for now as it's better for data manipulation.

        XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte Holdings");

        const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
        const base64 = excelBuffer.toString('base64');

        return {
            success: true,
            data: base64,
            filename: `reporte_holdings_detallado_${new Date().toISOString().split('T')[0]}.xlsx`
        };
    } catch (error) {
        console.error("Error exporting holdings to Excel:", error);
        return {
            success: false,
            error: "Error al generar el archivo Excel de Holdings"
        };
    }
}
