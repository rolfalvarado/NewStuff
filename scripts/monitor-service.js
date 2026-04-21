const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, PutCommand, QueryCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const https = require('https');
const http = require('http');

// Configuración
const CHECK_INTERVAL_MS = 300 * 1000; // 5 minutos
const HEAD_TIMEOUT_MS = 10000; // 10s
const GET_TIMEOUT_MS = 15000; // 15s

// Configuración Telegram
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8794524168:AAGpUUQ9g1KiaHLcS4cHq4xw04Gevjh1YjY';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-5295316342'; // Grupo: Monitor

async function enviarAlertaTelegram(mensaje) {
    if (!TELEGRAM_CHAT_ID || TELEGRAM_CHAT_ID === 'AQUI_PON_EL_ID_DEL_GRUPO') {
        console.log('No hay Chat ID configurado para Telegram. Saltando notificación.');
        return;
    }
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: mensaje,
                parse_mode: 'Markdown'
            }),
        });
    } catch (error) {
        console.error('Error enviando alerta a Telegram:', error);
    }
}

const TABLE_NAMES = {
    SYSTEMS: "Systems",
    LOGS: "MonitorLogs"
};

// Cliente DynamoDB (Local o Prod)
// Nota: En producción (EC2), usamos role-based access o variables de entorno.
// En local, usamos localhost:8000.
const isProduction = process.env.NODE_ENV === "production";
const dbConfig = {
    region: process.env.AWS_REGION || "us-east-1",
    endpoint: process.env.DYNAMODB_ENDPOINT || "http://127.0.0.1:8000",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "local",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "local",
    },
};

const client = new DynamoDBClient(dbConfig);
const db = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: true,
    },
});

// Función auxiliar para fetch estilo Node.js (sin dependencia node-fetch si es posible, o usar global fetch en Node 18+)
// Como Node 18+ tiene fetch nativo, usaremos fetch global. Si falla, fallback a https/http.

async function checkUrl(url, method, timeout, range = null) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    // Ensure protocol
    let fetchUrl = url;
    if (!fetchUrl.startsWith('http://') && !fetchUrl.startsWith('https://')) {
        fetchUrl = `https://${url}`;
    }

    const headers = {
        'User-Agent': 'SiteMonitor/1.0 (Health Check Service)',
        'Accept': '*/*',
        'Connection': 'close'
    };

    if (range) {
        headers['Range'] = range;
    }

    try {
        const response = await fetch(fetchUrl, {
            method: method,
            signal: controller.signal,
            headers: headers
        });
        clearTimeout(id);
        return response.status;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

async function runMonitorCycle() {
    console.log(`[${new Date().toISOString()}] Starting Monitor Cycle...`);

    try {
        // 1. Fetch all systems
        const result = await db.send(new ScanCommand({
            TableName: TABLE_NAMES.SYSTEMS,
            ProjectionExpression: "url_sitio, consecutive_failures, estado_sitio, nombre_empresa, disabled_state, nombre_servidor"
        }));

        const systems = result.Items || [];
        console.log(`Checking ${systems.length} systems...`);

        // Process in chunks to avoid resource exhaustion
        const CHUNK_SIZE = 20;

        for (let i = 0; i < systems.length; i += CHUNK_SIZE) {
            const chunk = systems.slice(i, i + CHUNK_SIZE);

            await Promise.all(chunk.map(async (sys) => {
                const url = sys.url_sitio;
                if (!url || url === "dynamodb_local_backup") return;

                // Removed skip for disabled systems
                // if (sys.estado_disabled) return;

                const currentFailures = sys.consecutive_failures || 0;
                let newFailures = 0;
                let finalStatus = 'Online';
                let httpCode = 0;
                let success = false;

                try {
                    // INTENTO 1: HEAD
                    try {
                        httpCode = await checkUrl(url, 'HEAD', HEAD_TIMEOUT_MS);
                        if (httpCode >= 200 && httpCode < 500) {
                            success = true;
                        } else {
                            throw new Error(`HEAD failed: ${httpCode}`);
                        }
                    } catch (headErr) {
                        // INTENTO 2: GET (Retry)
                        // console.log(`HEAD failed for ${url}, retrying GET...`);
                        httpCode = await checkUrl(url, 'GET', GET_TIMEOUT_MS, 'bytes=0-512');
                        if (httpCode >= 200 && httpCode < 500) {
                            success = true;
                        } else {
                            throw new Error(`GET failed: ${httpCode}`);
                        }
                    }
                } catch (err) {
                    success = false;
                }

                if (success) {
                    newFailures = 0;
                    finalStatus = 'Online';
                } else {
                    newFailures = currentFailures + 1;
                    // Lógica de 3 fallos consecutivos
                    if (newFailures >= 3) {
                        finalStatus = 'Offline';
                        // Keep failure count bounded to avoid overflow issues conceptually, though JS numbers are huge.
                        // But strictly we just need to know it's >= 3.
                    } else {
                        // If not yet 3 failures, keep 'Online' if it was Online, or keep 'Offline' if it was Offline?
                        // Usually: if (prev==Online) -> wait for 3 failures to flip to Offline.
                        //          if (prev==Offline) -> needs 1 success to flip to Online.
                        // Here: finalStatus = sys.estado_sitio || 'Online'; means we maintain status until threshold.
                        finalStatus = sys.estado_sitio || 'Online';
                    }
                }

                // Update DB logic
                const previousStatus = sys.estado_sitio || 'Online';
                const isActive = !sys.disabled_state;

                // --- LOGIC FOR ALERTS ---

                // 1. Standard Outage (Active System goes Offline)
                if (isActive && previousStatus === 'Online' && finalStatus === 'Offline') {
                    console.log(`[OUTAGE DETECTED] ${url}`);
                    enviarAlertaTelegram(`🚨 *ALERTA DE CAÍDA* 🚨\n\nEl sistema *${sys.nombre_empresa || 'Desconocido'}* (${url}) acaba de caerse.\nCódigo HTTP: ${httpCode || 'Timeout/Error'}`);
                    await db.send(new PutCommand({
                        TableName: TABLE_NAMES.LOGS,
                        Item: {
                            url_sitio: url,
                            timestamp: new Date().toISOString(),
                            nombre_empresa: sys.nombre_empresa || 'Desconocido',
                            type: 'OUTAGE',
                            status: 'ONGOING'
                        }
                    }));
                }

                // 2. Unexpected Online (Inactive System goes Online)
                // "el aviso debe de ser si pasa de offline a online, ya que son sistemas que deben de estar abajo"
                if (!isActive && previousStatus === 'Offline' && finalStatus === 'Online') {
                    console.log(`[UNEXPECTED ONLINE] ${url}`);
                    enviarAlertaTelegram(`⚠️ *ENCENDIDO INESPERADO* ⚠️\n\nEl sistema en desuso *${sys.nombre_empresa || 'Desconocido'}* (${url}) acaba de reportar que está Online otra vez.`);
                    await db.send(new PutCommand({
                        TableName: TABLE_NAMES.LOGS,
                        Item: {
                            url_sitio: url,
                            timestamp: new Date().toISOString(),
                            nombre_empresa: sys.nombre_empresa || 'Desconocido',
                            type: 'UNEXPECTED_ONLINE', // Distinct type, or reuse OUTAGE? reusing OUTAGE ensures it shows in history.
                            status: 'ONGOING'
                        }
                    }));
                }

                // 3. Resolve Standard Outage (Active System back Online)
                if (isActive && previousStatus === 'Offline' && finalStatus === 'Online') {
                    console.log(`[OUTAGE RESOLVED] ${url}`);
                    enviarAlertaTelegram(`✅ *SISTEMA RECUPERADO* ✅\n\nEl sistema *${sys.nombre_empresa || 'Desconocido'}* (${url}) vuelve a estar en línea.`);
                    try {
                        const openLogs = await db.send(new QueryCommand({
                            TableName: TABLE_NAMES.LOGS,
                            KeyConditionExpression: "url_sitio = :url",
                            ExpressionAttributeValues: { ":url": url },
                            ScanIndexForward: false,
                            Limit: 1
                        }));

                        if (openLogs.Items && openLogs.Items.length > 0) {
                            const lastLog = openLogs.Items[0];
                            if (lastLog.status === 'ONGOING' && lastLog.type === 'OUTAGE') {
                                await db.send(new UpdateCommand({
                                    TableName: TABLE_NAMES.LOGS,
                                    Key: { url_sitio: url, timestamp: lastLog.timestamp },
                                    UpdateExpression: "SET #st = :resolved, end_timestamp = :now",
                                    ExpressionAttributeNames: { "#st": "status" },
                                    ExpressionAttributeValues: {
                                        ":resolved": "RESOLVED",
                                        ":now": new Date().toISOString()
                                    }
                                }));
                            }
                        }
                    } catch (e) { console.error("Error resolving log", e); }
                }

                // 4. Resolve Unexpected Online (Inactive System goes Offline again - "Fixed")
                if (!isActive && previousStatus === 'Online' && finalStatus === 'Offline') {
                    console.log(`[UNEXPECTED ONLINE RESOLVED] ${url}`);
                    try {
                        const openLogs = await db.send(new QueryCommand({
                            TableName: TABLE_NAMES.LOGS,
                            KeyConditionExpression: "url_sitio = :url",
                            ExpressionAttributeValues: { ":url": url },
                            ScanIndexForward: false,
                            Limit: 1
                        }));

                        if (openLogs.Items && openLogs.Items.length > 0) {
                            const lastLog = openLogs.Items[0];
                            if (lastLog.status === 'ONGOING' && (lastLog.type === 'UNEXPECTED_ONLINE')) {
                                await db.send(new UpdateCommand({
                                    TableName: TABLE_NAMES.LOGS,
                                    Key: { url_sitio: url, timestamp: lastLog.timestamp },
                                    UpdateExpression: "SET #st = :resolved, end_timestamp = :now",
                                    ExpressionAttributeNames: { "#st": "status" },
                                    ExpressionAttributeValues: {
                                        ":resolved": "RESOLVED",
                                        ":now": new Date().toISOString()
                                    }
                                }));
                            }
                        }
                    } catch (e) { console.error("Error resolving log", e); }
                }

                // 5. Update System Status
                // Always update the status so the Dashboard reflects reality (Green=Online, Red=Offline)
                await db.send(new UpdateCommand({
                    TableName: TABLE_NAMES.SYSTEMS,
                    Key: { url_sitio: url },
                    UpdateExpression: `
                        SET estado_sitio = :s,
                            consecutive_failures = :f,
                            last_check_timestamp = :t,
                            last_http_code = :c
                    `,
                    ConditionExpression: "attribute_exists(url_sitio)",
                    ExpressionAttributeValues: {
                        ":s": finalStatus,
                        ":f": newFailures,
                        ":t": new Date().toISOString(),
                        ":c": httpCode
                    },
                }));

            }));

            // Small pause between chunks to be nice to CPU
            await new Promise(r => setTimeout(r, 1000));
        }

        console.log("Cycle complete.");

    } catch (error) {
        console.error("Monitor Cycle Error:", error);
    }
}

// Start Loop
console.log(`Monitor Service Started. Interval: ${CHECK_INTERVAL_MS}ms`);
runMonitorCycle(); // First run immediately
setInterval(runMonitorCycle, CHECK_INTERVAL_MS);
