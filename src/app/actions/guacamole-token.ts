"use server";

import { validateSession } from "@/lib/session";
import { db, TABLE_NAMES } from "@/lib/db";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { decryptPassword } from "@/lib/crypto";
import crypto from "crypto";

/**
 * Genera un token cifrado para establecer una conexión RDP via Guacamole.
 * 
 * El token contiene los parámetros de conexión (IP, usuario, contraseña)
 * cifrados con AES-256-CBC. guacamole-lite descifra el token al recibirlo
 * y usa esos parámetros para conectarse al servidor via guacd.
 * 
 * Esto evita exponer credenciales RDP en el frontend.
 */

interface GuacamoleTokenResult {
    success: boolean;
    token?: string;
    error?: string;
    serverName?: string;
}

/**
 * Cifra los parámetros de conexión usando AES-256-CBC
 * Compatible con la función de descifrado de guacamole-lite
 */
function encryptToken(connectionParams: object): string {
    const key = process.env.SERVER_ENCRYPTION_KEY;
    if (!key) {
        throw new Error("SERVER_ENCRYPTION_KEY not configured");
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
        "aes-256-cbc",
        Buffer.from(key, "base64").subarray(0, 32),
        iv
    );

    let encrypted = cipher.update(JSON.stringify(connectionParams), "utf8", "base64");
    encrypted += cipher.final("base64");

    // Formato que guacamole-lite espera: iv + data separados con $
    const token = JSON.stringify({
        iv: iv.toString("base64"),
        value: encrypted,
    });

    return Buffer.from(token).toString("base64");
}

export async function generateGuacamoleToken(
    nombre_servidor: string
): Promise<GuacamoleTokenResult> {
    // Verificar autenticación
    const session = await validateSession();
    if (!session) {
        return { success: false, error: "No autorizado" };
    }

    try {
        // Obtener datos completos del servidor (incluyendo credenciales encriptadas)
        const command = new GetCommand({
            TableName: TABLE_NAMES.SERVERS,
            Key: { nombre_servidor: String(nombre_servidor) },
        });

        const response = await db.send(command);

        if (!response.Item) {
            return { success: false, error: "Servidor no encontrado" };
        }

        const server = response.Item;
        const ip = server.ip_servidor;
        const username = server.user_servidor || "Administrator";

        if (!ip) {
            return {
                success: false,
                error: "El servidor no tiene IP configurada",
            };
        }

        // Desencriptar contraseña del servidor
        let password = "";
        if (server.pass_servidor_encrypted) {
            try {
                password = decryptPassword(server.pass_servidor_encrypted);
            } catch {
                return {
                    success: false,
                    error: "Error al desencriptar la contraseña del servidor",
                };
            }
        }

        // Crear los parámetros de conexión para guacamole-lite
        const connectionParams = {
            connection: {
                type: "rdp",
                settings: {
                    hostname: ip,
                    port: "3389",
                    username: username,
                    password: password,
                    // Los demás parámetros (resolución, seguridad, etc.) 
                    // se toman de connectionDefaultSettings en guacamole-ws-server.js
                },
            },
        };

        // Generar token cifrado
        const token = encryptToken(connectionParams);

        return {
            success: true,
            token,
            serverName: nombre_servidor,
        };
    } catch (error) {
        console.error("Error generating Guacamole token:", error);
        return {
            success: false,
            error: "Error interno al generar la conexión",
        };
    }
}
