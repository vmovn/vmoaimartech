/**
 * Super Admin — AI Provider management.
 *
 * Authorization contract (Phase 2):
 * - Super Admin: platform provider management, including any workspace row.
 * - Workspace Owner/Admin: their workspace providers/feature routing via
 *   `src/lib/ai/config.functions.ts` (not this module).
 * - Member: invoke AI; read safe settings; never manage credentials.
 *
 * This module does not expose API-key values. Rows store env secret names only.
 *
 * Authorization: every handler verifies the caller's platform role through the
 * caller's own RLS-scoped client BEFORE `supabaseAdmin` is imported.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenantAccess } from "@/lib/auth/tenant-auth";
import { z } from "zod";
import type { AIProviderKind } from "@/lib/ai/types";
import {
  platformManagedProviderConfig,
  resolveOllamaBaseUrl,
} from "@/lib/ai/platform-ollama";
import { ensurePlatformOllamaForWorkspace } from "@/lib/ai/platform-ollama.functions";

/* -------------------------------------------------------------------------- */
/* Guards                                                                     */
/* -------------------------------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertPlatformStaff(supabase: any, userId: string): Promise<"superadmin" | "support"> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["superadmin", "support"]);
  if (error) throw new Error("Unable to verify platform role");
  if (!data || data.length === 0) throw new Error("Forbidden: platform staff only");
  return (data.some((r: { role: string }) => r.role === "superadmin") ? "superadmin" : "support") as
    | "superadmin"
    | "support";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertSuperAdmin(supabase: any, userId: string) {
  const role = await assertPlatformStaff(supabase, userId);
  if (role !== "superadmin") throw new Error("Forbidden: superadmin role required for this action");
}

/* -------------------------------------------------------------------------- */
/* Static catalog (kinds + suggested models)                                  */
/* -------------------------------------------------------------------------- */

export type ProviderKindInfo = {
  kind: AIProviderKind;
  label: string;
  defaultBaseUrl: string;
  requiresKey: boolean;
  suggestedSecretName: string;
  models: { modelId: string; displayName: string }[];
};

const LOVABLE_MODELS = [
  ["google/gemini-3.6-flash", "Gemini 3.6 Flash"],
  ["google/gemini-3.5-flash", "Gemini 3.5 Flash"],
  ["google/gemini-3.1-flash-lite", "Gemini 3.1 Flash Lite"],
  ["google/gemini-3.1-pro-preview", "Gemini 3.1 Pro (preview)"],
  ["google/gemini-2.5-pro", "Gemini 2.5 Pro"],
  ["google/gemini-2.5-flash", "Gemini 2.5 Flash"],
  ["openai/gpt-5.5", "GPT-5.5"],
  ["openai/gpt-5.4-mini", "GPT-5.4 Mini"],
  ["openai/gpt-5.6-terra", "GPT-5.6 Terra"],
] as const;

export const PROVIDER_KINDS: ProviderKindInfo[] = [
  {
    kind: "lovable",
    label: "Lovable AI Gateway",
    defaultBaseUrl: "https://ai.gateway.lovable.dev/v1",
    requiresKey: true,
    suggestedSecretName: "LOVABLE_API_KEY",
    models: LOVABLE_MODELS.map(([modelId, displayName]) => ({ modelId, displayName })),
  },
  {
    kind: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    requiresKey: true,
    suggestedSecretName: "OPENAI_API_KEY",
    models: [],
  },
  {
    kind: "anthropic",
    label: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    requiresKey: true,
    suggestedSecretName: "ANTHROPIC_API_KEY",
    models: [],
  },
  {
    kind: "gemini",
    label: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    requiresKey: true,
    suggestedSecretName: "GEMINI_API_KEY",
    models: [],
  },
  {
    kind: "deepseek",
    label: "DeepSeek",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    requiresKey: true,
    suggestedSecretName: "DEEPSEEK_API_KEY",
    models: [],
  },
  {
    kind: "grok",
    label: "xAI Grok",
    defaultBaseUrl: "https://api.x.ai/v1",
    requiresKey: true,
    suggestedSecretName: "XAI_API_KEY",
    models: [],
  },
  {
    kind: "openrouter",
    label: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    requiresKey: true,
    suggestedSecretName: "OPENROUTER_API_KEY",
    models: [],
  },
  {
    kind: "ollama",
    label: "Ollama (self-hosted)",
    defaultBaseUrl: "",
    requiresKey: false,
    suggestedSecretName: "",
    models: [],
  },
  {
    kind: "lmstudio",
    label: "LM Studio (self-hosted)",
    defaultBaseUrl: "http://localhost:1234/v1",
    requiresKey: false,
    suggestedSecretName: "",
    models: [],
  },
  {
    kind: "custom_openai",
    label: "Custom (OpenAI-compatible)",
    defaultBaseUrl: "",
    requiresKey: true,
    suggestedSecretName: "CUSTOM_AI_API_KEY",
    models: [],
  },
];

const KIND_VALUES = PROVIDER_KINDS.map((k) => k.kind) as [AIProviderKind, ...AIProviderKind[]];

/* -------------------------------------------------------------------------- */
/* Targets (workspaces + kinds)                                               */
/* -------------------------------------------------------------------------- */

export type AiProviderTargets = {
  workspaces: { id: string; name: string; organizationName: string | null }[];
  kinds: ProviderKindInfo[];
};

export const listAiProviderTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .handler(async ({ context }): Promise<AiProviderTargets> => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("workspaces")
      .select("id, name, organizations(name)")
      .order("created_at", { ascending: true })
      .limit(500);
    const rows = (data ?? []) as unknown as {
      id: string;
      name: string;
      organizations: { name: string } | { name: string }[] | null;
    }[];
    return {
      workspaces: rows.map((r) => ({
        id: r.id,
        name: r.name,
        organizationName: Array.isArray(r.organizations)
          ? (r.organizations[0]?.name ?? null)
          : (r.organizations?.name ?? null),
      })),
      kinds: PROVIDER_KINDS,
    };
  });

/* -------------------------------------------------------------------------- */
/* Create / update / delete                                                   */
/* -------------------------------------------------------------------------- */

const providerInput = z.object({
  id: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  applyToAllWorkspaces: z.boolean().optional(),
  kind: z.enum(KIND_VALUES),
  name: z.string().min(1).max(120),
  baseUrl: z.string().max(300).optional().nullable(),
  apiKeySecretName: z.string().max(256).optional().nullable(),
  organizationId: z.string().max(200).optional().nullable(),
  enabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  priority: z.number().int().min(1).max(1000).default(100),
});

export const savePlatformAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((v: unknown) => providerInput.parse(v))
  .handler(async ({ data, context }): Promise<{ ok: true; ids: string[] }> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.kind === "ollama" && !data.id) {
      let workspaceIds: string[] = [];
      if (data.applyToAllWorkspaces) {
        const { data: ws } = await supabaseAdmin.from("workspaces").select("id").limit(1000);
        workspaceIds = ((ws ?? []) as { id: string }[]).map((w) => w.id);
      } else {
        if (!data.workspaceId) throw new Error("Select a workspace");
        workspaceIds = [data.workspaceId];
      }
      const ids: string[] = [];
      for (const workspaceId of workspaceIds) {
        const result = await ensurePlatformOllamaForWorkspace(supabaseAdmin, workspaceId);
        if (!result.ok || !result.providerId) {
          throw new Error(
            "Ollama base URL is not configured. Set OLLAMA_BASE_URL to the internal service URL.",
          );
        }
        ids.push(result.providerId);
      }
      return { ok: true, ids };
    }

    const kindInfo = PROVIDER_KINDS.find((k) => k.kind === data.kind)!;
    const ollamaUrl = data.kind === "ollama"
      ? resolveOllamaBaseUrl({
          recordBaseUrl: data.baseUrl,
          config: platformManagedProviderConfig(),
        })
      : null;
    const baseUrl = (ollamaUrl
      || data.baseUrl?.trim()
      || kindInfo.defaultBaseUrl
      || null) as string | null;
    const secretName = data.kind === "ollama" ? null : (data.apiKeySecretName?.trim() || null);
    const ollamaConfig = data.kind === "ollama" ? platformManagedProviderConfig() : {};

    const base = {
      kind: data.kind,
      name: data.name.trim(),
      base_url: baseUrl,
      api_key_secret_name: secretName,
      organization_id: data.organizationId?.trim() || null,
      enabled: data.enabled,
      is_default: data.kind === "ollama" ? false : data.isDefault,
      priority: data.priority,
      ...(data.kind === "ollama" ? { config: ollamaConfig } : {}),
    };

    // Update path
    if (data.id) {
      const { data: row, error } = await supabaseAdmin
        .from("ai_providers" as never)
        .update(base as never)
        .eq("id", data.id)
        .select("id, workspace_id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      const updated = row as unknown as { id: string; workspace_id: string } | null;
      if (!updated) throw new Error("Provider not found");
      if (base.is_default) await clearOtherDefaults(updated.workspace_id, updated.id);
      return { ok: true, ids: [updated.id] };
    }

    // Create path — one workspace, or fan out to all workspaces
    let workspaceIds: string[] = [];
    if (data.applyToAllWorkspaces) {
      const { data: ws } = await supabaseAdmin.from("workspaces").select("id").limit(1000);
      workspaceIds = ((ws ?? []) as { id: string }[]).map((w) => w.id);
    } else {
      if (!data.workspaceId) throw new Error("Select a workspace");
      workspaceIds = [data.workspaceId];
    }

    const ids: string[] = [];
    for (const workspaceId of workspaceIds) {
      const { data: row, error } = await supabaseAdmin
        .from("ai_providers" as never)
        .insert({ ...base, workspace_id: workspaceId, config: ollamaConfig } as never)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      const created = row as unknown as { id: string } | null;
      if (created) {
        ids.push(created.id);
        if (base.is_default) await clearOtherDefaults(workspaceId, created.id);
      }
    }
    return { ok: true, ids };
  });

async function clearOtherDefaults(workspaceId: string, keepId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("ai_providers" as never)
    .update({ is_default: false } as never)
    .eq("workspace_id", workspaceId)
    .neq("id", keepId);
}

export const deletePlatformAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("ai_models" as never).delete().eq("provider_id", data.id);
    const { error } = await supabaseAdmin.from("ai_providers" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/* Models                                                                     */
/* -------------------------------------------------------------------------- */

export type PlatformAiModelRow = {
  id: string;
  modelId: string;
  displayName: string;
  enabled: boolean;
  isDefault: boolean;
};

export const listPlatformAiModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((v: unknown) => z.object({ providerId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<PlatformAiModelRow[]> => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("ai_models" as never)
      .select("id, model_id, display_name, enabled, is_default")
      .eq("provider_id", data.providerId)
      .order("is_default", { ascending: false })
      .order("model_id", { ascending: true });
    return ((rows ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      modelId: r.model_id as string,
      displayName: (r.display_name as string) ?? (r.model_id as string),
      enabled: Boolean(r.enabled),
      isDefault: Boolean(r.is_default),
    }));
  });

/**
 * Pull the provider's live model list (or the curated catalog for the Lovable
 * gateway, which does not expose /models) and upsert it into `ai_models`.
 */
export const syncPlatformProviderModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((v: unknown) => z.object({ providerId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<{ ok: true; count: number; source: string }> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getAIProvider, resolveCredentials } = await import("@/lib/ai/registry.server");

    const { data: row } = await supabaseAdmin
      .from("ai_providers" as never)
      .select("*")
      .eq("id", data.providerId)
      .maybeSingle();
    const p = row as unknown as Record<string, unknown> | null;
    if (!p) throw new Error("Provider not found");

    const kind = p.kind as AIProviderKind;
    const kindInfo = PROVIDER_KINDS.find((k) => k.kind === kind);

    let discovered: { id: string; name?: string }[] = [];
    let source = "catalog";
    try {
      const impl = getAIProvider(kind);
      const creds = resolveCredentials({
        id: p.id as string,
        workspaceId: p.workspace_id as string,
        kind,
        name: p.name as string,
        baseUrl: (p.base_url as string | null) ?? null,
        apiKeySecretName: (p.api_key_secret_name as string | null) ?? null,
        organizationId: (p.organization_id as string | null) ?? null,
        enabled: Boolean(p.enabled),
        isDefault: Boolean(p.is_default),
        priority: (p.priority as number) ?? 100,
        config: (p.config as Record<string, unknown>) ?? {},
      });
      discovered = (await impl.listModels?.(creds)) ?? [];
      if (discovered.length > 0) source = "provider";
    } catch {
      discovered = [];
    }

    if (discovered.length === 0 && kindInfo && kindInfo.models.length > 0) {
      discovered = kindInfo.models.map((m) => ({ id: m.modelId, name: m.displayName }));
    }
    if (discovered.length === 0) {
      throw new Error("No models returned by this provider. Check the API key secret and base URL.");
    }

    const { data: existing } = await supabaseAdmin
      .from("ai_models" as never)
      .select("id, model_id, is_default")
      .eq("provider_id", data.providerId);
    const existingRows = (existing ?? []) as unknown as { model_id: string; is_default: boolean }[];
    const known = new Set(existingRows.map((r) => r.model_id));
    const hasDefault = existingRows.some((r) => r.is_default);

    const toInsert = discovered
      .filter((m) => !known.has(m.id))
      .slice(0, 200)
      .map((m, i) => ({
        provider_id: data.providerId,
        model_id: m.id,
        display_name: m.name ?? m.id,
        capabilities: { chat: true },
        enabled: true,
        is_default: !hasDefault && i === 0,
      }));

    if (toInsert.length > 0) {
      const { error } = await supabaseAdmin.from("ai_models" as never).insert(toInsert as never);
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: toInsert.length, source };
  });

export const setPlatformAiModelState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((v: unknown) =>
    z
      .object({
        modelRowId: z.string().uuid(),
        enabled: z.boolean().optional(),
        isDefault: z.boolean().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {};
    if (typeof data.enabled === "boolean") patch.enabled = data.enabled;
    if (typeof data.isDefault === "boolean") patch.is_default = data.isDefault;
    const { data: row, error } = await supabaseAdmin
      .from("ai_models" as never)
      .update(patch as never)
      .eq("id", data.modelRowId)
      .select("id, provider_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const updated = row as unknown as { id: string; provider_id: string } | null;
    if (updated && data.isDefault) {
      await supabaseAdmin
        .from("ai_models" as never)
        .update({ is_default: false } as never)
        .eq("provider_id", updated.provider_id)
        .neq("id", updated.id);
    }
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/* Test / verify                                                              */
/* -------------------------------------------------------------------------- */

export type ProviderTestResult = {
  ok: boolean;
  latencyMs: number;
  model: string | null;
  reply: string | null;
  error: string | null;
};

/**
 * End-to-end smoke test: runs a real completion through the SAME `runChat`
 * pipeline the whole app uses (credentials, rate limit, logging, cost).
 */
export const testPlatformAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((v: unknown) =>
    z.object({ providerId: z.string().uuid(), model: z.string().max(200).optional() }).parse(v),
  )
  .handler(async ({ data, context }): Promise<ProviderTestResult> => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runChat } = await import("@/lib/ai/complete.functions");

    const { data: row } = await supabaseAdmin
      .from("ai_providers" as never)
      .select("id, workspace_id, kind")
      .eq("id", data.providerId)
      .maybeSingle();
    const p = row as unknown as { id: string; workspace_id: string; kind: string } | null;
    if (!p) throw new Error("Provider not found");

    let model = data.model?.trim() || "";
    if (!model) {
      const { data: m } = await supabaseAdmin
        .from("ai_models" as never)
        .select("model_id")
        .eq("provider_id", p.id)
        .eq("enabled", true)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      model =
        (m as { model_id?: string } | null)?.model_id ??
        (p.kind === "lovable" ? "google/gemini-3.5-flash" : "");
    }
    if (!model) {
      return {
        ok: false,
        latencyMs: 0,
        model: null,
        reply: null,
        error: "No model configured. Sync the model catalog first.",
      };
    }

    const start = Date.now();
    try {
      const res = await runChat({
        workspaceId: p.workspace_id,
        userId: context.userId,
        feature: "platform_provider_test",
        request: {
          model,
          messages: [{ role: "user", content: "Reply with exactly: OK" }],
          max_tokens: 256,
          temperature: 0,
        },
        primaryProviderId: p.id,
      });
      return {
        ok: true,
        latencyMs: Date.now() - start,
        model: res.model || model,
        reply: (res.content ?? "").trim().slice(0, 200) || "(empty response)",
        error: null,
      };
    } catch (e) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        model,
        reply: null,
        error: e instanceof Error ? e.message : "Unknown error",
      };
    }
  });
