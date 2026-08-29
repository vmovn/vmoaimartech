/**
 * Application-facing entrypoints. Every AI call in the app should go through
 * `aiChat` (or `aiChatByFeature`) — never call a provider adapter directly.
 *
 * Handles: provider resolution, fallback chain, credential loading, rate limit,
 * logging, cost tracking, and error mapping.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type {
  AIMessage, AIProviderRecord, AIModelRecord, AIFeatureConfig, ChatRequest, ChatResponse,
} from "./types";
import { getAIProvider, resolveCredentials } from "./registry.server";
import { AIError } from "./errors";
import { computeCost } from "./cost";
import { estimateMessageTokens } from "./tokens";
import { logAIRequest } from "./logger.server";
import { enforceAIRateLimit } from "./rate-limiter.server";
import { renderTemplate } from "./prompts";

// ---------- Record loaders ----------

async function loadProvider(providerId: string): Promise<AIProviderRecord | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("ai_providers" as never).select("*").eq("id", providerId).maybeSingle();
  return data ? mapProvider(data as never) : null;
}

async function loadDefaultProvider(workspaceId: string): Promise<AIProviderRecord | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("ai_providers" as never)
    .select("*").eq("workspace_id", workspaceId).eq("enabled", true)
    .order("is_default", { ascending: false }).order("priority", { ascending: true })
    .limit(1).maybeSingle();
  if (data) return mapProvider(data as never);
  // Auto-seed the built-in Lovable AI Gateway for this workspace so calls
  // work out of the box without manual configuration.
  const seed = await supabaseAdmin.from("ai_providers" as never).insert({
    workspace_id: workspaceId, kind: "lovable", name: "Lovable AI Gateway",
    base_url: "https://ai.gateway.lovable.dev/v1",
    api_key_secret_name: "LOVABLE_API_KEY",
    enabled: true, is_default: true, priority: 1, config: {},
  } as never).select("*").maybeSingle();
  return seed.data ? mapProvider(seed.data as never) : null;
}

async function loadModel(providerId: string, modelId: string): Promise<AIModelRecord | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("ai_models" as never)
    .select("*").eq("provider_id", providerId).eq("model_id", modelId).maybeSingle();
  return data ? mapModel(data as never) : null;
}

async function loadFeatureConfig(workspaceId: string, feature: string): Promise<AIFeatureConfig | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("ai_feature_config" as never)
    .select("*").eq("workspace_id", workspaceId).eq("feature", feature).maybeSingle();
  if (!data) return null;
  const r = data as never as Record<string, unknown>;
  return {
    workspaceId: r.workspace_id as string,
    feature: r.feature as string,
    providerId: (r.provider_id as string | null) ?? null,
    fallbackProviderIds: (r.fallback_provider_ids as string[]) ?? [],
    model: (r.model as string | null) ?? null,
    temperature: (r.temperature as number | null) ?? null,
    maxTokens: (r.max_tokens as number | null) ?? null,
    systemPrompt: (r.system_prompt as string | null) ?? null,
    enabled: (r.enabled as boolean) ?? true,
    config: ((r.config as Record<string, unknown>) ?? {}),
  };
}

function mapProvider(r: Record<string, unknown>): AIProviderRecord {
  return {
    id: r.id as string, workspaceId: r.workspace_id as string, kind: r.kind as never,
    name: r.name as string, baseUrl: (r.base_url as string | null) ?? null,
    apiKeySecretName: (r.api_key_secret_name as string | null) ?? null,
    organizationId: (r.organization_id as string | null) ?? null,
    enabled: r.enabled as boolean, isDefault: r.is_default as boolean,
    priority: (r.priority as number) ?? 100,
    config: ((r.config as Record<string, unknown>) ?? {}),
  };
}
function mapModel(r: Record<string, unknown>): AIModelRecord {
  return {
    id: r.id as string, providerId: r.provider_id as string, modelId: r.model_id as string,
    displayName: r.display_name as string,
    capabilities: ((r.capabilities as Record<string, boolean>) ?? {}),
    contextWindow: (r.context_window as number | null) ?? null,
    maxOutputTokens: (r.max_output_tokens as number | null) ?? null,
    inputCostPer1k: Number(r.input_cost_per_1k ?? 0),
    outputCostPer1k: Number(r.output_cost_per_1k ?? 0),
    enabled: r.enabled as boolean, isDefault: r.is_default as boolean,
  };
}

// ---------- Core call ----------

interface RunOpts {
  workspaceId: string;
  userId?: string | null;
  feature?: string | null;
  request: ChatRequest;
  primaryProviderId?: string | null;
  fallbackProviderIds?: string[];
  rateLimitPerMin?: number;
}

async function callWithProvider(provider: AIProviderRecord, req: ChatRequest): Promise<ChatResponse> {
  const impl = getAIProvider(provider.kind);
  const creds = resolveCredentials(provider);
  return impl.chat(req, creds);
}

export async function runChat(opts: RunOpts): Promise<ChatResponse & { providerId: string; providerKind: string }> {
  const chain: string[] = [];
  if (opts.primaryProviderId) chain.push(opts.primaryProviderId);
  for (const id of opts.fallbackProviderIds ?? []) if (!chain.includes(id)) chain.push(id);

  // Fall back to workspace default if nothing was configured.
  if (chain.length === 0) {
    const def = await loadDefaultProvider(opts.workspaceId);
    if (!def) throw new AIError("not_found", "No AI provider configured for this workspace");
    chain.push(def.id);
  }

  let lastError: AIError | Error | null = null;
  for (const providerId of chain) {
    const provider = await loadProvider(providerId);
    if (!provider || !provider.enabled) continue;

    await enforceAIRateLimit({
      workspaceId: opts.workspaceId, userId: opts.userId ?? null,
      providerId: provider.id, feature: opts.feature ?? null,
      limit: opts.rateLimitPerMin ?? 120,
    });

    const start = Date.now();
    try {
      const res = await callWithProvider(provider, opts.request);
      const model = await loadModel(provider.id, opts.request.model).catch(() => null);
      const usage = res.usage ?? {
        prompt_tokens: estimateMessageTokens(opts.request.messages),
        completion_tokens: Math.ceil((res.content?.length ?? 0) / 4),
        total_tokens: 0,
      };
      usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
      const cost = computeCost(model, usage);
      await logAIRequest({
        workspaceId: opts.workspaceId, userId: opts.userId, providerId: provider.id,
        providerKind: provider.kind, model: opts.request.model, operation: "chat",
        feature: opts.feature, status: "success", latencyMs: Date.now() - start,
        usage, costUsd: cost, requestPreview: { messages: opts.request.messages.slice(-3) },
        responsePreview: { content: res.content?.slice(0, 800) },
      });
      return { ...res, usage, providerId: provider.id, providerKind: provider.kind };
    } catch (e) {
      const err = e as AIError | Error;
      lastError = err;
      const aiErr = err instanceof AIError ? err : null;
      await logAIRequest({
        workspaceId: opts.workspaceId, userId: opts.userId, providerId: provider.id,
        providerKind: provider.kind, model: opts.request.model, operation: "chat",
        feature: opts.feature,
        status: aiErr?.type === "rate_limit" ? "rate_limited"
          : aiErr?.type === "timeout" ? "timeout" : "error",
        httpStatus: aiErr?.httpStatus, latencyMs: Date.now() - start,
        errorType: aiErr?.type, errorMessage: err.message,
      });
      // Only fall through for retryable errors.
      if (aiErr && !aiErr.retryable) throw aiErr;
    }
  }
  throw lastError ?? new AIError("unknown", "All providers failed");
}

// ---------- Public server functions ----------

const chatInput = z.object({
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.string(),
    name: z.string().optional(),
    tool_call_id: z.string().optional(),
  })),
  model: z.string().optional(),
  providerId: z.string().uuid().optional(),
  feature: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(32_000).optional(),
  response_format: z.enum(["text", "json_object"]).optional(),
  system: z.string().optional(),
  variables: z.record(z.unknown()).optional(),
});

export interface AIChatResult {
  content: string;
  model: string;
  finishReason: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  providerId: string;
  providerKind: string;
  toolCalls: string; // JSON-encoded array (unknown args aren't serializable directly)
}

async function getWorkspaceId(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("workspace_members")
    .select("workspace_id").eq("user_id", userId).limit(1).maybeSingle();
  if (!data) throw new Error("No workspace found for current user");
  return (data as { workspace_id: string }).workspace_id;
}

export const aiChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => chatInput.parse(v))
  .handler(async ({ data, context }): Promise<AIChatResult> => {
    const userId = context.userId;
    const workspaceId = await getWorkspaceId(userId);

    // Optional feature config
    let featureCfg: AIFeatureConfig | null = null;
    if (data.feature) featureCfg = await loadFeatureConfig(workspaceId, data.feature);
    if (featureCfg && !featureCfg.enabled) throw new AIError("validation", `Feature ${data.feature} disabled`);

    const systemContent = data.system ?? featureCfg?.systemPrompt ?? undefined;
    const messages: AIMessage[] = [];
    if (systemContent) messages.push({ role: "system", content: renderTemplate(systemContent, data.variables ?? {}) });
    for (const m of data.messages) {
      messages.push({ ...m, content: renderTemplate(m.content, data.variables ?? {}) });
    }

    const providerId = data.providerId ?? featureCfg?.providerId ?? null;
    const fallbacks = featureCfg?.fallbackProviderIds ?? [];

    // Pick model: request → feature config → provider default → gemini flash
    let model = data.model ?? featureCfg?.model ?? "";
    if (!model) {
      const p = providerId ? await loadProvider(providerId) : await loadDefaultProvider(workspaceId);
      if (p) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: mrow } = await supabaseAdmin.from("ai_models" as never)
          .select("model_id")
          .eq("provider_id", p.id).eq("enabled", true)
          .order("is_default", { ascending: false }).limit(1).maybeSingle();
        model = (mrow as { model_id?: string } | null)?.model_id ?? "google/gemini-3-flash-preview";
      } else {
        model = "google/gemini-3-flash-preview";
      }
    }

    const req: ChatRequest = {
      model, messages,
      temperature: data.temperature ?? featureCfg?.temperature ?? undefined,
      max_tokens: data.max_tokens ?? featureCfg?.maxTokens ?? undefined,
      response_format: data.response_format,
    };

    const res = await runChat({
      workspaceId, userId, feature: data.feature ?? null,
      request: req, primaryProviderId: providerId, fallbackProviderIds: fallbacks,
    });
    return {
      content: res.content,
      model: res.model,
      finishReason: res.finish_reason ?? "stop",
      promptTokens: res.usage?.prompt_tokens ?? 0,
      completionTokens: res.usage?.completion_tokens ?? 0,
      totalTokens: res.usage?.total_tokens ?? 0,
      providerId: res.providerId,
      providerKind: res.providerKind,
      toolCalls: JSON.stringify(res.tool_calls ?? []),
    };
  });
