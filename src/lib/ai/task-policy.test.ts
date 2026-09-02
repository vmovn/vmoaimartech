import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AIError } from "./errors";
import { getAIProvider, isActiveAiProviderKind, listProviderKinds } from "./registry.server";
import { BYOK_PROVIDER_KINDS, decideCredentialSource } from "./provider-credentials.server";
import { PLATFORM_UTILITY_FEATURES, platformManagedProviderConfig } from "./platform-ollama";
import type { AIProviderRecord } from "./types";
import {
  AI_TASK_POLICIES,
  PLATFORM_LOCAL_TASK_IDS,
  getTaskPolicy,
  listAiTaskPolicies,
} from "./task-policy";
import {
  buildAiAccountingMetadata,
  conceptualCreditsToCharge,
  decideExecutionMode,
  pickProviderForTask,
  providerAllowedForTask,
} from "./execution-mode";

const WS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function provider(partial: Partial<AIProviderRecord> & Pick<AIProviderRecord, "kind" | "name">): AIProviderRecord {
  return {
    id: partial.id ?? "11111111-1111-1111-1111-111111111111",
    workspaceId: WS,
    baseUrl: null,
    apiKeySecretName: null,
    organizationId: null,
    enabled: true,
    isDefault: false,
    priority: 100,
    config: {},
    ...partial,
  };
}

const platformOllama = provider({
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
  kind: "ollama",
  name: "Platform Local AI",
  config: platformManagedProviderConfig(),
  priority: 50,
});

const platformGemini = provider({
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
  kind: "gemini",
  name: "Platform Gemini",
  apiKeySecretName: "GEMINI_API_KEY",
  config: { credential_source: "platform_env" },
  isDefault: true,
  priority: 10,
});

const byokGemini = provider({
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3",
  kind: "gemini",
  name: "Workspace Gemini BYOK",
  config: { credential_source: "workspace_encrypted" },
});

const platformOpenAI = provider({
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4",
  kind: "openai",
  name: "Platform OpenAI",
  apiKeySecretName: "OPENAI_API_KEY",
  config: { credential_source: "platform_env" },
});

const byokDeepSeek = provider({
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5",
  kind: "deepseek",
  name: "Workspace DeepSeek BYOK",
  config: { credential_source: "workspace_encrypted" },
});

describe("canonical AI task policy", () => {
  it("assigns a class and allowed execution modes to every catalogued task", () => {
    const policies = listAiTaskPolicies();
    expect(policies.length).toBeGreaterThan(20);
    for (const policy of policies) {
      expect(policy.taskClass).toMatch(/^(utility|premium|hybrid)$/);
      expect(policy.allowedExecutionModes.length).toBeGreaterThan(0);
      expect(policy.allowedExecutionModes).toContain(policy.defaultExecutionMode);
      expect(AI_TASK_POLICIES[policy.id]).toEqual(policy);
    }
  });

  it("limits Platform Local AI to five verified utility tasks", () => {
    expect(PLATFORM_LOCAL_TASK_IDS).toHaveLength(5);
    expect([...PLATFORM_UTILITY_FEATURES]).toEqual([...PLATFORM_LOCAL_TASK_IDS]);
    for (const id of PLATFORM_LOCAL_TASK_IDS) {
      const policy = getTaskPolicy(id);
      expect(policy.taskClass).toBe("utility");
      expect(policy.allowedExecutionModes).toEqual(["platform_local"]);
      expect(policy.defaultExecutionMode).toBe("platform_local");
    }
  });

  it("classifies user-visible premium features as credits or BYOK, defaulting to credits", () => {
    for (const id of ["reply_assistant", "sales_assistant", "chatbot", "marketing_assistant", "kb_answer"]) {
      const policy = getTaskPolicy(id);
      expect(policy.taskClass).toBe("premium");
      expect(policy.allowedExecutionModes).toEqual(["premium_credits", "workspace_byok"]);
      expect(policy.defaultExecutionMode).toBe("premium_credits");
    }
  });

  it("does not let unlisted features silently use Platform Local AI", () => {
    const unknown = getTaskPolicy("brand_new_feature");
    expect(unknown.taskClass).toBe("premium");
    expect(unknown.allowedExecutionModes).not.toContain("platform_local");
  });
});

describe("execution mode from credential ownership", () => {
  it("maps platform ENV Gemini to premium_credits without requiring BYOK", () => {
    expect(decideCredentialSource(platformGemini)).toBe("platform_env");
    expect(decideExecutionMode(platformGemini)).toBe("premium_credits");
    expect(conceptualCreditsToCharge("premium_credits")).toBeNull();
    const policy = getTaskPolicy("reply_assistant");
    expect(providerAllowedForTask(platformGemini, policy)).toBe(true);
    expect(pickProviderForTask([platformGemini], policy)?.id).toBe(platformGemini.id);
  });

  it("maps workspace Gemini BYOK to workspace_byok with zero credits", () => {
    expect(decideExecutionMode(byokGemini)).toBe("workspace_byok");
    expect(conceptualCreditsToCharge("workspace_byok")).toBe(0);
    const meta = buildAiAccountingMetadata(byokGemini, "reply_assistant");
    expect(meta.executionMode).toBe("workspace_byok");
    expect(meta.creditsToCharge).toBe(0);
    expect(meta.costOwner).toBe("workspace_api");
  });

  it("routes the same premium feature across platform and BYOK vendors without vendor branches", () => {
    const policy = getTaskPolicy("sales_assistant");
    expect(pickProviderForTask([platformGemini], policy)?.kind).toBe("gemini");
    expect(pickProviderForTask([byokGemini], policy)?.kind).toBe("gemini");
    expect(pickProviderForTask([platformOpenAI], policy)?.kind).toBe("openai");
    expect(pickProviderForTask([byokDeepSeek], policy)?.kind).toBe("deepseek");
    expect(decideExecutionMode(platformOpenAI)).toBe("premium_credits");
    expect(decideExecutionMode(byokDeepSeek)).toBe("workspace_byok");
    expect(conceptualCreditsToCharge(decideExecutionMode(byokDeepSeek))).toBe(0);
  });

  it("routes platform-local utility to Ollama and does not consume premium-credit mode", () => {
    const policy = getTaskPolicy("conversation_intelligence");
    expect(decideExecutionMode(platformOllama)).toBe("platform_local");
    expect(conceptualCreditsToCharge("platform_local")).toBe(0);
    expect(pickProviderForTask([platformOllama, platformGemini], policy)?.id).toBe(platformOllama.id);
    expect(providerAllowedForTask(platformGemini, policy)).toBe(false);
  });

  it("does not let Platform Local AI become a customer-facing fallback", () => {
    const policy = getTaskPolicy("chatbot");
    expect(pickProviderForTask([platformOllama], policy)).toBeNull();
    expect(pickProviderForTask([platformOllama, platformGemini], policy)?.id).toBe(platformGemini.id);
    expect(providerAllowedForTask(platformOllama, policy)).toBe(false);
  });

  it("still prefers Premium Credits when both platform Gemini and BYOK exist", () => {
    const picked = pickProviderForTask([byokGemini, platformGemini], getTaskPolicy("reply_assistant"));
    expect(picked?.id).toBe(platformGemini.id);
    expect(decideExecutionMode(picked!)).toBe("premium_credits");
  });
});

describe("retired AI vendors", () => {
  it("keeps Lovable and xAI out of the executable registry and create catalogs", () => {
    expect(listProviderKinds()).not.toContain("lovable");
    expect(listProviderKinds()).not.toContain("grok");
    expect(isActiveAiProviderKind("lovable")).toBe(false);
    expect(isActiveAiProviderKind("grok")).toBe(false);
    expect(isActiveAiProviderKind("gemini")).toBe(true);
    expect(BYOK_PROVIDER_KINDS).not.toContain("lovable");
    expect(BYOK_PROVIDER_KINDS).not.toContain("grok");
    const adminCatalog = readFileSync("src/lib/admin/ai-providers.functions.ts", "utf8");
    expect(adminCatalog).not.toMatch(/kind: "lovable"/);
    expect(adminCatalog).not.toMatch(/kind: "grok"/);
    expect(adminCatalog).not.toMatch(/XAI_API_KEY/);
    const byokUi = readFileSync("src/components/app/ai/ai-providers-panel.tsx", "utf8");
    expect(byokUi).not.toMatch(/id: "lovable"/);
    expect(byokUi).not.toMatch(/id: "grok"/);
    expect(() => getAIProvider("lovable")).toThrow(AIError);
    expect(() => getAIProvider("grok")).toThrow(AIError);
  });

  it("does not auto-seed Lovable AI in the canonical AI migration", () => {
    const sql = readFileSync(
      "supabase/migrations/20260717132020_0b2f4486-c6fb-4b60-a215-6b49d22989e2.sql",
      "utf8",
    );
    expect(sql).not.toMatch(/select id, 'lovable'/i);
    expect(sql).not.toMatch(/values \(new\.id, 'lovable'/i);
    expect(sql).toMatch(/return new;/);
  });

  it("does not pin vendor model ids in executable feature source", () => {
    const files = [
      "src/lib/ai/automations.functions.ts",
      "src/lib/ai/lead-qualification.functions.ts",
      "src/lib/ai/reply-assistant.functions.ts",
      "src/lib/ai/omnichannel.functions.ts",
      "src/lib/ai/intelligence.functions.ts",
      "src/lib/ai/customer-insights.functions.ts",
      "src/lib/ai/complete.functions.ts",
      "src/lib/chatbots/engines/ai-engine.ts",
      "src/lib/chatbots/engines/orchestrator.ts",
      "src/lib/chatbots/chatbots.functions.ts",
      "src/lib/widget/livechat-ai.server.ts",
      "src/lib/workflows/ai-eval.server.ts",
      "src/lib/booking/ai-scheduling.functions.ts",
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/google\/gemini-/);
      expect(src, file).not.toMatch(/openai\/gpt-/);
    }
  });
});
