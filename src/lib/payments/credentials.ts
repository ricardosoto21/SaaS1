import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

interface SumUpCredentials { apiKey: string; }

function encryptionKey() {
  const value = process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY ?? "";
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("Payment credential encryption is not configured.");
  return key;
}

export function encryptSumUpCredentials(credentials: SumUpCredentials) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()]);
  return { encrypted: Buffer.concat([encrypted, cipher.getAuthTag()]), iv };
}

export function decryptSumUpCredentials(encrypted: Uint8Array, iv: Uint8Array): SumUpCredentials {
  const value = Buffer.from(encrypted);
  const authTag = value.subarray(value.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv));
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(value.subarray(0, -16)), decipher.final()]);
  const parsed = JSON.parse(plain.toString("utf8")) as Partial<SumUpCredentials>;
  if (!parsed.apiKey) throw new Error("Invalid payment credentials.");
  return { apiKey: parsed.apiKey };
}