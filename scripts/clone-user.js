// Crea un usuario nuevo COPIANDO la contraseña (hash bcrypt) de otro usuario
// ya existente. Útil cuando no se conoce la contraseña en texto plano pero se
// quiere que el nuevo usuario use la misma. NO borra usuarios existentes.
//
// Uso:
//   node scripts/clone-user.js <sourceEmail> <newEmail> <newName> <newRole> [--force]
//
// Ejemplo:
//   node scripts/clone-user.js desarrollo rober "Rober" dev

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const fs = require("fs");
const path = require("path");

try {
    const envPath = path.resolve(__dirname, "..", ".env.local");
    if (fs.existsSync(envPath)) {
        const data = fs.readFileSync(envPath, "utf8");
        data.split("\n").forEach((line) => {
            const parts = line.split("=");
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const value = parts.slice(1).join("=").trim();
                if (key && !process.env[key]) process.env[key] = value;
            }
        });
    }
} catch (e) {
    console.warn("No se pudo cargar .env.local", e);
}

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || "us-east-1",
    endpoint: process.env.DYNAMODB_ENDPOINT || "http://127.0.0.1:8000",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "local",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "local",
    },
});
const db = DynamoDBDocumentClient.from(client);

async function main() {
    const args = process.argv.slice(2);
    const force = args.includes("--force");
    const [sourceEmail, newEmail, newName, newRole] = args.filter((a) => a !== "--force");

    if (!sourceEmail || !newEmail || !newName || !newRole) {
        console.error(
            "Uso: node scripts/clone-user.js <sourceEmail> <newEmail> <newName> <newRole> [--force]"
        );
        process.exit(1);
    }

    const src = await db.send(new GetCommand({ TableName: "Users", Key: { email: sourceEmail } }));
    if (!src.Item) {
        console.error(`El usuario origen "${sourceEmail}" no existe.`);
        process.exit(1);
    }
    if (!src.Item.password) {
        console.error(`El usuario origen "${sourceEmail}" no tiene contraseña almacenada.`);
        process.exit(1);
    }

    const existing = await db.send(new GetCommand({ TableName: "Users", Key: { email: newEmail } }));
    if (existing.Item && !force) {
        console.error(`El usuario "${newEmail}" ya existe. Usa --force para sobrescribirlo.`);
        process.exit(1);
    }

    await db.send(
        new PutCommand({
            TableName: "Users",
            Item: {
                email: newEmail,
                password: src.Item.password, // mismo hash => misma contraseña
                role: newRole,
                name: newName,
                createdAt: existing.Item?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
        })
    );

    console.log(
        `${existing.Item ? "Actualizado" : "Creado"} "${newEmail}" (role: ${newRole}) con la contraseña de "${sourceEmail}".`
    );
}

main().catch((e) => {
    console.error("Error clonando el usuario:", e);
    process.exit(1);
});
