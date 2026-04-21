const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");

const dbConfig = {
    region: "us-east-1",
    endpoint: "http://127.0.0.1:8000",
    credentials: {
        accessKeyId: "local",
        secretAccessKey: "local",
    },
};

const client = new DynamoDBClient(dbConfig);
const db = DynamoDBDocumentClient.from(client);

// Mock encryptPassword logic
function getKey() {
    const key = process.env.SERVER_ENCRYPTION_KEY;
    if (!key) throw new Error("SERVER_ENCRYPTION_KEY not set");
    return crypto.createHash("sha256").update(key).digest();
}

function encryptPassword(plainPassword) {
    const key = getKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(plainPassword, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

async function testImport() {
    try {
        console.log("Testing server import...");
        const row = {
            nombre_servidor: "Test Server " + Date.now(),
            pass_servidor: "secret123"
        };

        const encrypted = encryptPassword(row.pass_servidor);

        await db.send(new PutCommand({
            TableName: "servidores",
            Item: {
                nombre_servidor: row.nombre_servidor,
                pass_servidor_encrypted: encrypted,
                is_inactive: false
            }
        }));

        console.log("Import success for:", row.nombre_servidor);
    } catch (e) {
        console.error("Import failed:", e.message);
    }
}

testImport();
