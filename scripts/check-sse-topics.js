const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({
    endpoint: "http://127.0.0.1:8000",
    region: "us-east-1",
    credentials: { accessKeyId: "local", secretAccessKey: "local" }
});
const db = DynamoDBDocumentClient.from(client);

(async () => {
    const res = await db.send(new QueryCommand({
        TableName: "Chat",
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": "TOPICS" }
    }));
    const topics = res.Items || [];
    const now = Date.now();
    console.log("TOPICS COUNT:", topics.length);
    console.log("CURRENT TIME:", now);
    console.log("---");
    for (const t of topics.slice(0, 5)) {
        const ageSec = t.lastMessageAt ? Math.round((now - t.lastMessageAt) / 1000) : "N/A";
        console.log(`Topic: ${t.title}`);
        console.log(`  id=${t.id} SK=${t.SK} lastMessageAt=${t.lastMessageAt} (${ageSec}s ago)`);
        console.log(`  SK type=${typeof t.SK} lastMessageAt type=${typeof t.lastMessageAt}`);
    }
})();
