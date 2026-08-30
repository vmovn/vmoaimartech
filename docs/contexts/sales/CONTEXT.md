# Sales Context — Bán hàng & Doanh thu

## Purpose
Owns opportunity execution from Deal/Pipeline through products, quotes, invoices and sales activities.

## Primary Entry Points
- `src/lib/deals.ts`
- `src/lib/products.ts`
- `src/lib/quotes.ts`
- `src/lib/invoices.ts`
- `src/lib/activities.ts`
- routes `/deals`, `/sales`, `/products`, `/quotes`, `/invoices`, `/activities`, `/sales-ai`.

## Source of Truth
Deal/Pipeline owns opportunity progression. Products/quotes/invoices own their own commercial document state; CRM lifecycle is separate.

## Boundaries
- Customer/Contact comes from CRM/Identity.
- Commerce Order is not automatically the same entity as CRM Deal.
- Billing subscription/entitlement is Platform billing, not a CRM Deal field.

## Validation
Target the changed entity and any explicit conversion/link boundary only.

## Last Verified
- Base checkpoint: `v1.0.0-localhost-1.0.5` / `67704b8967b6db5cb2a9389d8f1a7f2f836783ea`
- Date: 2026-08-30
- Newer commit alone does not invalidate this memory. Re-audit only if the listed owner/source-of-truth disappears or current evidence contradicts the contract.
