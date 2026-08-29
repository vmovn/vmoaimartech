/**
 * Upgrade / downgrade server functions (preview → checkout → confirm).
 * Thin wrappers: all logic lives in `plan-change.server.ts`.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertOrgAdmin(supabase: any, org_id: string, user_id: string) {
  const { data, error } = await supabase.rpc("has_org_role", {
    _org_id: org_id,
    _user_id: user_id,
    _roles: ["owner", "admin"],
  });
  if (error) throw error;
  if (!data) throw new Error("forbidden");
}

/** What happens if I switch to this plan? (price delta, entitlements, checkout) */
export const previewPlanChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        organization_id: z.string().uuid(),
        plan_code: z.string().min(1),
        workspace_id: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { buildPlanChangePreview } = await import("./plan-change.server");
    return buildPlanChangePreview(context.supabase, {
      organization_id: data.organization_id,
      plan_code: data.plan_code,
      workspace_id: data.workspace_id ?? null,
    });
  });

/** Begin the change: apply locally, schedule for renewal, or open checkout. */
export const beginPlanChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        organization_id: z.string().uuid(),
        plan_code: z.string().min(1),
        workspace_id: z.string().uuid().nullable().optional(),
        at_period_end: z.boolean().optional(),
        return_url: z.string().url(),
        cancel_url: z.string().url(),
        coupon_code: z.string().max(64).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(context.supabase, data.organization_id, context.userId);
    const { startPlanChange } = await import("./plan-change.server");
    return startPlanChange(context.supabase, {
      organization_id: data.organization_id,
      plan_code: data.plan_code,
      workspace_id: data.workspace_id ?? null,
      at_period_end: data.at_period_end ?? undefined,
      return_url: data.return_url,
      cancel_url: data.cancel_url,
      coupon_code: data.coupon_code,
    });
  });

/** Called when the browser comes back from the gateway. Polls to confirmation. */
export const finalizePlanChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        organization_id: z.string().uuid(),
        intent_id: z.string().min(4),
        canceled: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(context.supabase, data.organization_id, context.userId);
    const { confirmPlanChange } = await import("./plan-change.server");
    return confirmPlanChange(context.supabase, {
      organization_id: data.organization_id,
      intent_id: data.intent_id,
      canceled: data.canceled ?? false,
    });
  });
