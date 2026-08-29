import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Records an organization switch to the shared `audit_logs` table so
 * administrators can troubleshoot cross-tenant issues (who switched, when,
 * from/to which org, and whether the client-side cache purge succeeded).
 *
 * Uses `action = 'access'` (the closest option in the audit_action enum)
 * with a stable `resource_type = 'organization_switch'` so log filters can
 * pinpoint this event.
 */
export const logOrganizationSwitch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        fromOrgId: z.string().uuid().nullable(),
        toOrgId: z.string().uuid(),
        fromOrgName: z.string().max(200).nullable().optional(),
        toOrgName: z.string().max(200).nullable().optional(),
        outcome: z.enum(["success", "failure", "timeout"]),
        purgeSucceeded: z.boolean(),
        purgeError: z.string().max(500).nullable().optional(),
        durationMs: z.number().int().min(0).max(600_000).nullable().optional(),
        reason: z.string().max(500).nullable().optional(),
        userAgent: z.string().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { error } = await supabase.from("audit_logs").insert({
      organization_id: data.toOrgId,
      actor_id: userId,
      action: "access",
      resource_type: "organization_switch",
      resource_id: data.toOrgId,
      user_agent: data.userAgent ?? null,
      changes: {
        from: { id: data.fromOrgId, name: data.fromOrgName ?? null },
        to: { id: data.toOrgId, name: data.toOrgName ?? null },
      },
      metadata: {
        outcome: data.outcome,
        purge_succeeded: data.purgeSucceeded,
        purge_error: data.purgeError ?? null,
        duration_ms: data.durationMs ?? null,
        reason: data.reason ?? null,
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    if (error) {
      // Never fail the switch on logging errors — return the message so the
      // caller can surface it in devtools while the UI continues.
      return { ok: false as const, error: error.message };
    }
    return { ok: true as const };
  });
