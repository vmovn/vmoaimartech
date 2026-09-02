import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AICreditsError } from "./errors";
import { isAiWorkspaceAdmin, resolveCallerWorkspaceId, type AuthRpcClient } from "./workspace-auth";

const workspaceInput = z.object({ workspaceId: z.string().uuid() });

async function resolveWorkspaceOrganization(workspaceId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await supabaseAdmin
    .from("workspaces")
    .select("organization_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!result.data?.organization_id) {
    throw new AICreditsError("configuration", "workspace_organization_unavailable", "This workspace is not linked to a billing organization.");
  }
  return result.data.organization_id;
}

export interface PremiumCreditSummary {
  organizationId: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  resetAt: string | null;
  configured: boolean;
  ownUsage: number;
  ownMonthlyLimit: number | null;
  ownDailyUsage: number;
  ownDailyLimit: number | null;
  isAdmin: boolean;
}

export const getPremiumCreditSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => workspaceInput.parse(input))
  .handler(async ({ data, context }): Promise<PremiumCreditSummary> => {
    await resolveCallerWorkspaceId({
      supabase: context.supabase as unknown as AuthRpcClient,
      userId: context.userId,
      requestedWorkspaceId: data.workspaceId,
    });
    const organizationId = await resolveWorkspaceOrganization(data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const [subResult, limitResult] = await Promise.all([
      supabaseAdmin
        .from("subscriptions")
        .select("id, current_period_start, current_period_end, plan:plans!plan_id(limits)")
        .eq("organization_id", organizationId)
        .in("status", ["active", "trialing"])
        .maybeSingle(),
      supabaseAdmin
        .from("ai_user_credit_limits" as never)
        .select("monthly_credit_limit, daily_credit_limit")
        .eq("workspace_id", data.workspaceId)
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);
    const sub = subResult.data as unknown as {
      current_period_start: string | null;
      current_period_end: string | null;
      plan: { limits: Record<string, unknown> } | null;
    } | null;
    const periodStart = sub?.current_period_start ?? null;
    const periodEnd = sub?.current_period_end ?? null;
    const configured = Boolean(sub?.plan?.limits && Object.prototype.hasOwnProperty.call(sub.plan.limits, "ai_premium_credits"));
    const quotaResult = periodStart
      ? await supabaseAdmin
          .from("tenant_quotas")
          .select("used, included, hard_limit, period_start, period_end")
          .eq("organization_id", organizationId)
          .eq("meter_code", "ai_premium_credits")
          .eq("period_start", periodStart)
          .maybeSingle()
      : { data: null };
    const usageQuery = supabaseAdmin
      .from("usage_events")
      .select("quantity, occurred_at")
      .eq("organization_id", organizationId)
      .eq("meter_code", "ai_premium_credits")
      .eq("metadata->>workspace_id", data.workspaceId)
      .eq("metadata->>user_id", context.userId);
    if (periodStart) usageQuery.gte("occurred_at", periodStart);
    if (periodEnd) usageQuery.lt("occurred_at", periodEnd);
    const usageResult = await usageQuery;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const rows = usageResult.data ?? [];
    const ownUsage = rows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
    const ownDailyUsage = rows
      .filter((row) => new Date(row.occurred_at).getTime() >= today.getTime())
      .reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
    const quota = quotaResult.data;
    const rawLimit = quota?.hard_limit ?? (quota ? quota.included : null);
    const limit = rawLimit == null ? null : Number(rawLimit);
    const used = Number(quota?.used ?? 0);
    const ownLimit = limitResult.data as unknown as { monthly_credit_limit: number | null; daily_credit_limit: number | null } | null;
    return {
      organizationId,
      used,
      limit,
      remaining: limit == null ? null : Math.max(0, limit - used),
      periodStart: quota?.period_start ?? periodStart,
      periodEnd: quota?.period_end ?? periodEnd,
      resetAt: periodEnd,
      configured: configured && Boolean(quota),
      ownUsage,
      ownMonthlyLimit: ownLimit?.monthly_credit_limit == null ? null : Number(ownLimit.monthly_credit_limit),
      ownDailyUsage,
      ownDailyLimit: ownLimit?.daily_credit_limit == null ? null : Number(ownLimit.daily_credit_limit),
      isAdmin: await isAiWorkspaceAdmin(context.supabase as unknown as AuthRpcClient, context.userId, data.workspaceId),
    };
  });

export interface PremiumCreditMemberUsage {
  userId: string;
  name: string;
  role: string;
  used: number;
  monthlyLimit: number | null;
  dailyLimit: number | null;
}

export const listPremiumCreditMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => workspaceInput.parse(input))
  .handler(async ({ data, context }): Promise<PremiumCreditMemberUsage[]> => {
    await resolveCallerWorkspaceId({
      supabase: context.supabase as unknown as AuthRpcClient,
      userId: context.userId,
      requestedWorkspaceId: data.workspaceId,
      requireAdmin: true,
    });
    const organizationId = await resolveWorkspaceOrganization(data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sub = await supabaseAdmin
      .from("subscriptions")
      .select("current_period_start, current_period_end")
      .eq("organization_id", organizationId)
      .in("status", ["active", "trialing"])
      .maybeSingle();
    const [members, limits, events] = await Promise.all([
      supabaseAdmin.from("workspace_members").select("user_id, role").eq("workspace_id", data.workspaceId),
      supabaseAdmin.from("ai_user_credit_limits" as never).select("user_id, monthly_credit_limit, daily_credit_limit").eq("workspace_id", data.workspaceId),
      (() => {
        const query = supabaseAdmin
          .from("usage_events")
          .select("quantity, metadata")
          .eq("organization_id", organizationId)
          .eq("meter_code", "ai_premium_credits")
          .eq("metadata->>workspace_id", data.workspaceId);
        if (sub.data?.current_period_start) query.gte("occurred_at", sub.data.current_period_start);
        if (sub.data?.current_period_end) query.lt("occurred_at", sub.data.current_period_end);
        return query;
      })(),
    ]);
    const userIds = (members.data ?? []).map((member) => member.user_id);
    const profiles = userIds.length
      ? await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", userIds)
      : { data: [] };
    const names = new Map((profiles.data ?? []).map((profile) => [profile.id, profile.full_name || profile.email || "User"]));
    const caps = new Map(((limits.data ?? []) as unknown as Array<{ user_id: string; monthly_credit_limit: number | null; daily_credit_limit: number | null }>).map((limit) => [limit.user_id, limit]));
    const used = new Map<string, number>();
    for (const event of events.data ?? []) {
      const userId = (event.metadata as Record<string, unknown> | null)?.user_id;
      if (typeof userId === "string") used.set(userId, (used.get(userId) ?? 0) + Number(event.quantity ?? 0));
    }
    return (members.data ?? []).map((member) => ({
      userId: member.user_id,
      name: names.get(member.user_id) ?? "User",
      role: member.role,
      used: used.get(member.user_id) ?? 0,
      monthlyLimit: caps.get(member.user_id)?.monthly_credit_limit == null ? null : Number(caps.get(member.user_id)!.monthly_credit_limit),
      dailyLimit: caps.get(member.user_id)?.daily_credit_limit == null ? null : Number(caps.get(member.user_id)!.daily_credit_limit),
    }));
  });

export const setPremiumCreditMemberLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    workspaceId: z.string().uuid(),
    userId: z.string().uuid(),
    monthlyLimit: z.number().int().min(0).nullable(),
    dailyLimit: z.number().int().min(0).nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await resolveCallerWorkspaceId({
      supabase: context.supabase as unknown as AuthRpcClient,
      userId: context.userId,
      requestedWorkspaceId: data.workspaceId,
      requireAdmin: true,
    });
    const membership = await context.supabase.rpc("is_workspace_member", {
      _workspace_id: data.workspaceId,
      _user_id: data.userId,
    });
    if (membership.error || !membership.data) throw new Error("Target user is not a member of this workspace");
    const result = await context.supabase
      .from("ai_user_credit_limits" as never)
      .upsert({
        workspace_id: data.workspaceId,
        user_id: data.userId,
        monthly_credit_limit: data.monthlyLimit,
        daily_credit_limit: data.dailyLimit,
        updated_by: context.userId,
      } as never, { onConflict: "workspace_id,user_id" })
      .select("user_id")
      .single();
    if (result.error) throw new Error(result.error.message);
    return { ok: true };
  });
