import { afterEach, describe, expect, it, vi } from "vitest";
import { AIError } from "./errors";
import {
  credentialLast4,
  decryptAiCredential,
  encryptAiCredential,
  readAiCredentialMasterKey,
} from "./credential-crypto.server";

const KEY_A = Buffer.alloc(32, 7).toString("base64");
const KEY_B = Buffer.alloc(32, 9).toString("base64");

afterEach(() => {
  delete process.env.AI_CREDENTIAL_ENCRYPTION_KEY;
  delete process.env.SESSION_SECRET;
  delete process.env.META_TOKEN_ENCRYPTION_KEY;
  delete process.env.APP_USER_CONNECTION_KEY_SECRET;
});

describe("AI credential encryption", () => {
  it("round-trips plaintext through versioned AES-256-GCM", () => {
    const env = { AI_CREDENTIAL_ENCRYPTION_KEY: KEY_A };
    const plaintext = "AIzaSyTestGeminiKeyAAAA";
    const ciphertext = encryptAiCredential(plaintext, env);
    expect(ciphertext.startsWith("v1:")).toBe(true);
    expect(ciphertext).not.toContain(plaintext);
    expect(decryptAiCredential(ciphertext, env)).toBe(plaintext);
    expect(credentialLast4(plaintext)).toBe("AAAA");
  });

  it("fails closed with the wrong master key", () => {
    const ct = encryptAiCredential("secret-key-value", { AI_CREDENTIAL_ENCRYPTION_KEY: KEY_A });
    expect(() => decryptAiCredential(ct, { AI_CREDENTIAL_ENCRYPTION_KEY: KEY_B }))
      .toThrow(AIError);
    expect(() => decryptAiCredential(ct, { AI_CREDENTIAL_ENCRYPTION_KEY: KEY_B }))
      .toThrow(/Unable to decrypt/);
  });

  it("fails clearly when the master key is missing", () => {
    expect(() => readAiCredentialMasterKey({})).toThrow(/AI_CREDENTIAL_ENCRYPTION_KEY is not configured/);
    expect(() => encryptAiCredential("abc", {})).toThrow(/AI_CREDENTIAL_ENCRYPTION_KEY/);
  });

  it("does not fall back to SESSION_SECRET or other product keys", () => {
    expect(() => encryptAiCredential("abc", {
      SESSION_SECRET: "x".repeat(40),
      META_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
      APP_USER_CONNECTION_KEY_SECRET: Buffer.alloc(32, 2).toString("base64"),
    })).toThrow(/AI_CREDENTIAL_ENCRYPTION_KEY is not configured/);
  });

  it("rejects a non-32-byte master key", () => {
    expect(() => readAiCredentialMasterKey({
      AI_CREDENTIAL_ENCRYPTION_KEY: Buffer.from("too-short").toString("base64"),
    })).toThrow(/32-byte/);
  });
});

describe("encrypt isolation", () => {
  it("does not log plaintext", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const env = { AI_CREDENTIAL_ENCRYPTION_KEY: KEY_A };
    encryptAiCredential("sk-never-log-this-value", env);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
