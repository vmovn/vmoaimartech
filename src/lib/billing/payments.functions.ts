/**
 * Payments service — provider-agnostic operations for one-time charges,
 * refunds, retries, and audit history.
 *
 * All calls go through the `BillingProvider` abstraction: adding a new
 * gateway never changes these server functions.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { getBillingProvider } from "./providers";
import type { BillingProviderId, PaymentStatus } from "./providers/types";

/**
 * Map provider-level statuses to the DB enum `billing_payment_status`,
 * which does not include `partially_refunded` or `requires_action`.
 * Partial refunds stay `succeeded`; refunded amount is tracked on the column.
 */
function toDbStatus(
  s: PaymentStatus,
): "pending" | "processing" | "succeeded" | "failed" | "canceled" | "refunded" {
  if (s === "partially_refunded") return "succeeded";
  if (s === "requires_action") return "processing";
  return s;
}

const PLATFORM_ROLES = new Set(["superadmin", "support"]);

async function requirePlatformAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("user_role_assignments")
    .select("role")
    .eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.some((r: string) => PLATFORM_ROLES.has(r))) {
    throw new Error("Forbidden — platform admin only");
  }
}

/** List payments across the tenant (admin) or a specific organization. */
export const listPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        organization_id: z.string().uuid().optional(),
        status: z.string().optional(),
        provider: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        cursor: z.string().datetime().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("billing_payment_attempts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.organization_id) query = query.eq("organization_id", data.organization_id);
    if (data.status) query = query.eq("status", data.status as any);
    if (data.provider) query = query.eq("provider", data.provider);
    if (data.cursor) query = query.lt("created_at", data.cursor);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

/** Refund (full or partial) a captured payment. */
export const refundPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        payment_id: z.string().uuid(),
        amount_cents: z.number().int().positive().optional(),
        reason: z
          .enum(["requested_by_customer", "duplicate", "fraudulent", "other"])
          .default("requested_by_customer"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePlatformAdmin(context);
    const { data: paymentRaw, error } = await context.supabase
      .from("billing_payment_attempts")
      .select("*")
      .eq("id", data.payment_id)
      .single();
    if (error || !paymentRaw) throw new Error("Payment not found");
    const payment = paymentRaw as any;

    const provider = getBillingProvider(payment.provider as BillingProviderId);
    if (!provider.supports.refunds) {
      throw new Error(`Provider ${payment.provider} does not support refunds`);
    }
    if (data.amount_cents && !provider.supports.partial_refunds) {
      throw new Error(`Provider ${payment.provider} does not support partial refunds`);
    }
    const refund = await provider.refundPayment({
      provider_payment_id: payment.provider_payment_id as string,
      amount_cents: data.amount_cents,
      reason: data.reason,
    });

    const refundedTotal =
      (payment.refunded_amount_cents ?? 0) + refund.amount_cents;
    const fullyRefunded = refundedTotal >= payment.amount_cents;
    await context.supabase
      .from("billing_payment_attempts")
      .update({
        status: (fullyRefunded ? "refunded" : "succeeded") as any,
        refunded_amount_cents: refundedTotal,
        refunded_at: refund.created_at,
      })
      .eq("id", data.payment_id);

    return { refund: refund as any, fully_refunded: fullyRefunded };
  });

/** Retry a failed payment attempt via the same provider. */
export const retryPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ payment_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePlatformAdmin(context);
    const { data: payment, error } = await context.supabase
      .from("billing_payment_attempts")
      .select("*")
      .eq("id", data.payment_id)
      .single();
    if (error || !payment) throw new Error("Payment not found");
    if (payment.status === "succeeded") {
      throw new Error("Payment already succeeded");
    }

    const provider = getBillingProvider((payment as any).provider as BillingProviderId);
    const result = await provider.retryPayment((payment as any).provider_payment_id as string);

    await context.supabase
      .from("billing_payment_attempts")
      .update({
        status: toDbStatus(result.status) as any,
        retry_count: ((payment as any).retry_count ?? 0) + 1,
        next_retry_at: null,
        failure_code: result.failure_code ?? null,
        failure_message: result.failure_message ?? null,
        succeeded_at: result.status === "succeeded" ? new Date().toISOString() : null,
      })
      .eq("id", data.payment_id);

    return { status: result.status as string, next_action_url: result.next_action_url ?? null };
  });

/** Fetch fresh payment status from the provider (for reconciliation). */
export const syncPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ payment_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<any> => {
    await requirePlatformAdmin(context);
    const { data: paymentRaw, error } = await context.supabase
      .from("billing_payment_attempts")
      .select("*")
      .eq("id", data.payment_id)
      .single();
    if (error || !paymentRaw) throw new Error("Payment not found");
    const payment = paymentRaw as any;
    const provider = getBillingProvider(payment.provider as BillingProviderId);
    const fresh = await provider.getPayment(payment.provider_payment_id as string);
    await context.supabase
      .from("billing_payment_attempts")
      .update({
        status: toDbStatus(fresh.status) as any,
        refunded_amount_cents: fresh.refunded_amount_cents ?? payment.refunded_amount_cents,
        failure_code: fresh.failure_code ?? null,
        failure_message: fresh.failure_message ?? null,
      })
      .eq("id", data.payment_id);
    return JSON.parse(JSON.stringify(fresh));
  });
