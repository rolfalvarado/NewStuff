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

async function checkPasswords() {
    try {
        const result = await docClient.send(new ScanCommand({
            TableName: "servidores"
        }));
        console.log("Servidores Table Content:");
        result.Items.forEach(item => {
            console.log(`- Server: ${item.nombre_servidor}`);
            console.log(`  Encrypted Pass: ${item.pass_servidor_encrypted || "N/A"}`);
            // Check format
            if (item.pass_servidor_encrypted) {
                const parts = item.pass_servidor_encrypted.split(":");
                console.log(`  Parts count: ${parts.length}`);
            }
        });
    } catch (err) {
        console.error(err);
    }
}

checkPasswords();
