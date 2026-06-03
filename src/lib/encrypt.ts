import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_HEX = process.env.ENCRYPTION_KEY ?? "";

function getKey(): Buffer {
  if (!KEY_HEX || KEY_HEX.length < 64) {
    // Fallback for dev — in production this should always be set
    return crypto.scryptSync("dental-erp-default-key", "salt", 32);
  }
  return Buffer.from(KEY_HEX.slice(0, 64), "hex");
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return "";
  const iv = crypto.randomBytes(12);
  const key = getKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decrypt(encryptedStr: string): string {
  if (!encryptedStr || !encryptedStr.includes(":")) return "";
  try {
    const [ivB64, authTagB64, dataB64] = encryptedStr.split(":");
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const key = getKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(data).toString("utf8") + decipher.final("utf8");
  } catch {
    return "";
  }
}

export function maskCredential(value: string | null | undefined): string {
  if (!value) return "";
  // Try to decrypt first (stored value might be encrypted)
  let plain = value;
  try {
    if (value.includes(":")) plain = decrypt(value);
  } catch {}
  if (plain.length < 8) return "****";
  return plain.slice(0, 4) + "****" + plain.slice(-4);
}
