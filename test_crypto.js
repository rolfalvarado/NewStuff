const crypto = require("crypto");

function getKey(keyStr) {
    return crypto.createHash("sha256").update(keyStr).digest();
}

function decryptPassword(encryptedPassword, keyStr) {
    try {
        const parts = encryptedPassword.split(":");
        if (parts.length !== 3) return "Format error";
        const [ivHex, authTagHex, encrypted] = parts;
        const key = getKey(keyStr);
        const iv = Buffer.from(ivHex, "hex");
        const authTag = Buffer.from(authTagHex, "hex");
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
    } catch (e) {
        return "Error: " + e.message;
    }
}

const testPass = "test_password";
const key1 = "d7f8c46fa6e7838c6887391713682a499c9891ff4ce9853202a45ad95c10217f";
const key1Quotes = "\"d7f8c46fa6e7838c6887391713682a499c9891ff4ce9853202a45ad95c10217f\"";

function encryptPassword(plainPassword, keyStr) {
    const key = getKey(keyStr);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(plainPassword, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

const enc1 = encryptPassword(testPass, key1);
console.log('Encrypted with key1:', enc1);
console.log('Decrypted enc1 with key1:', decryptPassword(enc1, key1));
console.log('Decrypted enc1 with key1Quotes:', decryptPassword(enc1, key1Quotes));
