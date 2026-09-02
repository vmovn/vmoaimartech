import { AICreditsError } from "./errors";
import { PREMIUM_CREDIT_RESERVATION_LEASE_SECONDS } from "./premium-credits";

type RpcResult = {
  ok?: boolean;
  reason?: string | null;
  status?: string;
  organization_id?: string;
  subscription_id?: string;
  reservation_id?: string;
  reserved_credits?: number;
  settled_credits?: number;
  remaining?: number | null;
  period_start?: string;
  period_end?: string;
  idempotent?: boolean;
};

function creditsError(reason = "premium_credits_unavailable"): AICreditsError {
  if (reason === "premium_credits_exhausted") {
    return new AICreditsError("quota", reason, "Premium AI Credits exhausted. Use a connected AI provider, upgrade your plan, or wait for renewal.");
  }
  if (reason === "user_premium_credits_exhausted" || reason === "user_daily_premium_credits_exhausted") {
    return new AICreditsError("quota", reason, "Your Premium AI Credit limit has been reached. Contact a workspace owner or admin.");
  }
  if (reason === "user_workspace_mismatch") {
    return new AICreditsError("configuration", reason, "The AI caller does not belong to the selected workspace.");
  }
  return new AICreditsError("configuration", reason, "Premium AI Credits are unavailable for this subscription. Ask a platform operator to configure the plan allowance and active period.");
}

async function rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await supabaseAdmin.rpc(name as never, args as never);
    if (!result.error) return (result.data ?? {}) as unknown as RpcResult;
  }
  throw new AICreditsError("configuration", "premium_credit_mutation_failed", "Premium AI Credit accounting is temporarily unavailable.");
}

export interface ReservePremiumCreditsInput {
  requestId: string;
  workspaceId: string;
  userId?: string | null;
  feature?: string | null;
  providerId: string;
  model: string;
  credits: number;
}

export async function reservePremiumCredits(input: ReservePremiumCreditsInput): Promise<RpcResult> {
  const result = await rpc("reserve_ai_premium_credits", {
    p_request_id: input.requestId,
    p_workspace_id: input.workspaceId,
    p_user_id: input.userId ?? null,
    p_feature: input.feature ?? null,
    p_provider_id: input.providerId,
    p_model: input.model,
    p_credits: input.credits,
    p_lease_seconds: PREMIUM_CREDIT_RESERVATION_LEASE_SECONDS,
  });
  if (!result.ok || (result.status !== "reserved" && result.status !== "settled")) {
    throw creditsError(result.reason ?? undefined);
  }
  if (result.idempotent) {
    throw new AICreditsError("configuration", "duplicate_ai_request", "This AI request is already reserved or settled and will not be sent to the provider again.");
  }
  return result;
}

export async function settlePremiumCredits(input: {
  requestId: string;
  actualCredits: number;
  usageEstimated: boolean;
  metadata: Record<string, unknown>;
}): Promise<RpcResult> {
  const result = await rpc("settle_ai_premium_credits", {
    p_request_id: input.requestId,
    p_actual_credits: input.actualCredits,
    p_usage_estimated: input.usageEstimated,
    p_metadata: input.metadata,
  });
  if (!result.ok) throw creditsError(result.reason ?? undefined);
  return result;
}

export async function releasePremiumCredits(requestId: string): Promise<void> {
  await rpc("release_ai_premium_credits", { p_request_id: requestId });
}
