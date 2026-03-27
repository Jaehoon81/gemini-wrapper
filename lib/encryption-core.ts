import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHmac,
} from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }
  return Buffer.from(key, "hex");
}

function getHashKey(): Buffer {
  const key = process.env.HASH_KEY;
  if (!key || key.length !== 64) {
    throw new Error("HASH_KEY must be 64 hex characters (32 bytes)");
  }
  return Buffer.from(key, "hex");
}

/** 평문을 AES-256-GCM으로 암호화 → iv:authTag:encryptedData (hex) */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/** iv:authTag:encryptedData 포맷의 암호문을 복호화 */
export function decrypt(ciphertext: string): string {
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(":");
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error("Invalid ciphertext format");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return decipher.update(encryptedHex, "hex", "utf8") + decipher.final("utf8");
}

/** HMAC-SHA256 해시 생성 (검색용 인덱스) */
export function hashForLookup(value: string): string {
  return createHmac("sha256", getHashKey()).update(value).digest("hex");
}

/** 복호화 시도 — 실패 시 null 반환 (graceful degradation) */
export function tryDecrypt(ciphertext: string): string | null {
  try {
    return decrypt(ciphertext);
  } catch (error) {
    console.error("[Encryption] Decryption failed:", error);
    return null;
  }
}
