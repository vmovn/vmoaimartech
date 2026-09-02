/**
 * AES-256-GCM for workspace BYOK API keys.
 * Server-only. Uses AI_CREDENTIAL_ENCRYPTION_KEY only — no fallback chain.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AIError } from "./errors";

export const AI_CREDENTIAL_ENCRYPTION_KEY = "AI_CREDENTIAL_ENCRYPTION_KEY";
const PREFIX = "v1:";

export function isAiCredentialMasterKeyConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean((env.AI_CREDENTIAL_ENCRYPTION_KEY ?? process.env.AI_CREDENTIAL_ENCRYPTION_KEY)?.trim());
}

export function readAiCredentialMasterKey(
  env: NodeJS.ProcessEnv = process.env,
): Buffer {
  const raw = env.AI_CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new AIError(
      "auth",
      "AI_CREDENTIAL_ENCRYPTION_KEY is not configured. Workspace API keys cannot be saved or used.",
    );
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new AIError("auth", "AI_CREDENTIAL_ENCRYPTION_KEY must be a 32-byte base64 key.");
  }
  if (key.length !== 32) {
    throw new AIError("auth", "AI_CREDENTIAL_ENCRYPTION_KEY must be a 32-byte base64 key.");
  }
  return key;
}

export function encryptAiCredential(
  plaintext: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const value = plaintext.trim();
  if (!value) throw new AIError("validation", "API key is required");
  const key = readAiCredentialMasterKey(env);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptAiCredential(
  ciphertext: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!ciphertext.startsWith(PREFIX)) {
    throw new AIError("auth", "Unrecognized AI credential ciphertext");
  }
  const key = readAiCredentialMasterKey(env);
  const buf = Buffer.from(ciphertext.slice(PREFIX.length), "base64");
  if (buf.length < 29) {
    throw new AIError("auth", "Invalid AI credential ciphertext");
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    throw new AIError("auth", "Unable to decrypt AI credential");
  }
}

export function credentialLast4(plaintext: string): string {
  const trimmed = plaintext.trim();
  if (trimmed.length <= 4) return trimmed;
  return trimmed.slice(-4);
}
