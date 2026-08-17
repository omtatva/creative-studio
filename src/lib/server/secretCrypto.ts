import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * AES-256-GCM helpers for at-rest encryption of workspace-supplied
 * secrets (currently: a workspace's own Gemini API key — see
 * src/services/aiConfigService.ts). This file must NEVER be imported
 * by client components; the `server-only` import above makes any
 * accidental client import a build-time error rather than a runtime
 * leak. Only the API routes under src/app/api/settings/ai-key/ use it.
 *
 * Encrypted output (ciphertext/iv/authTag) is safe to store in
 * Firestore and safe to read back on the client — it's cryptographic
 * noise without SETTINGS_ENCRYPTION_KEY, which never leaves this
 * server process. This is the "safest architecture achievable without
 * a dedicated secret manager" — see the AI Settings page's doc
 * comment for the honest caveat about what a production hardening
 * pass (Google Secret Manager / Cloud KMS) would add on top of this.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

function getEncryptionKey(): Buffer {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("SETTINGS_ENCRYPTION_KEY is not configured on the server. Add it to .env.local and restart the server.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("SETTINGS_ENCRYPTION_KEY must be a base64-encoded 32-byte (256-bit) key.");
  }
  return key;
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptSecret(data: EncryptedSecret): string {
  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(data.iv, "base64"));
  decipher.setAuthTag(Buffer.from(data.authTag, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(data.ciphertext, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}
