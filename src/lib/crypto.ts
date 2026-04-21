// Utility module for encryption (Server Side Only)

import crypto from "crypto";

// Asegurar que la clave tenga 32 bytes para AES-256
function getKey(): Buffer {
    // Leer variable en runtime para asegurar carga
    const key = process.env.SERVER_ENCRYPTION_KEY;

    if (!key) {
        throw new Error("SERVER_ENCRYPTION_KEY no está definida en las variables de entorno. Verifica .env.local");
    }
    // Usar SHA-256 para derivar una clave de 32 bytes consistentes
    return crypto.createHash("sha256").update(key).digest();
}

/**
 * Encripta una contraseña usando AES-256-GCM
 * El resultado es recuperable usando decryptPassword()
 */
export function encryptPassword(plainPassword: string): string {
    if (!plainPassword) return "";

    const key = getKey();
    const iv = crypto.randomBytes(16); // Vector de inicialización aleatorio

    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

    let encrypted = cipher.update(plainPassword, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // Formato: iv:authTag:encryptedData (todo en hex)
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Desencripta una contraseña encriptada con encryptPassword()
 */
export function decryptPassword(encryptedPassword: string): string {
    if (!encryptedPassword) return "";

    try {
        const parts = encryptedPassword.split(":");
        if (parts.length !== 3) {
            console.error("Invalid encrypted password format");
            return "(Error de formato)";
        }

        const [ivHex, authTagHex, encrypted] = parts;
        const key = getKey();
        const iv = Buffer.from(ivHex, "hex");
        const authTag = Buffer.from(authTagHex, "hex");

        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, "hex", "utf8");
        decrypted += decipher.final("utf8");

        return decrypted;
    } catch (error) {
        console.error("Error decrypting password:", error);
        return "(Error de desencriptación)";
    }
}
