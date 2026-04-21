const { DynamoDBClient, CreateTableCommand } = require("@aws-sdk/client-dynamodb");

const client = new DynamoDBClient({
    region: "us-east-1",
    endpoint: "http://localhost:8000",
    credentials: {
        accessKeyId: "local",
        secretAccessKey: "local",
    },
});

const createGrowthTable = async () => {
    try {
        console.log("Creating GrowthLogs table...");
        await client.send(new CreateTableCommand({
            TableName: "GrowthLogs",
            KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
            AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
            ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
        }));
        console.log("Table GrowthLogs created successfully.");
    } catch (e) {
        if (e.name === "ResourceInUseException") {
            console.log("Table GrowthLogs already exists.");
        } else {
            console.error("Error creating GrowthLogs:", e);
        }
    }
};

createGrowthTable();
