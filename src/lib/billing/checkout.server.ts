/**
 * Shared hosted-checkout creation.
 *
 * Single source of truth used by `createCheckoutSession` (billing.functions)
 * and by the upgrade/downgrade flow (plan-change.server). It resolves the
 * gateway + external price from `plan_gateway_prices`, ensures a billing
 * customer exists and creates the provider checkout session.
 */

import { getBillingProvider } from "./providers";
import type { BillingProviderId } from "./providers/types";

export type CheckoutInput = {
  organization_id: string;
  plan_code: string;
  workspace_id?: string | null;
  provider?: string | null;
  quantity?: number | undefined;
  coupon_code?: string | undefined;
  trial_days?: number | undefined;
  success_url: string;
  cancel_url: string;
  /** Extra metadata forwarded to the gateway session (merged with plan_code). */
  metadata?: Record<string, string> | undefined;
};

export type CheckoutResult = { id: string; url: string; provider: BillingProviderId };

/** Resolve the gateway link for a plan, or throw a user-readable error. */
export async function resolveCheckoutTarget(
  supabase: any,
  args: { plan_code: string; workspace_id?: string | null; provider?: string | null },
) {
  const { resolvePlanGatewayTarget } = await import("./plan-gateways.server");
  const target = await resolvePlanGatewayTarget(supabase, {
    plan_code: args.plan_code,
    workspace_id: args.workspace_id ?? null,
    provider_id: args.provider ?? null,
  });
  return target;
}

export async function createGatewayCheckout(
  supabase: any,
  data: CheckoutInput,
): Promise<CheckoutResult> {
  const target = await resolveCheckoutTarget(supabase, {
    plan_code: data.plan_code,
    workspace_id: data.workspace_id ?? null,
    provider: data.provider ?? null,
  });
  if (!target.selected) {
    throw new Error(
      target.reason === "provider_not_available"
        ? `No enabled gateway link for plan "${data.plan_code}" and the requested provider.`
        : `Plan "${data.plan_code}" is not linked to any enabled payment gateway. Link it in Super Admin → Subscription Plans.`,
    );
  }

  const link = target.selected;
  const providerId = link.provider_id as BillingProviderId;
  const { assertGatewayEnabled } = await import("./gateway-guard.server");
  await assertGatewayEnabled(supabase, providerId, data.workspace_id ?? null);

  // Hosted-link gateways: no API session to create.
  if (!link.external_price_id && link.checkout_url) {
    await supabase.from("billing_events").insert({
      organization_id: data.organization_id,
      provider: providerId,
      event_type: "checkout.link.opened",
      payload: { plan_code: data.plan_code, url: link.checkout_url, ...(data.metadata ?? {}) },
    });
    return { id: `link_${link.id}`, url: link.checkout_url, provider: providerId };
  }

  const provider = getBillingProvider(providerId);

  // Ensure a billing customer exists for this org+provider.
  const { data: existing } = await supabase
    .from("billing_customers")
    .select("*")
    .eq("organization_id", data.organization_id)
    .eq("provider", providerId)
    .maybeSingle();

  let customerRef = existing
    ? { provider: providerId, provider_customer_id: existing.provider_customer_id }
    : null;

  if (!customerRef) {
    const { data: org } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", data.organization_id)
      .maybeSingle();
    const ref = await provider.createCustomer({
      organization_id: data.organization_id,
      name: org?.name ?? undefined,
    });
    await supabase.from("billing_customers").insert({
      organization_id: data.organization_id,
      provider: providerId,
      provider_customer_id: ref.provider_customer_id,
      is_default: true,
    });
    customerRef = ref;
  }

  const session = await provider.createCheckoutSession({
    organization_id: data.organization_id,
    customer: customerRef,
    // Gateways expect their own price/plan identifier, not our plan code.
    plan_code: link.external_price_id!,
    quantity: data.quantity,
    coupon_code: data.coupon_code,
    trial_days: data.trial_days,
    success_url: data.success_url,
    cancel_url: data.cancel_url,
    metadata: { plan_code: data.plan_code, ...(data.metadata ?? {}) },
  });

  await supabase.from("billing_events").insert({
    organization_id: data.organization_id,
    provider: providerId,
    event_type: "checkout.session.created",
    provider_event_id: session.id,
    payload: { session_id: session.id, url: session.url, plan_code: data.plan_code, ...(data.metadata ?? {}) },
  });

  return { ...session, provider: providerId } as CheckoutResult;
}
