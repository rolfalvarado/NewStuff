/**
 * fix-trailing-slashes.mjs
 * Limpia el campo url_sitio de todos los sistemas en DynamoDB
 * que tengan una barra (/) al final de la URL.
 *
 * Como url_sitio es la clave primaria, el proceso por cada item afectado es:
 *   1. Crear un item nuevo con la url corregida (todos los demás campos intactos)
 *   2. Eliminar el item viejo con la url incorrecta
 *
 * Uso: node scripts/fix-trailing-slashes.mjs
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Cargar variables de entorno desde .env.local
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env.local") });

const TABLE_NAME = process.env.DYNAMODB_SYSTEMS_TABLE || "Systems";
const REGION     = process.env.AWS_REGION              || "us-east-1";
const ENDPOINT   = process.env.DYNAMODB_ENDPOINT;       // solo si es local

const client = new DynamoDBClient({
    region: REGION,
    ...(ENDPOINT ? { endpoint: ENDPOINT } : {}),
});
const db = DynamoDBDocumentClient.from(client);

async function main() {
    console.log(`\nConectando a DynamoDB (tabla: ${TABLE_NAME})...\n`);

    // 1. Escanear todos los sistemas
    let allItems = [];
    let lastKey  = undefined;

    do {
        const result = await db.send(new ScanCommand({
            TableName: TABLE_NAME,
            ExclusiveStartKey: lastKey,
        }));
        if (result.Items) allItems = allItems.concat(result.Items);
        lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    console.log(`Total de registros encontrados: ${allItems.length}`);

    // 2. Filtrar los que tienen trailing slash
    const affected = allItems.filter(item =>
        typeof item.url_sitio === "string" && item.url_sitio.endsWith("/")
    );

    if (affected.length === 0) {
        console.log("✅ No se encontraron registros con '/' al final. ¡Todo está limpio!\n");
        return;
    }

    console.log(`\n⚠️  Registros que serán corregidos (${affected.length}):\n`);
    affected.forEach(item => {
        const fixed = item.url_sitio.replace(/\/+$/, "");
        console.log(`  "${item.url_sitio}"  →  "${fixed}"`);
    });

    console.log("\nIniciando corrección...\n");

    let ok = 0, errors = 0;

    for (const item of affected) {
        const oldUrl = item.url_sitio;
        const newUrl = oldUrl.replace(/\/+$/, "");

        try {
            // Crear registro con url corregida (copia exacta, solo cambia url_sitio)
            await db.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: { ...item, url_sitio: newUrl },
            }));

            // Eliminar registro viejo
            await db.send(new DeleteCommand({
                TableName: TABLE_NAME,
                Key: { url_sitio: oldUrl },
            }));

            console.log(`  ✅ Corregido: "${oldUrl}"  →  "${newUrl}"`);
            ok++;
        } catch (err) {
            console.error(`  ❌ Error con "${oldUrl}":`, err.message);
            errors++;
        }
    }

    console.log(`\nResumen: ${ok} corregidos, ${errors} errores.\n`);
}

main().catch(err => {
    console.error("Error inesperado:", err);
    process.exit(1);
});
