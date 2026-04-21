const { DynamoDBClient, CreateTableCommand, UpdateTimeToLiveCommand } = require("@aws-sdk/client-dynamodb");

const client = new DynamoDBClient({
    region: "us-east-1",
    endpoint: "http://localhost:8000",
    credentials: {
        accessKeyId: "local",
        secretAccessKey: "local",
    },
});

const createTable = async (params) => {
    try {
        await client.send(new CreateTableCommand(params));
        console.log(`Table ${params.TableName} created.`);
        return true;
    } catch (e) {
        if (e.name === "ResourceInUseException") {
            console.log(`Table ${params.TableName} already exists.`);
            return false;
        } else {
            console.error(`Error creating ${params.TableName}:`, e);
            throw e;
        }
    }
};

const enableTTL = async (tableName, attributeName) => {
    try {
        await client.send(new UpdateTimeToLiveCommand({
            TableName: tableName,
            TimeToLiveSpecification: {
                Enabled: true,
                AttributeName: attributeName
            }
        }));
        console.log(`TTL enabled for ${tableName} on ${attributeName}`);
    } catch (e) {
        // Si ya está habilitado o error local, solo loggeamos
        console.log(`Could not enable TTL for ${tableName}: ${e.message}`);
    }
};

const init = async () => {
    console.log("Checking tables...");

    // Wait for DB to be available (Retries)
    let connected = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!connected && attempts < maxAttempts) {
        try {
            // Intento de conexión simple (List tables u operación ligera)
            // Usamos una operación real para verificar que el puerto esté abierto y respondiendo
            const { ListTablesCommand } = require("@aws-sdk/client-dynamodb");
            await client.send(new ListTablesCommand({}));
            connected = true;
            console.log("Connected to DynamoDB successfully.");
        } catch (e) {
            attempts++;
            console.log(`Connection attempt ${attempts}/${maxAttempts} failed. Waiting 2s...`);
            if (attempts >= maxAttempts) {
                console.error("Could not connect to DynamoDB after multiple attempts.");
                throw e;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    // Monitors Table
    await createTable({
        TableName: "Monitors",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
    });

    // Logs Table
    await createTable({
        TableName: "MonitorLogs",
        KeySchema: [
            { AttributeName: "url_sitio", KeyType: "HASH" },
            { AttributeName: "timestamp", KeyType: "RANGE" }
        ],
        AttributeDefinitions: [
            { AttributeName: "url_sitio", AttributeType: "S" },
            { AttributeName: "timestamp", AttributeType: "S" }
        ],
        ProvisionedThroughput: { ReadCapacityUnits: 10, WriteCapacityUnits: 10 }
    });
    // Add TTL for logs (retention)
    await enableTTL("MonitorLogs", "ttl");

    // Users Table
    await createTable({
        TableName: "Users",
        KeySchema: [{ AttributeName: "email", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "email", AttributeType: "S" }],
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
    });

    // Systems Table
    await createTable({
        TableName: "Systems",
        KeySchema: [{ AttributeName: "url_sitio", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "url_sitio", AttributeType: "S" }],
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
    });

    // SESSIONS Table (New for Security)
    await createTable({
        TableName: "Sessions",
        KeySchema: [{ AttributeName: "token", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "token", AttributeType: "S" }],
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
    });
    // Add TTL for Sessions (auto logout)
    await enableTTL("Sessions", "ttl");

    // SERVERS Table (Ensure it exists)
    await createTable({
        TableName: "servidores",
        KeySchema: [{ AttributeName: "nombre_servidor", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "nombre_servidor", AttributeType: "S" }],
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
    });

    // MONITORED USERS Table
    await createTable({
        TableName: "MonitoredUsers",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
    });

    // GROWTH LOGS Table
    await createTable({
        TableName: "GrowthLogs",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
    });

    // CHAT Table
    await createTable({
        TableName: "Chat",
        KeySchema: [
            { AttributeName: "PK", KeyType: "HASH" },
            { AttributeName: "SK", KeyType: "RANGE" }
        ],
        AttributeDefinitions: [
            { AttributeName: "PK", AttributeType: "S" },
            { AttributeName: "SK", AttributeType: "N" }
        ],
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
    });

    // RECYCLEBIN Table
    await createTable({
        TableName: "RecycleBin",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
    });

    console.log("Initialization done.");
};

init();
