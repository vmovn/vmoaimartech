import { describe, expect, it } from "vitest";
import { AIError } from "./errors";
import type { AIFeatureConfig, ChatRequest } from "./types";
import {
  applyFeatureRequestPolicy,
  assertFeatureEnabled,
  resolveFeatureProviderChain,
} from "./feature-routing";

const PROVIDER_A = "11111111-1111-1111-1111-111111111111";
const PROVIDER_B = "22222222-2222-2222-2222-222222222222";
const PROVIDER_C = "33333333-3333-3333-3333-333333333333";

function cfg(partial: Partial<AIFeatureConfig> = {}): AIFeatureConfig {
  return {
    workspaceId: "ws-1",
    feature: "conversation_intelligence",
    providerId: PROVIDER_A,
    fallbackProviderIds: [PROVIDER_B],
    model: "model-A",
    temperature: 0.4,
    maxTokens: 512,
    systemPrompt: "feature system",
    enabled: true,
    config: {},
    ...partial,
  };
}

function req(partial: Partial<ChatRequest> = {}): ChatRequest {
  return {
    model: "",
    messages: [{ role: "user", content: "hello" }],
    ...partial,
  };
}

describe("assertFeatureEnabled", () => {
  it("fails before transport when the feature is disabled", () => {
    expect(() => assertFeatureEnabled("conversation_intelligence", cfg({ enabled: false })))
      .toThrow(AIError);
    try {
      assertFeatureEnabled("conversation_intelligence", cfg({ enabled: false }));
    } catch (e) {
      expect(e).toBeInstanceOf(AIError);
      expect((e as AIError).type).toBe("validation");
      expect((e as AIError).message).toContain("disabled");
    }
  });

  it("allows missing config (workspace default path)", () => {
    expect(() => assertFeatureEnabled("conversation_intelligence", null)).not.toThrow();
  });
});

describe("resolveFeatureProviderChain", () => {
  it("uses feature provider when caller did not pick one", () => {
    const chain = resolveFeatureProviderChain({ featureConfig: cfg() });
    expect(chain.primaryProviderId).toBe(PROVIDER_A);
    expect(chain.fallbackProviderIds).toEqual([PROVIDER_B]);
  });

  it("falls through to workspace default when feature config is missing", () => {
    const chain = resolveFeatureProviderChain({ featureConfig: null });
    expect(chain.primaryProviderId).toBeNull();
    expect(chain.fallbackProviderIds).toEqual([]);
  });

  it("lets explicit primaryProviderId override the feature provider", () => {
    const chain = resolveFeatureProviderChain({
      primaryProviderId: PROVIDER_C,
      featureConfig: cfg(),
    });
    expect(chain.primaryProviderId).toBe(PROVIDER_C);
    expect(chain.fallbackProviderIds).toEqual([PROVIDER_B]);
  });

  it("honors feature fallbacks when the caller did not supply a list", () => {
    const chain = resolveFeatureProviderChain({
      featureConfig: cfg({ fallbackProviderIds: [PROVIDER_B, PROVIDER_C] }),
    });
    expect(chain.fallbackProviderIds).toEqual([PROVIDER_B, PROVIDER_C]);
  });

  it("lets an explicit fallback list override feature fallbacks, including empty", () => {
    const withList = resolveFeatureProviderChain({
      fallbackProviderIds: [PROVIDER_C],
      featureConfig: cfg(),
    });
    expect(withList.fallbackProviderIds).toEqual([PROVIDER_C]);

    const empty = resolveFeatureProviderChain({
      fallbackProviderIds: [],
      featureConfig: cfg(),
    });
    expect(empty.fallbackProviderIds).toEqual([]);
  });
});

describe("applyFeatureRequestPolicy", () => {
  it("uses the feature model when request.model is empty", () => {
    const applied = applyFeatureRequestPolicy(req({ model: "" }), cfg());
    expect(applied.model).toBe("model-A");
  });

  it("lets an explicit request.model override the feature model", () => {
    const applied = applyFeatureRequestPolicy(req({ model: "model-explicit" }), cfg());
    expect(applied.model).toBe("model-explicit");
  });

  it("leaves the request unchanged when no feature config exists", () => {
    const original = req({ model: "", temperature: 0.2 });
    expect(applyFeatureRequestPolicy(original, null)).toEqual(original);
  });

  it("fills temperature and max_tokens from config only when the caller omitted them", () => {
    const filled = applyFeatureRequestPolicy(req(), cfg());
    expect(filled.temperature).toBe(0.4);
    expect(filled.max_tokens).toBe(512);

    const kept = applyFeatureRequestPolicy(req({ temperature: 0.1, max_tokens: 99 }), cfg());
    expect(kept.temperature).toBe(0.1);
    expect(kept.max_tokens).toBe(99);
  });

  it("prepends feature system_prompt only when the caller has no system message", () => {
    const prepended = applyFeatureRequestPolicy(req(), cfg());
    expect(prepended.messages[0]).toEqual({ role: "system", content: "feature system" });

    const explicit = applyFeatureRequestPolicy(
      req({ messages: [{ role: "system", content: "caller" }, { role: "user", content: "hello" }] }),
      cfg(),
    );
    expect(explicit.messages[0]).toEqual({ role: "system", content: "caller" });
    expect(explicit.messages).toHaveLength(2);
  });
});
