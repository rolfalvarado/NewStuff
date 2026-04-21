const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const bcrypt = require("bcryptjs");
const fs = require('fs');
const path = require('path');

// Simple .env.local loader for local development
try {
    const envPath = path.resolve(__dirname, '..', '.env.local');
    if (fs.existsSync(envPath)) {
        console.log("Loading .env.local...");
        const data = fs.readFileSync(envPath, 'utf8');
        data.split('\n').forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const value = parts.slice(1).join('=').trim();
                if (key && !process.env[key]) {
                    process.env[key] = value;
                }
            }
        });
    }
} catch (e) {
    console.warn("Could not load .env.local", e);
}

const client = new DynamoDBClient({
    region: "us-east-1",
    endpoint: "http://127.0.0.1:8000",
    credentials: {
        accessKeyId: "local",
        secretAccessKey: "local",
    },
});

const db = DynamoDBDocumentClient.from(client);

const seed = async () => {
    try {
        console.log("Cleaning up existing users...");
        // 1. Delete all existing users
        const scanResult = await db.send(new ScanCommand({
            TableName: "Users",
            ProjectionExpression: "email" // Only need the key
        }));

        if (scanResult.Items && scanResult.Items.length > 0) {
            for (const user of scanResult.Items) {
                console.log(`Deleting user: ${user.email}`);
                await db.send(new DeleteCommand({
                    TableName: "Users",
                    Key: { email: user.email }
                }));
            }
        } else {
            console.log("No existing users found.");
        }

        console.log("Creating definitive users...");

        // 2. Define new users
        // Note: 'soporte' assigned 'user' role (read-only), others 'admin'.
        const users = [
            {
                email: "soporte",
                pass: process.env.SEED_PASS_SOPORTE,
                role: "admin",
                name: "Soporte"
            },
            {
                email: "desarrollo",
                pass: process.env.SEED_PASS_DESARROLLO,
                role: "admin",
                name: "Desarrollo"
            },
            {
                email: "administracion",
                pass: process.env.SEED_PASS_ADMINISTRACION,
                role: "admin",
                name: "Administración"
            }
        ];

        // Validate presence of passwords
        if (users.some(u => !u.pass)) {
            console.error("ERROR: Missing passwords in environment variables. Set SEED_PASS_SOPORTE, SEED_PASS_DESARROLLO, SEED_PASS_ADMINISTRACION.");
            process.exit(1);
        }

        // 3. Create users
        for (const u of users) {
            const hashedPassword = await bcrypt.hash(u.pass, 10);

            await db.send(new PutCommand({
                TableName: "Users",
                Item: {
                    email: u.email,
                    password: hashedPassword,
                    role: u.role,
                    name: u.name,
                    createdAt: new Date().toISOString()
                }
            }));
            console.log(`Created user: ${u.email} (Role: ${u.role})`);
        }

        console.log("Seed complete. All previous users removed and new ones created.");

    } catch (e) {
        console.error("Error running seed script:", e);
    }
};

seed();
