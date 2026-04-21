const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({
    endpoint: "http://127.0.0.1:8000",
    region: "us-east-1",
    credentials: { accessKeyId: "local", secretAccessKey: "local" }
});
const db = DynamoDBDocumentClient.from(client);

const topicId = "dnprnkohr577";
const topicCreatedAt = 1771981029907;

(async () => {
    const now = Date.now();
    const msgId = "test_" + now;

    // 1. Insert a test message
    await db.send(new PutCommand({
        TableName: "Chat",
        Item: {
            PK: `TOPIC#${topicId}`,
            SK: now,
            id: msgId,
            author: "ROBOT_TEST",
            text: "Test message from diagnostic script at " + new Date().toISOString(),
            timestamp: now
        }
    }));

    // 2. Update lastMessageAt on the topic
    await db.send(new UpdateCommand({
        TableName: "Chat",
        Key: { PK: "TOPICS", SK: topicCreatedAt },
        UpdateExpression: "SET lastMessageAt = :lma, lastMessageAuthor = :lmau, lastMessageText = :lmt",
        ExpressionAttributeValues: {
            ":lma": now,
            ":lmau": "ROBOT_TEST",
            ":lmt": "Test message from diagnostic script"
        }
    }));

    console.log("Test message sent at:", now, "| msgId:", msgId);
    console.log("Now watch the SSE stream for NEW_MESSAGE events...");
})();
