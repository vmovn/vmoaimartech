# Commerce Context — Thương mại

## Purpose
Owns catalog, checkout, orders, inventory, promotions/redemptions, shipping/store integrations and commerce readiness/analytics.

## Primary Entry Points
- `src/lib/commerce/commerce.functions.ts`
- `src/lib/commerce/catalog.functions.ts`
- `src/lib/commerce/checkout.functions.ts`
- `src/lib/commerce/client-checkout.functions.ts`
- `src/lib/commerce/promotions.functions.ts`
- `src/lib/commerce/promo-runtime.ts`
- `src/lib/commerce/readiness.functions.ts`
- `src/lib/commerce/wa-catalog.functions.ts`
- `/commerce/**` routes.

## Source of Truth
Commerce entities own transaction/catalog/fulfillment state. CRM Deal, billing subscription and marketing campaign remain separate domains unless explicitly linked.

## Invariants
- provider catalog synchronization is an integration, not a replacement for canonical commerce ownership.
- checkout/payment transitions must remain auditable and idempotent where external payment callbacks are involved.

## Validation
Target catalog/order/checkout/promo/shipping surface. Payment integration changes also read Billing/Developer as consumers/owners where applicable.

## Last Verified
- Base checkpoint: `v1.0.0-localhost-1.0.5` / `67704b8967b6db5cb2a9389d8f1a7f2f836783ea`
- Date: 2026-08-30
- Newer commit alone does not invalidate this memory. Re-audit only if the listed owner/source-of-truth disappears or current evidence contradicts the contract.
