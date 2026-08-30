# Analytics Context — Phân tích & Báo cáo

## Purpose
Owns cross-domain reporting/BI/forecasting/monitoring/export surfaces while allowing domains to own their metric production semantics.

## Primary Entry Points
- `src/lib/analytics/**`
- domain-local analytics such as `src/lib/commerce/analytics.functions.ts`, `helpdesk/analytics.functions.ts`, `booking/analytics.functions.ts`, `ai/analytics.functions.ts`.
- routes `/analytics`, `/reports`, `/bi`, `/forecasting`, `/monitoring`, `/exports` and domain analytics routes.

## Source of Truth
Analytics is a read/aggregation layer unless explicitly documented otherwise. Domain state remains owned by the source domain.

## Invariants
- do not create writable duplicate business truth merely to make a dashboard easy.
- metric definitions should identify their source domain/time window where ambiguity matters.

## Validation
Target metric/query/report touched; no need to retest every domain dashboard for one scoped metric change.

## Last Verified
- Base checkpoint: `v1.0.0-localhost-1.0.5` / `67704b8967b6db5cb2a9389d8f1a7f2f836783ea`
- Date: 2026-08-30
- Newer commit alone does not invalidate this memory. Re-audit only if the listed owner/source-of-truth disappears or current evidence contradicts the contract.
