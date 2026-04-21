"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { validateSession } from "@/lib/session";
import { decryptPassword } from "@/lib/crypto";

export interface Server {
    nombre_servidor: string;
    ip_servidor?: string;
    user_servidor?: string;
    pass_servidor_encrypted?: string; // Contraseña encriptada con AES-256-GCM
    tipo_instancia?: string;
    version_sistema?: string;
    is_inactive?: boolean;
}

// Interfaz para servidor sin contraseña (lo que se envía al cliente)
export interface ServerPublic {
    nombre_servidor: string;
    ip_servidor?: string;
    user_servidor?: string;
    tipo_instancia?: string;
    version_sistema?: string;
    is_inactive?: boolean;
    has_password: boolean; // Indica si tiene contraseña sin revelarla
}

// Obtener servidores SIN contraseñas (seguro para listar)
export async function getServers(): Promise<ServerPublic[]> {
    // Verificar autenticación
    const session = await validateSession();
    if (!session) {
        throw new Error('No autorizado');
    }

    try {
        const command = new ScanCommand({
            TableName: TABLE_NAMES.SERVERS,
            ProjectionExpression: "nombre_servidor, ip_servidor, user_servidor, tipo_instancia, version_sistema, is_inactive, pass_servidor_encrypted"
        });

        const response = await db.send(command);
        const servers = (response.Items || []) as Server[];

        // Mapear a versión pública (sin contraseñas)
        return servers.map(server => ({
            nombre_servidor: String(server.nombre_servidor), // Ensure it's always a string
            ip_servidor: server.ip_servidor,
            user_servidor: server.user_servidor,
            tipo_instancia: server.tipo_instancia,
            version_sistema: server.version_sistema,
            is_inactive: server.is_inactive,
            has_password: !!(server.pass_servidor_encrypted)
        }));
    } catch (error) {
        console.error("Error fetching servers:", error);
        return [];
    }
}

// Obtener contraseña de un servidor específico (requiere autenticación)
export async function getServerPassword(nombre_servidor: string): Promise<{ success: boolean; password?: string; error?: string }> {
    // Verificar autenticación
    const session = await validateSession();
    if (!session) {
        return { success: false, error: 'No autorizado' };
    }

    try {
        const command = new GetCommand({
            TableName: TABLE_NAMES.SERVERS,
            Key: { nombre_servidor: String(nombre_servidor) }, // Ensure it's always a string
            ProjectionExpression: "pass_servidor_encrypted"
        });

        const response = await db.send(command);

        if (!response.Item) {
            return { success: false, error: 'Servidor no encontrado' };
        }

        const encryptedPassword = response.Item.pass_servidor_encrypted;

        if (!encryptedPassword) {
            return { success: true, password: '(Sin contraseña guardada)' };
        }

        // Desencriptar la contraseña
        const decrypted = decryptPassword(encryptedPassword);

        return {
            success: true,
            password: decrypted
        };
    } catch (error) {
        console.error("Error fetching server password:", error);
        return { success: false, error: 'Error al obtener contraseña' };
    }
}

