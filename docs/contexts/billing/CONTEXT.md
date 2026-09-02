# Billing Context — Gói, Subscription & Thanh toán nền tảng

## Purpose
Owns plans/features/limits, subscription billing, gateways, checkout, coupons, billing documents/events and billing automation/metering boundaries.

## Primary Entry Points
- `src/lib/billing/billing.functions.ts`
- `src/lib/billing/feature-catalog.ts`
- `src/lib/billing/feature-limits.ts`
- `src/lib/billing/checkout.server.ts`
- `src/lib/billing/gateway-guard.server.ts`
- `src/lib/billing/gateway-validation.ts`
- `src/lib/billing/events.ts`
- `src/lib/billing/automation.functions.ts`
- `src/lib/billing/quota-manager.server.ts`
- `src/lib/ai/premium-credits.server.ts` (AI-facing service seam; billing state remains owned here)

## Source of Truth
Billing/subscription entitlement owns plan/access/payment status. CRM Deal/Commerce Order may reference business transactions but do not redefine subscription entitlement.

## Invariants
- gateway/provider secrets remain server-side.
- callbacks/webhooks are authenticated/idempotent as provider semantics allow.
- feature entitlement changes are cross-cutting and usually DEEP/Tier 2.
- do not hardcode plan capability in UI if feature catalog/entitlement service owns it.
- `ai_premium_credits` is the organization subscription-period pool for platform-paid premium AI. Missing plan configuration or current quota fails closed; `tenant_quotas` owns current availability and `usage_events` owns settled history.
- Premium Credit reservation/settlement/release is service-role-only and atomic in PostgreSQL. `ai_credit_reservations` is transaction safety, not a second wallet.
- Workspace/user Premium Credit limits are ceilings inside the shared organization pool, never purchased balances.

## Validation
Gateway/checkout changes need focused security/payment validation; presentation-only billing UI can remain FAST.

## Last Verified
- Runtime baseline: `v1.0.0-localhost-1.0.6.2`.
- Memory installation checkpoint: `v1.0.0-localhost-1.0.7` / `0f401975274490d0201581325a932d7865f73208`.
- Date: 2026-09-02.
- Verification scope: Phase 7 Premium Credit meter, subscription-period quota lifecycle, atomic reservation/settlement, usage metering and per-user ceiling integration.
