/**
 * AI Settings — workspace-level configuration for AI behavior.
 * Owner/admin only for writes; members can read.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  resolveCallerWorkspaceId,
  type AuthRpcClient,
} from "./workspace-auth";

export interface AiSettings {
  workspace_id: string;
  default_provider_id: string | null;
  default_model: string | null;
  temperature: number;
  max_tokens: number;
  organization_prompt: string | null;
  workspace_prompt: string | null;
  system_prompt: string | null;
  allowed_roles: string[];
  daily_request_limit: number | null;
  monthly_request_limit: number | null;
  daily_token_limit: number | null;
  monthly_token_limit: number | null;
  monthly_cost_limit_usd: number | null;
  per_user_daily_limit: number | null;
  moderation_enabled: boolean;
  moderation_blocklist: string[];
  moderation_categories: string[];
  redact_pii: boolean;
  log_prompts: boolean;
  log_responses: boolean;
  retention_days: number;
  audit_enabled: boolean;
  training_opt_out: boolean;
  config: Record<string, any>;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiSettingsQuotaUsage {
  todayRequests: number;
  todayTokens: number;
  todayCostUsd: number;
  monthRequests: number;
  monthTokens: number;
  monthCostUsd: number;
}

const DEFAULTS: Omit<AiSettings, "workspace_id" | "created_at" | "updated_at"> = {
  default_provider_id: null,
  default_model: null,
  temperature: 0.7,
  max_tokens: 1024,
  organization_prompt: null,
  workspace_prompt: null,
  system_prompt: null,
  allowed_roles: ["owner", "admin", "member"],
  daily_request_limit: null,
  monthly_request_limit: null,
  daily_token_limit: null,
  monthly_token_limit: null,
  monthly_cost_limit_usd: null,
  per_user_daily_limit: null,
  moderation_enabled: true,
  moderation_blocklist: [],
  moderation_categories: ["hate", "sexual", "violence", "self_harm"],
  redact_pii: true,
  log_prompts: true,
  log_responses: true,
  retention_days: 90,
  audit_enabled: true,
  training_opt_out: true,
  config: {},
  updated_by: null,
};

/** Read settings (auto-creates row of defaults on first read). */
export const getAiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<AiSettings> => {
    await resolveCallerWorkspaceId({
      supabase: context.supabase as unknown as AuthRpcClient,
      userId: context.userId,
      requestedWorkspaceId: data.workspaceId,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = context.supabase as any;
    const existing = await db.from("ai_settings").select("*").eq("workspace_id", data.workspaceId).maybeSingle();
    if (existing.data) return existing.data as AiSettings;
    const insert = await db
      .from("ai_settings")
      .insert({ workspace_id: data.workspaceId, ...DEFAULTS })
      .select("*")
      .single();
    if (insert.error) throw new Error(insert.error.message);
    return insert.data as AiSettings;
  });

const settingsPatchSchema = z
  .object({
    default_provider_id: z.string().uuid().nullable().optional(),
    default_model: z.string().max(200).nullable().optional(),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().min(1).max(200000).optional(),
    organization_prompt: z.string().max(8000).nullable().optional(),
    workspace_prompt: z.string().max(8000).nullable().optional(),
    system_prompt: z.string().max(8000).nullable().optional(),
    allowed_roles: z.array(z.string()).max(20).optional(),
    daily_request_limit: z.number().int().min(0).nullable().optional(),
    monthly_request_limit: z.number().int().min(0).nullable().optional(),
    daily_token_limit: z.number().int().min(0).nullable().optional(),
    monthly_token_limit: z.number().int().min(0).nullable().optional(),
    monthly_cost_limit_usd: z.number().min(0).nullable().optional(),
    per_user_daily_limit: z.number().int().min(0).nullable().optional(),
    moderation_enabled: z.boolean().optional(),
    moderation_blocklist: z.array(z.string().max(200)).max(500).optional(),
    moderation_categories: z.array(z.string().max(50)).max(20).optional(),
    redact_pii: z.boolean().optional(),
    log_prompts: z.boolean().optional(),
    log_responses: z.boolean().optional(),
    retention_days: z.number().int().min(1).max(3650).optional(),
    audit_enabled: z.boolean().optional(),
    training_opt_out: z.boolean().optional(),
  })
  .strict();

export const updateAiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        patch: settingsPatchSchema,
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<AiSettings> => {
    await resolveCallerWorkspaceId({
      supabase: context.supabase as unknown as AuthRpcClient,
      userId: context.userId,
      requestedWorkspaceId: data.workspaceId,
      requireAdmin: true,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = context.supabase as any;

    // Ensure row exists
    const existing = await db.from("ai_settings").select("*").eq("workspace_id", data.workspaceId).maybeSingle();
    if (!existing.data) {
      const seed = await db
        .from("ai_settings")
        .insert({ workspace_id: data.workspaceId, ...DEFAULTS })
        .select("*")
        .single();
      if (seed.error) throw new Error(seed.error.message);
      existing.data = seed.data;
    }

    const prev = existing.data as AiSettings;
    const patch = { ...data.patch, updated_by: context.userId };
    const upd = await db
      .from("ai_settings")
      .update(patch)
      .eq("workspace_id", data.workspaceId)
      .select("*")
      .single();
    if (upd.error) throw new Error(upd.error.message);

    // Diff for audit log
    const changes: Record<string, { from: any; to: any }> = {};
    for (const [k, v] of Object.entries(data.patch)) {
      const before = (prev as any)[k];
      if (JSON.stringify(before) !== JSON.stringify(v)) {
        changes[k] = { from: before, to: v };
      }
    }
    if (Object.keys(changes).length && prev.audit_enabled) {
      await db.from("ai_audit_logs").insert({
        workspace_id: data.workspaceId,
        actor_id: context.userId,
        action: "settings.update",
        target: "ai_settings",
        changes,
      });
    }
    return upd.data as AiSettings;
  });

export const getAiQuotaUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<AiSettingsQuotaUsage> => {
    await resolveCallerWorkspaceId({
      supabase: context.supabase as unknown as AuthRpcClient,
      userId: context.userId,
      requestedWorkspaceId: data.workspaceId,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = context.supabase as any;
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 8) + "01";
    const rows = await db
      .from("ai_usage_daily")
      .select("day, requests, total_tokens, cost_usd")
      .eq("workspace_id", data.workspaceId)
      .gte("day", monthStart);
    let todayRequests = 0, todayTokens = 0, todayCost = 0;
    let monthRequests = 0, monthTokens = 0, monthCost = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (rows.data ?? []) as any[]) {
      monthRequests += r.requests || 0;
      monthTokens += Number(r.total_tokens || 0);
      monthCost += Number(r.cost_usd || 0);
      if (String(r.day).slice(0, 10) === today) {
        todayRequests += r.requests || 0;
        todayTokens += Number(r.total_tokens || 0);
        todayCost += Number(r.cost_usd || 0);
      }
    }
    return {
      todayRequests, todayTokens,
      todayCostUsd: Math.round(todayCost * 10000) / 10000,
      monthRequests, monthTokens,
      monthCostUsd: Math.round(monthCost * 10000) / 10000,
    };
  });

export interface AiAuditLogEntry {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  target: string | null;
  changes: Record<string, any> | null;
  created_at: string;
}

export const listAiAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({
      workspaceId: z.string().uuid(),
      limit: z.number().int().min(1).max(200).optional().default(50),
    }).parse(v),
  )
  .handler(async ({ data, context }): Promise<AiAuditLogEntry[]> => {
    await resolveCallerWorkspaceId({
      supabase: context.supabase as unknown as AuthRpcClient,
      userId: context.userId,
      requestedWorkspaceId: data.workspaceId,
      requireAdmin: true,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = context.supabase as any;
    const rows = await db
      .from("ai_audit_logs")
      .select("id, actor_id, action, target, changes, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = (rows.data ?? []) as any[];
    const actorIds = Array.from(new Set(list.map((r) => r.actor_id).filter(Boolean))) as string[];
    const profileMap = new Map<string, string>();
    if (actorIds.length) {
      const profs = await db.from("profiles").select("id, full_name, email").in("id", actorIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of (profs.data ?? []) as any[]) {
        profileMap.set(p.id, p.full_name || p.email || "User");
      }
    }
    return list.map((r) => ({
      id: r.id,
      actor_id: r.actor_id,
      actor_name: r.actor_id ? (profileMap.get(r.actor_id) ?? "User") : null,
      action: r.action,
      target: r.target,
      changes: r.changes,
      created_at: r.created_at,
    }));
  });

export interface AiSettingsOption {
  id: string;
  name: string;
  kind: string;
  models: { id: string; label: string }[];
}

export const listAiProviderOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<AiSettingsOption[]> => {
    await resolveCallerWorkspaceId({
      supabase: context.supabase as unknown as AuthRpcClient,
      userId: context.userId,
      requestedWorkspaceId: data.workspaceId,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = context.supabase as any;
    const provs = await db
      .from("ai_providers")
      .select("id, kind, name, enabled")
      .eq("workspace_id", data.workspaceId)
      .order("priority", { ascending: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = ((provs.data ?? []) as any[]).filter((p) => p.enabled);
    if (!list.length) return [];
    const ids = list.map((p) => p.id);
    const models = await db
      .from("ai_models")
      .select("provider_id, model_id, display_name, enabled")
      .in("provider_id", ids);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modelList = ((models.data ?? []) as any[]).filter((m) => m.enabled);
    return list.map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      models: modelList
        .filter((m) => m.provider_id === p.id)
        .map((m) => ({ id: m.model_id, label: m.display_name || m.model_id })),
    }));
  });
