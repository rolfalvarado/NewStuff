// Crea (o actualiza con --force) UN usuario sin tocar el resto.
// A diferencia de seed-users.js, este script NO borra los usuarios existentes.
//
// Uso:
//   node scripts/create-user.js <email/usuario> <nombre> <role> <password> [--force]
//
// Ejemplos:
//   node scripts/create-user.js rolf "Rolf Alvarado" support "MiClave123"
//   node scripts/create-user.js darael "Darael" dev "OtraClave456"
//
// Notas:
//   - <email/usuario> es la CLAVE: es lo que se escribe al iniciar sesión.
//   - <role>: "dev" hace que en el módulo Tareas actúe como desarrollador
//     (puede Tomar tareas). Cualquier otro valor (p.ej. "support"/"admin")
//     se comporta como soporte en Tareas.
//   - Si el usuario ya existe, aborta salvo que pases --force.

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

// Carga simple de .env.local (mismo patrón que seed-users.js)
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
    const positional = args.filter((a) => a !== "--force");
    const [email, name, role, password] = positional;

    if (!email || !name || !role || !password) {
        console.error(
            "Uso: node scripts/create-user.js <email/usuario> <nombre> <role> <password> [--force]"
        );
        process.exit(1);
    }

    // ¿Ya existe?
    const existing = await db.send(
        new GetCommand({ TableName: "Users", Key: { email } })
    );
    if (existing.Item && !force) {
        console.error(
            `El usuario "${email}" ya existe. Usa --force para sobrescribir su contraseña/datos.`
        );
        process.exit(1);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.send(
        new PutCommand({
            TableName: "Users",
            Item: {
                email,
                password: hashedPassword,
                role,
                name,
                createdAt: existing.Item?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
        })
    );

    console.log(
        `${existing.Item ? "Actualizado" : "Creado"} usuario: ${email} (role: ${role}, nombre: ${name})`
    );
}

main().catch((e) => {
    console.error("Error creando el usuario:", e);
    process.exit(1);
});
