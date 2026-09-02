/**
 * Application-facing entrypoints. Every AI call in the app should go through
 * `runChat` / `runEmbed` (or the `aiChat` server function) — never call a
 * provider adapter directly.
 *
 * `runChat` owns feature routing: when `feature` is set it loads
 * `ai_feature_config` for (workspace_id, feature) and applies provider /
 * fallback / model / parameter policy. Explicit caller selections win.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type {
  AIMessage, AIProviderRecord, AIModelRecord, AIFeatureConfig, ChatRequest, ChatResponse,
  EmbedResponse,
} from "./types";
import { getAIProvider, isActiveAiProviderKind } from "./registry.server";
import { resolveProviderCredentials } from "./provider-credentials.server";
import { AIError } from "./errors";
import { computeCost } from "./cost";
import { estimateMessageTokens } from "./tokens";
import { logAIRequest } from "./logger.server";
import { enforceAIRateLimit } from "./rate-limiter.server";
import { renderTemplate } from "./prompts";
import {
  applyFeatureRequestPolicy,
  assertFeatureEnabled,
  resolveFeatureProviderChain,
} from "./feature-routing";
import { assertProviderTenant, modelBelongsToProvider } from "./provider-tenant";
import { readActiveWorkspaceHeader, resolveCallerWorkspaceId, type AuthRpcClient } from "./workspace-auth";
import { platformOllamaRateLimitPerMin } from "./platform-ollama";
import { getTaskPolicy } from "./task-policy";
import {
  buildAiAccountingMetadata,
  missingProviderForTaskError,
  pickProviderForTask,
  providerAllowedForTask,
} from "./execution-mode";

// ---------- Record loaders ----------

async function loadProvider(providerId: string): Promise<AIProviderRecord | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("ai_providers" as never).select("*").eq("id", providerId).maybeSingle();
  return data ? mapProvider(data as never) : null;
}

async function loadEnabledProviders(workspaceId: string): Promise<AIProviderRecord[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("ai_providers" as never)
    .select("*").eq("workspace_id", workspaceId).eq("enabled", true)
    .order("is_default", { ascending: false }).order("priority", { ascending: true });
  return ((data ?? []) as Record<string, unknown>[]).map((row) => mapProvider(row));
}

async function loadModel(providerId: string, modelId: string): Promise<AIModelRecord | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("ai_models" as never)
    .select("*").eq("provider_id", providerId).eq("model_id", modelId).maybeSingle();
  return data ? mapModel(data as never) : null;
}

async function loadDefaultModelId(providerId: string, capability?: "embed"): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin.from("ai_models" as never)
    .select("model_id")
    .eq("provider_id", providerId)
    .eq("enabled", true);
  if (capability) query = query.contains("capabilities", { [capability]: true });
  const { data } = await query
    .order("is_default", { ascending: false })
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { model_id?: string } | null)?.model_id ?? null;
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
  /** Used only when injecting ai_feature_config.system_prompt (aiChat templates). */
  promptVariables?: Record<string, unknown>;
}

async function callWithProvider(
  provider: AIProviderRecord,
  req: ChatRequest,
  executionWorkspaceId: string,
): Promise<ChatResponse> {
  const impl = getAIProvider(provider.kind);
  const creds = await resolveProviderCredentials(provider, executionWorkspaceId);
  return impl.chat(req, creds);
}

function explicitProviderIds(opts: {
  primaryProviderId?: string | null;
  fallbackProviderIds?: string[];
}): Set<string> {
  const ids = new Set<string>();
  if (opts.primaryProviderId) ids.add(opts.primaryProviderId);
  if (opts.fallbackProviderIds) for (const id of opts.fallbackProviderIds) ids.add(id);
  return ids;
}

function takeProviderForWorkspace(
  provider: AIProviderRecord | null,
  workspaceId: string,
  explicit: boolean,
): AIProviderRecord | null {
  if (!provider || !provider.enabled) return null;
  if (!assertProviderTenant({
    providerWorkspaceId: provider.workspaceId,
    executionWorkspaceId: workspaceId,
    explicit,
  })) return null;
  return provider;
}

export async function runChat(opts: RunOpts): Promise<ChatResponse & { providerId: string; providerKind: string }> {
  let featureCfg: AIFeatureConfig | null = null;
  if (opts.feature) {
    featureCfg = await loadFeatureConfig(opts.workspaceId, opts.feature);
    assertFeatureEnabled(opts.feature, featureCfg);
  }

  const chainIds = resolveFeatureProviderChain({
    primaryProviderId: opts.primaryProviderId,
    fallbackProviderIds: opts.fallbackProviderIds,
    featureConfig: featureCfg,
  });
  const request = applyFeatureRequestPolicy(
    opts.request,
    featureCfg,
    opts.promptVariables ?? {},
  );

  const chain: string[] = [];
  if (chainIds.primaryProviderId) chain.push(chainIds.primaryProviderId);
  for (const id of chainIds.fallbackProviderIds) if (!chain.includes(id)) chain.push(id);
  const explicitIds = explicitProviderIds(opts);

  const policy = getTaskPolicy(opts.feature);

  // Workspace default only when the feature has no explicit routing.
  if (chain.length === 0) {
    const picked = pickProviderForTask(await loadEnabledProviders(opts.workspaceId), policy);
    if (!picked) throw missingProviderForTaskError(policy);
    chain.push(picked.id);
  }

  let lastError: AIError | Error | null = null;
  let skippedDisallowed = false;
  for (const providerId of chain) {
    const loaded = await loadProvider(providerId);
    const provider = takeProviderForWorkspace(
      loaded,
      opts.workspaceId,
      explicitIds.has(providerId),
    );
    if (!provider) continue;
    if (!isActiveAiProviderKind(provider.kind) || !providerAllowedForTask(provider, policy)) {
      skippedDisallowed = true;
      continue;
    }

    await enforceAIRateLimit({
      workspaceId: opts.workspaceId, userId: opts.userId ?? null,
      providerId: provider.id, feature: opts.feature ?? null,
      limit: opts.rateLimitPerMin ?? platformOllamaRateLimitPerMin(provider),
    });

    const start = Date.now();
    const accounting = buildAiAccountingMetadata(provider, opts.feature);
    try {
      const modelId = request.model || await loadDefaultModelId(provider.id);
      if (!modelId) {
        throw new AIError("not_found", `No AI model configured for provider "${provider.name}"`, {
          providerKind: provider.kind,
        });
      }
      const resolvedRequest = { ...request, model: modelId };
      const res = await callWithProvider(provider, resolvedRequest, opts.workspaceId);
      const model = await loadModel(provider.id, modelId).catch(() => null);
      if (model && !modelBelongsToProvider(model.providerId, provider.id)) {
        throw new AIError("auth", "AI model does not belong to the resolved provider");
      }
      const usage = res.usage ?? {
        prompt_tokens: estimateMessageTokens(request.messages),
        completion_tokens: Math.ceil((res.content?.length ?? 0) / 4),
        total_tokens: 0,
      };
      usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
      const cost = computeCost(model, usage);
      await logAIRequest({
        workspaceId: opts.workspaceId, userId: opts.userId, providerId: provider.id,
        providerKind: provider.kind, model: modelId, operation: "chat",
        feature: opts.feature, status: "success", latencyMs: Date.now() - start,
        usage, costUsd: cost, requestPreview: { messages: request.messages.slice(-3) },
        responsePreview: { content: res.content?.slice(0, 800) },
        metadata: accounting,
      });
      return { ...res, usage, providerId: provider.id, providerKind: provider.kind };
    } catch (e) {
      const err = e as AIError | Error;
      lastError = err;
      const aiErr = err instanceof AIError ? err : null;
      await logAIRequest({
        workspaceId: opts.workspaceId, userId: opts.userId, providerId: provider.id,
        providerKind: provider.kind, model: request.model, operation: "chat",
        feature: opts.feature,
        status: aiErr?.type === "rate_limit" ? "rate_limited"
          : aiErr?.type === "timeout" ? "timeout" : "error",
        httpStatus: aiErr?.httpStatus, latencyMs: Date.now() - start,
        errorType: aiErr?.type, errorMessage: err.message,
        metadata: accounting,
      });
      // Only fall through for retryable errors.
      if (aiErr && !aiErr.retryable) throw aiErr;
    }
  }
  if (skippedDisallowed && !lastError) throw missingProviderForTaskError(policy);
  throw lastError ?? new AIError("unknown", "All providers failed");
}

interface RunEmbedOpts {
  workspaceId: string;
  userId?: string | null;
  feature?: string | null;
  input: string | string[];
  model?: string | null;
  primaryProviderId?: string | null;
  fallbackProviderIds?: string[];
}

export async function runEmbed(opts: RunEmbedOpts): Promise<EmbedResponse & {
  providerId: string;
  providerKind: string;
}> {
  const providers: AIProviderRecord[] = [];
  const explicitIds = explicitProviderIds(opts);
  for (const id of [opts.primaryProviderId, ...(opts.fallbackProviderIds ?? [])]) {
    if (!id || providers.some((p) => p.id === id)) continue;
    const provider = takeProviderForWorkspace(
      await loadProvider(id),
      opts.workspaceId,
      explicitIds.has(id),
    );
    if (provider) providers.push(provider);
  }
  const policy = getTaskPolicy(opts.feature);
  if (providers.length === 0) {
    const picked = pickProviderForTask(await loadEnabledProviders(opts.workspaceId), policy);
    if (picked) providers.push(picked);
  }
  const allowedProviders = providers.filter((p) => isActiveAiProviderKind(p.kind) && providerAllowedForTask(p, policy));
  if (allowedProviders.length === 0) {
    throw missingProviderForTaskError(policy);
  }

  let lastError: Error | null = null;
  for (const provider of allowedProviders) {
    const impl = getAIProvider(provider.kind);
    if (!impl.embed || !impl.capabilities().embed) {
      lastError = new AIError("validation", `Provider "${provider.name}" does not support embeddings`, {
        providerKind: provider.kind,
      });
      continue;
    }
    const model = opts.model
      || (typeof provider.config.embedding_model === "string" ? provider.config.embedding_model : null)
      || await loadDefaultModelId(provider.id, "embed");
    if (!model) {
      lastError = new AIError("not_found", `No embedding model configured for provider "${provider.name}"`, {
        providerKind: provider.kind,
      });
      continue;
    }
    try {
      const response = await impl.embed(
        { model, input: opts.input },
        await resolveProviderCredentials(provider, opts.workspaceId),
      );
      return { ...response, providerId: provider.id, providerKind: provider.kind };
    } catch (error) {
      lastError = error as Error;
    }
  }
  throw lastError ?? new AIError("validation", "No configured AI provider supports embeddings");
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
  workspaceId: z.string().uuid().optional(),
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


export const aiChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => chatInput.parse(v))
  .handler(async ({ data, context }): Promise<AIChatResult> => {
    const userId = context.userId;
    const workspaceId = await resolveCallerWorkspaceId({
      supabase: context.supabase as unknown as AuthRpcClient,
      userId,
      requestedWorkspaceId: data.workspaceId,
      headerWorkspaceId: readActiveWorkspaceHeader(),
    });
    const variables = data.variables ?? {};

    const messages: AIMessage[] = [];
    if (data.system) {
      messages.push({ role: "system", content: renderTemplate(data.system, variables) });
    }
    for (const m of data.messages) {
      messages.push({ ...m, content: renderTemplate(m.content, variables) });
    }

    const req: ChatRequest = {
      model: data.model ?? "",
      messages,
      temperature: data.temperature,
      max_tokens: data.max_tokens,
      response_format: data.response_format,
    };

    const res = await runChat({
      workspaceId,
      userId,
      feature: data.feature ?? null,
      request: req,
      primaryProviderId: data.providerId,
      promptVariables: variables,
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
