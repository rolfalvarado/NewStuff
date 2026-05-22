"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { validateSession } from "@/lib/session";

export interface System {
    url_sitio: string;
    nombre_empresa: string;
    disabled_state: boolean;
    usuarios_totales: number;
    ultima_conexion: string;
    ip_sitio: string;
    nombre_servidor: string;
    estado_sitio: string;
    consecutive_failures?: number;
    ultimo_backup: string;
    version_sistema?: string;
    memoria_sistema?: string;
    tipo_instancia?: string;
    usuarios_contratados?: number;
    fecha_renovacion?: string;
    nombre_contacto?: string;
    cargo_contacto?: string;
    phone_contacto?: string;
    mail_contacto?: string;
    contactos_adicionales?: {
        nombre: string;
        cargo: string;
        phone: string;
        mail: string;
    }[];
    texto_libre?: string;
    hitos?: string;
    fecha_capacitacion?: string;
    hito_capacitacion?: string;
    modulos_activos?: string[];
    giro?: string;
    actividad?: string[];
    holding?: string;
    puerto_web?: string;
    ejecutivo_responsable?: string;
}

export interface PaginatedSystemsResult {
    items: System[];
    lastEvaluatedKey?: string;
    total?: number; // Approximate, dynamo doesn't give precise count easily without scan
}

export async function getSystems(
    limit: number = 50,
    startKey?: string
): Promise<PaginatedSystemsResult> {
    try {
        const session = await validateSession();
        // Si no hay sesión, tal vez deberíamos bloquear, pero SystemsList es la página principal autenticada.
        // Dejemos que middleware maneje la auth, pero aquí es bueno ser defensivo.
        if (!session) {
            throw new Error("No autorizado");
        }

        const params: any = {
            TableName: TABLE_NAMES.SYSTEMS,
            Limit: limit,
        };

        if (startKey) {
            try {
                // startKey es base64 encoded JSON
                const keyObj = JSON.parse(Buffer.from(startKey, 'base64').toString());
                params.ExclusiveStartKey = keyObj;
            } catch (e) {
                console.error("Invalid startKey", e);
            }
        }

        const result = await db.send(new ScanCommand(params));

        let nextKey: string | undefined = undefined;
        if (result.LastEvaluatedKey) {
            nextKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
        }

        return {
            items: ((result.Items as System[]) || []).filter(s => s.url_sitio !== "dynamodb_local_backup"),
            lastEvaluatedKey: nextKey,
            total: result.Count // Count solo del scan parcial
        };
    } catch (error) {
        console.error("Error fetching systems:", error);
        return { items: [] };
    }
}

// Función helper para traer TODOS (para reportes o compatibilidad legacy temporal)
// Usar con cuidado
export async function getAllSystems(): Promise<System[]> {
    const session = await validateSession();
    if (!session) return [];

    let items: System[] = [];
    let startKey = undefined;

    do {
        const params: any = {
            TableName: TABLE_NAMES.SYSTEMS,
            ExclusiveStartKey: startKey
        };
        const result = await db.send(new ScanCommand(params));
        if (result.Items) {
            const filtered = (result.Items as System[]).filter(s => s.url_sitio !== "dynamodb_local_backup");
            items = items.concat(filtered);
        }
        startKey = result.LastEvaluatedKey;
    } while (startKey);

    return items;
}
