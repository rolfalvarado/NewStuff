const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

// Configuración básica para entorno local (igual que en tu proyecto)
const client = new DynamoDBClient({
    region: "us-east-1",
    endpoint: "http://localhost:8000",
    credentials: {
        accessKeyId: "dummy",
        secretAccessKey: "dummy",
    },
});

const db = DynamoDBDocumentClient.from(client);
const TABLE_NAME = "Systems";

async function migrate() {
    console.log("Iniciando migración de campos para doble umbral...");

    try {
        // 1. Obtener todos los sistemas
        const scanData = await db.send(new ScanCommand({
            TableName: TABLE_NAME
        }));

        const items = scanData.Items || [];
        console.log(`Encontrados ${items.length} sistemas para actualizar.`);

        // 2. Actualizar cada uno con valores iniciales si no existen
        let updatedCount = 0;
        for (const item of items) {
            await db.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { url_sitio: item.url_sitio },
                UpdateExpression: "SET consecutive_failures = if_not_exists(consecutive_failures, :zero), last_check_timestamp = :now",
                ExpressionAttributeValues: {
                    ":zero": 0,
                    ":now": new Date().toISOString()
                }
            }));
            updatedCount++;
            if (updatedCount % 10 === 0) process.stdout.write(".");
        }

        console.log(`\nMigración completada exitosamente. ${updatedCount} registros procesados.`);

    } catch (error) {
        console.error("Error durante la migración:", error);
    }
}

migrate();
