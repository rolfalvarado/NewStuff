import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const isProduction = process.env.NODE_ENV === "production";

// Configuration for local DynamoDB (Development & User's EC2 setup)
// When running locally or on EC2 "local" mode, we point to localhost:8000
const dbConfig = {
    region: process.env.AWS_REGION || "us-east-1",
    endpoint: process.env.DYNAMODB_ENDPOINT || "http://127.0.0.1:8000",
    credentials: {
        // Local DynamoDB doesn't validate credentials, but SDK requires them
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "local",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "local",
    },
};

// Create the low-level DynamoDB Client
const client = new DynamoDBClient(dbConfig);

// Create the high-level Document Client (simpler API for JS objects)
export const db = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true, // Useful for optional fields
        convertEmptyValues: true, // Handle empty strings/buffers
    },
});

export const TABLE_NAMES = {
    MONITORS: "Monitors",
    LOGS: "MonitorLogs",
    USERS: "Users",
    SYSTEMS: "Systems",
    SESSIONS: "Sessions",
    SERVERS: "servidores",
    MONITORED_USERS: "MonitoredUsers",
    GROWTH_LOGS: "GrowthLogs",
    CHAT: "Chat",
    RECYCLEBIN: "RecycleBin",
};
