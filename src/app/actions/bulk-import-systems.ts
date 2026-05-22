"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { revalidatePath } from "next/cache";
import { validateSession } from "@/lib/session";
import { System } from "./get-systems";

export interface ImportSystemRow {
    [key: string]: any;
}

export async function bulkImportSystems(rows: ImportSystemRow[]) {
    const session = await validateSession();
    if (!session) {
        return { success: false, error: "No autorizado. Inicie sesión." };
    }

    try {
        let createdCount = 0;
        let updatedCount = 0;

        for (const row of rows) {
            // Obtener campos clave soportando tanto español como inglés
            const rawUrl = row["URL Sitio"] || row["url_sitio"];
            const rawNombre = row["Nombre Empresa"] || row["nombre_empresa"];

            if (!rawUrl || !rawNombre) {
                continue; // Omitir filas inválidas
            }

            const url_sitio = String(rawUrl).trim().replace(/\/+$/, "");
            const nombre_empresa = String(rawNombre).trim();

            // Extraer actividades ("Actividad 1", "Actividad 2", etc.)
            const actividades: string[] = [];
            Object.keys(row).forEach(key => {
                if (key.startsWith("Actividad ")) {
                    const val = String(row[key]).trim();
                    if (val) {
                        actividades.push(val);
                    }
                }
            });

            // Determinar estado deshabilitado
            const rawDisabled = row["Deshabilitado"] || row["disabled_state"];
            let disabled_state = false;
            if (rawDisabled !== undefined) {
                const disabledStr = String(rawDisabled).toLowerCase().trim();
                disabled_state = disabledStr === "sí" || disabledStr === "si" || disabledStr === "yes" || disabledStr === "true" || rawDisabled === true;
            }

            // Determinar módulos activos
            const rawModulos = row["Módulos Activos"] || row["modulos_activos"];
            let modulos_activos: string[] = [];
            if (rawModulos) {
                if (Array.isArray(rawModulos)) {
                    modulos_activos = rawModulos.map(m => String(m).trim()).filter(Boolean);
                } else {
                    modulos_activos = String(rawModulos)
                        .split(",")
                        .map(m => m.trim())
                        .filter(Boolean);
                }
            }

            // Extraer contactos adicionales ("Contacto Adic. 1 Nombre", "Contacto Adic. 1 Cargo", etc.)
            const contactos_adicionales: { nombre: string; cargo: string; phone: string; mail: string }[] = [];
            const contactoIndices = new Set<number>();
            Object.keys(row).forEach(key => {
                const match = key.match(/^Contacto Adic\. (\d+)/);
                if (match) {
                    contactoIndices.add(parseInt(match[1]));
                }
            });
            const sortedIndices = Array.from(contactoIndices).sort((a, b) => a - b);
            for (const idx of sortedIndices) {
                const nombre = String(row[`Contacto Adic. ${idx} Nombre`] || "").trim();
                const cargo = String(row[`Contacto Adic. ${idx} Cargo`] || "").trim();
                const phone = String(row[`Contacto Adic. ${idx} Teléfono`] || "").trim();
                const mail = String(row[`Contacto Adic. ${idx} Email`] || "").trim();
                // Solo agregar si al menos un campo tiene valor
                if (nombre || cargo || phone || mail) {
                    contactos_adicionales.push({ nombre, cargo, phone, mail });
                }
            }

            // Parser de números seguro
            const parseNum = (val: any) => {
                if (val === undefined || val === null || val === "") return 0;
                const num = Number(val);
                return isNaN(num) ? 0 : num;
            };

            const mappedRow: Partial<System> = {
                url_sitio,
                nombre_empresa,
                holding: row["Holding"] || row["holding"] || "",
                giro: row["Giro"] || row["giro"] || "",
                ip_sitio: row["IP Sitio"] || row["ip_sitio"] || "",
                estado_sitio: row["Estado"] || row["estado_sitio"] || "Offline",
                disabled_state,
                nombre_servidor: row["Nombre Servidor"] || row["nombre_servidor"] || "",
                puerto_web: row["Puerto Web"] || row["puerto_web"] || "",
                usuarios_totales: parseNum(row["Usuarios Totales"] || row["usuarios_totales"]),
                usuarios_contratados: parseNum(row["Usuarios Contratados"] || row["usuarios_contratados"]),
                ultima_conexion: row["Última Conexión"] || row["ultima_conexion"] || "",
                ultimo_backup: row["Último Backup"] || row["ultimo_backup"] || "",
                version_sistema: row["Versión Sistema"] || row["version_sistema"] || "",
                memoria_sistema: row["Memoria Sistema"] || row["memoria_sistema"] || "",
                tipo_instancia: row["Tipo Instancia"] || row["tipo_instancia"] || "",
                fecha_renovacion: row["Fecha Renovación"] || row["fecha_renovacion"] || "",
                nombre_contacto: row["Nombre Contacto"] || row["nombre_contacto"] || "",
                cargo_contacto: row["Cargo Contacto"] || row["cargo_contacto"] || "",
                phone_contacto: row["Teléfono Contacto"] || row["phone_contacto"] || "",
                mail_contacto: row["Email Contacto"] || row["mail_contacto"] || "",
                ejecutivo_responsable: row["Ejecutivo Responsable"] || row["ejecutivo_responsable"] || "",
                texto_libre: row["Texto Libre"] || row["texto_libre"] || "",
                hitos: row["Hitos"] || row["hitos"] || "",
                fecha_capacitacion: row["Fecha Capacitación"] || row["fecha_capacitacion"] || "",
                hito_capacitacion: row["Hito Capacitación"] || row["hito_capacitacion"] || "",
            };

            if (actividades.length > 0) {
                mappedRow.actividad = actividades;
            }
            if (modulos_activos.length > 0 || row["Módulos Activos"] !== undefined || row["modulos_activos"] !== undefined) {
                mappedRow.modulos_activos = modulos_activos;
            }
            if (contactos_adicionales.length > 0) {
                mappedRow.contactos_adicionales = contactos_adicionales;
            }

            // 1. Verificar existencia y traer datos actuales
            const existingItemResult = await db.send(new GetCommand({
                TableName: TABLE_NAMES.SYSTEMS,
                Key: { url_sitio }
            }));

            let newItem: any;

            if (existingItemResult.Item) {
                // Actualizar: Mezclar campos existentes con los del Excel
                newItem = { ...existingItemResult.Item, ...mappedRow };
                updatedCount++;
            } else {
                // Crear: Nuevo item
                newItem = {
                    disabled_state: false,
                    usuarios_totales: 0,
                    estado_sitio: "Offline",
                    modulos_activos: [],
                    usuarios_contratados: 0,
                    ...mappedRow,
                };
                createdCount++;
            }

            await db.send(new PutCommand({
                TableName: TABLE_NAMES.SYSTEMS,
                Item: newItem
            }));
        }

        revalidatePath("/sistemas");
        return { success: true, created: createdCount, updated: updatedCount };
    } catch (error) {
        console.error("Error creating system:", error);
        return { success: false, error: "Failed to import systems" };
    }
}
