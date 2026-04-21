const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");

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

async function checkLastUpdate() {
    try {
        const result = await db.send(new ScanCommand({
            TableName: "Systems",
            Limit: 5
        }));

        console.log("Checking last backup dates in DB:");
        result.Items.forEach(sys => {
            console.log(`System: ${sys.nombre_empresa || sys.url_sitio}, Last Backup: ${sys.ultimo_backup || 'N/A'}`);
        });
    } catch (error) {
        console.error("Error connecting to DB:", error);
    }
}

checkLastUpdate();
