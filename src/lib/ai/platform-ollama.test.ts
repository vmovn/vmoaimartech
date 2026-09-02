import { afterEach, describe, expect, it } from "vitest";
import { AIError } from "./errors";
import { resolveCredentials } from "./registry.server";
import {
  applyFeatureRequestPolicy,
  resolveFeatureProviderChain,
} from "./feature-routing";
import type { AIFeatureConfig, AIProviderRecord, ChatRequest } from "./types";
import { decideProviderTenant } from "./provider-tenant";
import {
  LOCAL_OLLAMA_BASE_URL,
  PLATFORM_OLLAMA_RATE_LIMIT_PER_MIN,
  isPlatformManagedOllama,
  platformManagedProviderConfig,
  platformOllamaRateLimitPerMin,
  resolveOllamaBaseUrl,
  stripWorkspaceManagedMarker,
  tryResolveOllamaBaseUrlForProvision,
} from "./platform-ollama";

const WS_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WS_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PROVIDER_A = "11111111-1111-1111-1111-111111111111";

function ollamaRecord(partial: Partial<AIProviderRecord> = {}): AIProviderRecord {
  return {
    id: PROVIDER_A,
    workspaceId: WS_A,
    kind: "ollama",
    name: "Platform Local AI",
    baseUrl: null,
    apiKeySecretName: null,
    organizationId: null,
    enabled: true,
    isDefault: false,
    priority: 50,
    config: platformManagedProviderConfig(),
    ...partial,
  };
}

afterEach(() => {
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.OLLAMA_UTILITY_MODEL;
});

describe("resolveOllamaBaseUrl", () => {
  it("allows localhost in local development when no operator URL is set", () => {
    expect(resolveOllamaBaseUrl({
      env: { NODE_ENV: "development" },
      config: platformManagedProviderConfig(),
    })).toBe(LOCAL_OLLAMA_BASE_URL.replace(/\/+$/, ""));
  });

  it("requires an explicit URL in production", () => {
    expect(() => resolveOllamaBaseUrl({
      env: { NODE_ENV: "production", OLLAMA_BASE_URL: "" },
      config: platformManagedProviderConfig(),
    })).toThrow(AIError);
    expect(() => resolveOllamaBaseUrl({
      env: { NODE_ENV: "production", OLLAMA_BASE_URL: "" },
      config: platformManagedProviderConfig(),
    })).toThrow(/OLLAMA_BASE_URL/);
  });

  it("rejects localhost even when it is the stored row URL in production", () => {
    expect(() => resolveOllamaBaseUrl({
      recordBaseUrl: "http://localhost:11434/v1",
      env: { NODE_ENV: "production", OLLAMA_BASE_URL: "" },
      config: platformManagedProviderConfig(),
    })).toThrow(/must not use localhost/);
  });

  it("uses operator OLLAMA_BASE_URL for platform-managed rows", () => {
    expect(resolveOllamaBaseUrl({
      recordBaseUrl: "http://stale-host:11434/v1",
      env: { NODE_ENV: "production", OLLAMA_BASE_URL: "http://ollama.internal:11434/v1/" },
      config: platformManagedProviderConfig(),
    })).toBe("http://ollama.internal:11434/v1");
  });

  it("does not overlay operator URL onto unmanaged workspace Ollama rows", () => {
    expect(resolveOllamaBaseUrl({
      recordBaseUrl: "http://workspace-ollama:11434/v1",
      env: { NODE_ENV: "production", OLLAMA_BASE_URL: "http://platform-ollama:11434/v1" },
      config: {},
    })).toBe("http://workspace-ollama:11434/v1");
  });

  it("does not provision a production row when operator URL is absent", () => {
    expect(tryResolveOllamaBaseUrlForProvision({ NODE_ENV: "production", OLLAMA_BASE_URL: "" })).toBeNull();
  });
});

describe("platform-managed marker", () => {
  it("recognizes managed_by=platform on existing config jsonb", () => {
    expect(isPlatformManagedOllama({
      kind: "ollama",
      config: { managed_by: "platform", purpose: "utility" },
    })).toBe(true);
    expect(isPlatformManagedOllama({ kind: "ollama", config: {} })).toBe(false);
    expect(isPlatformManagedOllama({
      kind: "lovable",
      config: { managed_by: "platform" },
    })).toBe(false);
  });

  it("strips a workspace-forged managed_by marker", () => {
    expect(stripWorkspaceManagedMarker({
      managed_by: "platform",
      extra_headers: { a: "b" },
    })).toEqual({ extra_headers: { a: "b" } });
  });
});

describe("Ollama credentials", () => {
  it("requires no API key", () => {
    const creds = resolveCredentials(ollamaRecord({
      baseUrl: "http://ollama.internal:11434/v1",
    }));
    expect(creds.apiKey).toBeUndefined();
    expect(creds.baseUrl).toBe("http://ollama.internal:11434/v1");
  });

  it("caps platform-managed Ollama below the generic workspace limit", () => {
    expect(platformOllamaRateLimitPerMin(ollamaRecord())).toBe(PLATFORM_OLLAMA_RATE_LIMIT_PER_MIN);
    expect(platformOllamaRateLimitPerMin({ kind: "lovable", config: {} })).toBe(120);
  });
});

describe("conversation_intelligence utility routing", () => {
  it("routes by ai_feature_config to the Ollama provider without a vendor fallback", () => {
    const featureConfig: AIFeatureConfig = {
      workspaceId: WS_A,
      feature: "conversation_intelligence",
      providerId: PROVIDER_A,
      fallbackProviderIds: [],
      model: "utility-local",
      temperature: 0.2,
      maxTokens: 1200,
      systemPrompt: null,
      enabled: true,
      config: { purpose: "utility" },
    };
    const chain = resolveFeatureProviderChain({ featureConfig });
    expect(chain.primaryProviderId).toBe(PROVIDER_A);
    expect(chain.fallbackProviderIds).toEqual([]);

    const request: ChatRequest = { model: "", messages: [{ role: "user", content: "hi" }] };
    const applied = applyFeatureRequestPolicy(request, featureConfig);
    expect(applied.model).toBe("utility-local");
  });

  it("does not execute Workspace A Ollama from Workspace B", () => {
    expect(decideProviderTenant({
      providerWorkspaceId: WS_A,
      executionWorkspaceId: WS_B,
      explicit: false,
    })).toBe("skip");
    expect(decideProviderTenant({
      providerWorkspaceId: WS_A,
      executionWorkspaceId: WS_B,
      explicit: true,
    })).toBe("reject");
  });
});
