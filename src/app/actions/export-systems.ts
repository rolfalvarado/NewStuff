"use server";

import { getAllSystems } from "./get-systems";
import { getServers } from "./get-servers";
import * as XLSX from "xlsx";

export async function exportSystemsToExcel() {
    try {
        const [systems, servers] = await Promise.all([
            getAllSystems(),
            getServers()
        ]);

        // Helper to get server details
        const getServerDetails = (serverName?: string) => {
            if (!serverName) return null;
            return servers.find(s => String(s.nombre_servidor) === String(serverName));
        };

        // Encontrar el máximo de actividades en todos los sistemas (al menos 1 para que aparezca la columna)
        const maxActividades = Math.max(...systems.map(s => s.actividad?.length || 0), 1);

        // Encontrar el máximo de contactos adicionales
        const maxContactosAdicionales = Math.max(...systems.map(s => s.contactos_adicionales?.length || 0), 0);

        // Preparar los datos para el Excel
        const excelData = systems.map(system => {
            const serverInfo = getServerDetails(system.nombre_servidor);

            // Determinar el estado (online/offline)
            const isOnline = system.estado_sitio?.toLowerCase().includes("online") ||
                system.estado_sitio?.toLowerCase().includes("on line");
            const estado = isOnline ? "Online" : "Offline";

            const row: any = {
                "Nombre Empresa": system.nombre_empresa || "",
                "URL Sitio": system.url_sitio || "",
                "Holding": system.holding || "",
                "País": system.pais || "",
                "Giro": system.giro || "",
            };

            for (let i = 0; i < maxActividades; i++) {
                row[`Actividad ${i + 1}`] = system.actividad && system.actividad[i] ? system.actividad[i] : "";
            }

            row["IP Sitio"] = serverInfo?.ip_servidor || system.ip_sitio || "";
            row["Estado"] = system.estado_sitio || estado;
            row["Deshabilitado"] = system.disabled_state ? "Sí" : "No";
            row["Nombre Servidor"] = system.nombre_servidor || "";
            row["Puerto Web"] = system.puerto_web || "";
            row["Usuarios Totales"] = system.usuarios_totales || 0;
            row["Usuarios Contratados"] = system.usuarios_contratados || 0;
            row["Última Conexión"] = (function () {
                const dateStr = system.ultima_conexion;
                if (!dateStr) return "-";
                const simpleDate = dateStr.split('T')[0];
                if (simpleDate.includes('-')) {
                    const parts = simpleDate.split('-');
                    if (parts.length === 3) {
                        const [year, month, day] = parts;
                        return `${day}/${month}/${year.slice(-2)}`;
                    }
                }
                return dateStr;
            })();
            row["Último Backup"] = system.ultimo_backup || "";
            row["Versión Sistema"] = serverInfo?.version_sistema || system.version_sistema || "";
            row["Memoria Sistema"] = system.memoria_sistema || "";
            row["Tipo Instancia"] = serverInfo?.tipo_instancia || system.tipo_instancia || "";
            row["Fecha Renovación"] = system.fecha_renovacion || "";
            row["Nombre Contacto"] = system.nombre_contacto || "";
            row["Cargo Contacto"] = system.cargo_contacto || "";
            row["Teléfono Contacto"] = system.phone_contacto || "";
            row["Email Contacto"] = system.mail_contacto || "";

            // Contactos adicionales
            for (let i = 0; i < maxContactosAdicionales; i++) {
                const contacto = system.contactos_adicionales?.[i];
                row[`Contacto Adic. ${i + 1} Nombre`] = contacto?.nombre || "";
                row[`Contacto Adic. ${i + 1} Cargo`] = contacto?.cargo || "";
                row[`Contacto Adic. ${i + 1} Teléfono`] = contacto?.phone || "";
                row[`Contacto Adic. ${i + 1} Email`] = contacto?.mail || "";
            }

            row["Módulos Activos"] = system.modulos_activos?.join(", ") || "";
            row["Ejecutivo Responsable"] = system.ejecutivo_responsable || "";
            row["Texto Libre"] = system.texto_libre || "";
            row["Hitos"] = system.hitos || "";
            row["Fecha Capacitación"] = system.fecha_capacitacion || "";
            row["Hito Capacitación"] = system.hito_capacitacion || "";

            return row;
        });

        const headers = [
            "Nombre Empresa", "URL Sitio", "Holding", "País", "Giro"
        ];
        for (let i = 1; i <= maxActividades; i++) {
            headers.push(`Actividad ${i}`);
        }
        headers.push(
            "IP Sitio", "Estado",
            "Deshabilitado", "Nombre Servidor", "Puerto Web", "Usuarios Totales", "Usuarios Contratados",
            "Última Conexión", "Último Backup", "Versión Sistema", "Memoria Sistema",
            "Tipo Instancia", "Fecha Renovación", "Nombre Contacto", "Cargo Contacto",
            "Teléfono Contacto", "Email Contacto"
        );
        for (let i = 1; i <= maxContactosAdicionales; i++) {
            headers.push(
                `Contacto Adic. ${i} Nombre`,
                `Contacto Adic. ${i} Cargo`,
                `Contacto Adic. ${i} Teléfono`,
                `Contacto Adic. ${i} Email`
            );
        }
        headers.push(
            "Módulos Activos", "Ejecutivo Responsable",
            "Texto Libre", "Hitos", "Fecha Capacitación", "Hito Capacitación"
        );

        // Crear el libro de trabajo
        const worksheet = XLSX.utils.json_to_sheet(excelData, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Sistemas");

        // Ajustar el ancho de las columnas
        const columnWidths = [
            { wch: 30 }, // Nombre Empresa
            { wch: 35 }, // URL Sitio
            { wch: 20 }, // Holding
            { wch: 20 }, // País
            { wch: 25 }, // Giro
        ];
        for (let i = 0; i < maxActividades; i++) {
            columnWidths.push({ wch: 20 }); // Actividad N
        }
        columnWidths.push(
            { wch: 15 }, // IP Sitio
            { wch: 15 }, // Estado
            { wch: 12 }, // Deshabilitado
            { wch: 20 }, // Nombre Servidor
            { wch: 12 }, // Puerto Web
            { wch: 15 }, // Usuarios Totales
            { wch: 18 }, // Usuarios Contratados
            { wch: 20 }, // Última Conexión
            { wch: 20 }, // Último Backup
            { wch: 15 }, // Versión Sistema
            { wch: 15 }, // Memoria Sistema
            { wch: 15 }, // Tipo Instancia
            { wch: 18 }, // Fecha Renovación
            { wch: 20 }, // Nombre Contacto
            { wch: 20 }, // Cargo Contacto
            { wch: 15 }, // Teléfono Contacto
            { wch: 25 }, // Email Contacto
        );
        for (let i = 0; i < maxContactosAdicionales; i++) {
            columnWidths.push(
                { wch: 20 }, // Contacto Adic. N Nombre
                { wch: 20 }, // Contacto Adic. N Cargo
                { wch: 15 }, // Contacto Adic. N Teléfono
                { wch: 25 }, // Contacto Adic. N Email
            );
        }
        columnWidths.push(
            { wch: 30 }, // Módulos Activos
            { wch: 25 }, // Ejecutivo Responsable
            { wch: 30 }, // Texto Libre
            { wch: 25 }, // Hitos
            { wch: 18 }, // Fecha Capacitación
            { wch: 25 }, // Hito Capacitación
        );
        worksheet['!cols'] = columnWidths;

        // Convertir a buffer
        const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

        // Convertir a base64 para enviar al cliente
        const base64 = excelBuffer.toString('base64');

        return {
            success: true,
            data: base64,
            filename: `sistemas_${new Date().toISOString().split('T')[0]}.xlsx`
        };
    } catch (error) {
        console.error("Error exporting systems to Excel:", error);
        return {
            success: false,
            error: "Error al generar el archivo Excel"
        };
    }
}
