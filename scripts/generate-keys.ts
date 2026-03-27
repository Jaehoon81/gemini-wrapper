import { randomBytes } from "crypto";

const encryptionKey = randomBytes(32).toString("hex");
const hashKey = randomBytes(32).toString("hex");

console.log("=== .env.local 및 Vercel에 추가하세요 ===\n");
console.log(`ENCRYPTION_KEY=${encryptionKey}`);
console.log(`HASH_KEY=${hashKey}`);
