const { DynamoDBClient, CreateTableCommand, ListTablesCommand } = require("@aws-sdk/client-dynamodb");

const client = new DynamoDBClient({
    region: "us-east-1",
    endpoint: "http://localhost:8000",
    credentials: {
        accessKeyId: "fakeAccessKeyId",
        secretAccessKey: "fakeSecretAccessKey",
    },
});

async function initServersTable() {
    try {
        // Check if table exists
        const listCommand = new ListTablesCommand({});
        const listResponse = await client.send(listCommand);

        if (listResponse.TableNames && listResponse.TableNames.includes("servidores")) {
            console.log("✅ Table 'servidores' already exists");
            return;
        }

        // Create table
        const createCommand = new CreateTableCommand({
            TableName: "servidores",
            KeySchema: [
                { AttributeName: "nombre_servidor", KeyType: "HASH" }
            ],
            AttributeDefinitions: [
                { AttributeName: "nombre_servidor", AttributeType: "S" }
            ],
            BillingMode: "PAY_PER_REQUEST"
        });

        await client.send(createCommand);
        console.log("✅ Table 'servidores' created successfully");
    } catch (error) {
        console.error("❌ Error creating table:", error);
    }
}

initServersTable();
