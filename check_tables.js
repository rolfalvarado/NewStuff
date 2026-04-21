const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({
    region: "us-east-1",
    endpoint: "http://127.0.0.1:8000",
    credentials: {
        accessKeyId: "fake",
        secretAccessKey: "fake"
    }
});

const docClient = DynamoDBDocumentClient.from(client);

async function checkMonitors() {
    try {
        const result = await docClient.send(new ScanCommand({
            TableName: "Monitors"
        }));
        console.log("Monitors Table Content:");
        console.log(JSON.stringify(result.Items, null, 2));

        const systems = await docClient.send(new ScanCommand({
            TableName: "Systems"
        }));
        console.log("\nSystems Table Content (Count):", systems.Items.length);
        if (systems.Items.length > 0) {
            console.log("First System Item Keys:", Object.keys(systems.Items[0]));
            console.log("First System Item:", JSON.stringify(systems.Items[0], null, 2));
        }
    } catch (err) {
        console.error(err);
    }
}

checkMonitors();
