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
- Runtime baseline: `v1.0.0-localhost-1.0.6.2`.
- Memory installation checkpoint: `v1.0.0-localhost-1.0.7` / `0f401975274490d0201581325a932d7865f73208`.
- Date: 2026-08-31.
- Verification scope: Primary Entry Point paths only; domain semantics were not re-audited.
