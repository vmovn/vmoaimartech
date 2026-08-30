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

## Source of Truth
Billing/subscription entitlement owns plan/access/payment status. CRM Deal/Commerce Order may reference business transactions but do not redefine subscription entitlement.

## Invariants
- gateway/provider secrets remain server-side.
- callbacks/webhooks are authenticated/idempotent as provider semantics allow.
- feature entitlement changes are cross-cutting and usually DEEP/Tier 2.
- do not hardcode plan capability in UI if feature catalog/entitlement service owns it.

## Validation
Gateway/checkout changes need focused security/payment validation; presentation-only billing UI can remain FAST.

## Last Verified
- Base checkpoint: `v1.0.0-localhost-1.0.5` / `67704b8967b6db5cb2a9389d8f1a7f2f836783ea`
- Date: 2026-08-30
- Newer commit alone does not invalidate this memory. Re-audit only if the listed owner/source-of-truth disappears or current evidence contradicts the contract.
