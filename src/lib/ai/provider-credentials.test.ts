import { describe, expect, it, vi } from "vitest";
import { AIError } from "./errors";
import { encryptAiCredential } from "./credential-crypto.server";
import {
  assertCredentialTenant,
  credentialsFromPlaintext,
  decideCredentialSource,
  resolveProviderCredentials,
} from "./provider-credentials.server";
import { resolveCredentials } from "./registry.server";
import { platformManagedProviderConfig } from "./platform-ollama";
import type { AIProviderRecord } from "./types";

const WS_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WS_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PROVIDER_A = "11111111-1111-1111-1111-111111111111";
const PROVIDER_B = "22222222-2222-2222-2222-222222222222";
const MASTER = Buffer.alloc(32, 3).toString("base64");

function gemini(partial: Partial<AIProviderRecord> = {}): AIProviderRecord {
  return {
    id: PROVIDER_A,
    workspaceId: WS_A,
    kind: "gemini",
    name: "Gemini A",
    baseUrl: null,
    apiKeySecretName: null,
    organizationId: null,
    enabled: true,
    isDefault: false,
    priority: 100,
    config: { credential_source: "workspace_encrypted" },
    ...partial,
  };
}

describe("decideCredentialSource", () => {
  it("uses workspace ciphertext for BYOK providers", () => {
    expect(decideCredentialSource(gemini())).toBe("workspace_encrypted");
  });

  it("uses platform ENV when api_key_secret_name is set and source is omitted", () => {
    expect(decideCredentialSource(gemini({
      apiKeySecretName: "GEMINI_API_KEY",
      config: {},
    }))).toBe("platform_env");
  });

  it("rejects ollama as a BYOK key provider", () => {
    expect(decideCredentialSource({
      id: PROVIDER_A,
      workspaceId: WS_A,
      kind: "lmstudio",
      name: "LM Studio",
      baseUrl: "http://localhost:1234/v1",
      apiKeySecretName: null,
      organizationId: null,
      enabled: true,
      isDefault: false,
      priority: 100,
      config: {},
    })).toBe("keyless");
    expect(decideCredentialSource({
      ...gemini(),
      kind: "ollama",
      apiKeySecretName: "GEMINI_API_KEY",
      config: platformManagedProviderConfig(),
    })).toBe("keyless");
  });
});

describe("credential tenant boundary", () => {
  it("rejects executing provider A under workspace B before decrypt", async () => {
    const decrypt = vi.fn(() => "should-not-run");
    await expect(resolveProviderCredentials(
      gemini(),
      WS_B,
      { decrypt, loadSecret: async () => ({ workspace_id: WS_A, api_key_ciphertext: "v1:x" }) },
    )).rejects.toMatchObject({ type: "auth", message: expect.stringContaining("does not belong") });
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("rejects a secret whose workspace does not match the provider before decrypt", async () => {
    const decrypt = vi.fn(() => "should-not-run");
    await expect(resolveProviderCredentials(
      gemini(),
      WS_A,
      { decrypt, loadSecret: async () => ({ workspace_id: WS_B, api_key_ciphertext: "v1:x" }) },
    )).rejects.toMatchObject({ type: "auth" });
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("does not mix workspace ciphertext with an unrelated platform env key", async () => {
    const env = {
      AI_CREDENTIAL_ENCRYPTION_KEY: MASTER,
      GEMINI_API_KEY: "platform-env-key-SHOULD-NOT-WIN",
    };
    const ciphertext = encryptAiCredential("workspace-key-A", env);
    const creds = await resolveProviderCredentials(
      gemini({ apiKeySecretName: "GEMINI_API_KEY" }),
      WS_A,
      {
        env,
        loadSecret: async () => ({ workspace_id: WS_A, api_key_ciphertext: ciphertext }),
      },
    );
    expect(creds.apiKey).toBe("workspace-key-A");
    expect(creds.apiKey).not.toBe(env.GEMINI_API_KEY);
  });

  it("uses key A for workspace A and key B for workspace B", async () => {
    const env = { AI_CREDENTIAL_ENCRYPTION_KEY: MASTER };
    const cipherA = encryptAiCredential("gemini-key-A", env);
    const cipherB = encryptAiCredential("gemini-key-B", env);
    const a = await resolveProviderCredentials(gemini(), WS_A, {
      env,
      loadSecret: async () => ({ workspace_id: WS_A, api_key_ciphertext: cipherA }),
    });
    const b = await resolveProviderCredentials(gemini({
      id: PROVIDER_B,
      workspaceId: WS_B,
      name: "Gemini B",
    }), WS_B, {
      env,
      loadSecret: async () => ({ workspace_id: WS_B, api_key_ciphertext: cipherB }),
    });
    expect(a.apiKey).toBe("gemini-key-A");
    expect(b.apiKey).toBe("gemini-key-B");
  });
});

describe("platform ENV and keyless regression", () => {
  it("still resolves GEMINI_API_KEY for platform_env providers", () => {
    const prev = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "platform-gemini";
    try {
      const creds = resolveCredentials(gemini({
        apiKeySecretName: "GEMINI_API_KEY",
        config: { credential_source: "platform_env" },
      }));
      expect(creds.apiKey).toBe("platform-gemini");
    } finally {
      if (prev === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prev;
    }
  });

  it("Ollama remains keyless without a master key", () => {
    const creds = resolveCredentials({
      id: PROVIDER_A,
      workspaceId: WS_A,
      kind: "ollama",
      name: "Platform Local AI",
      baseUrl: "http://ollama.internal:11434/v1",
      apiKeySecretName: null,
      organizationId: null,
      enabled: true,
      isDefault: false,
      priority: 50,
      config: platformManagedProviderConfig(),
    });
    expect(creds.apiKey).toBeUndefined();
    expect(creds.baseUrl).toBe("http://ollama.internal:11434/v1");
  });

  it("BYOK decrypt fails clearly when the master key is missing; keyless still works", async () => {
    await expect(resolveProviderCredentials(gemini(), WS_A, {
      env: {},
      loadSecret: async () => ({ workspace_id: WS_A, api_key_ciphertext: "v1:aaaa" }),
    })).rejects.toThrow(/AI_CREDENTIAL_ENCRYPTION_KEY/);

    const ollama = await resolveProviderCredentials({
      id: PROVIDER_A,
      workspaceId: WS_A,
      kind: "ollama",
      name: "Platform Local AI",
      baseUrl: "http://ollama.internal:11434/v1",
      apiKeySecretName: null,
      organizationId: null,
      enabled: true,
      isDefault: false,
      priority: 50,
      config: platformManagedProviderConfig(),
    }, WS_A, { env: {} });
    expect(ollama.apiKey).toBeUndefined();
  });
});

describe("ephemeral test credentials", () => {
  it("builds in-memory credentials without persistence", () => {
    const creds = credentialsFromPlaintext(
      { kind: "gemini", name: "Gemini", baseUrl: null, organizationId: null, config: {} },
      "test-in-memory-key",
    );
    expect(creds.apiKey).toBe("test-in-memory-key");
  });

  it("assertCredentialTenant matches provider, secret, and execution workspace", () => {
    expect(() => assertCredentialTenant({
      providerWorkspaceId: WS_A,
      executionWorkspaceId: WS_B,
    })).toThrow(AIError);
    expect(() => assertCredentialTenant({
      providerWorkspaceId: WS_A,
      executionWorkspaceId: WS_A,
      secretWorkspaceId: WS_B,
    })).toThrow(AIError);
    expect(() => assertCredentialTenant({
      providerWorkspaceId: WS_A,
      executionWorkspaceId: WS_A,
      secretWorkspaceId: WS_A,
    })).not.toThrow();
  });
});
