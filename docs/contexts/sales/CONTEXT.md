# Sales Context — Bán hàng & Doanh thu

## Purpose
Owns opportunity execution from Deal/Pipeline through products, quotes, invoices and sales activities.

## Primary Entry Points
- `src/hooks/use-deals.ts`
- `src/hooks/use-products.ts`
- `src/hooks/use-quotes.ts`
- `src/hooks/use-invoices.ts`
- `src/hooks/use-sales-activities.ts`
- Server-side owner path: targeted discovery required for a specific write operation.
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
- Runtime baseline: `v1.0.0-localhost-1.0.6.2`.
- Memory installation checkpoint: `v1.0.0-localhost-1.0.7` / `0f401975274490d0201581325a932d7865f73208`.
- Date: 2026-08-31.
- Verification scope: Primary Entry Point paths only; domain semantics were not re-audited.
