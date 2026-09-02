# AI Context — Trí tuệ nhân tạo

## Purpose
Owns AI provider configuration, completion/orchestration helpers, AI analytics/cost, customer intelligence/qualification and AI-facing assistants.

## Primary Entry Points
- `src/lib/ai/config.functions.ts`
- `src/lib/ai/complete.functions.ts`
- `src/lib/ai/intelligence.functions.ts`
- `src/lib/ai/customer-insights.functions.ts`
- `src/lib/ai/lead-qualification.functions.ts`
- `src/lib/ai/omnichannel.functions.ts`
- `src/lib/ai/automations.functions.ts`
- `src/lib/ai/analytics.functions.ts`
- `src/lib/ai/providers/**`, `src/lib/admin/ai-providers.functions.ts`.

## Source of Truth
AI owns suggestions/generation/orchestration metadata; domain services own canonical business state.

## Invariants
- AI does not become an alternate source of truth for Customer, Deal, Ticket, Order or Workflow state.
- provider keys remain server-side according to environment boundary.
- scores/suggestions should remain explainable enough for business use when they influence customer actions.
- adding an AI provider should reuse provider configuration abstractions before adding bespoke branching.
- `runChat` owns `ai_feature_config` routing. Lookup is always `workspace_id` + `feature`. Explicit `primaryProviderId` / `request.model` win over config. Missing config uses the workspace default provider. Disabled config fails before provider transport.
- AI workspace resolution uses the product active-workspace header (`x-swiffer-workspace-id` from `readActiveWorkspaceId`) or an explicit `workspaceId`, then `is_workspace_member` / `is_workspace_admin`. Never the first membership row.
- A provider may execute only when `ai_providers.workspace_id` equals the execution workspace. Explicit cross-tenant provider IDs fail closed.

## Validation
Provider/config change → provider/config tests and secret boundary. Domain assistant change → targeted domain behavior, not whole-repo AI audit.
Feature-routing change → `src/lib/ai/feature-routing.test.ts`.
Tenant-boundary change → `src/lib/ai/tenant-boundary.test.ts`.

## Last Verified
- Runtime baseline: `v1.0.0-Freedom-v1.0.1` / `1756c4322413b7a98c9b642189dc240fad66c926`.
- Date: 2026-09-02.
- Verification scope: AI config/execution tenant isolation; `upsert_ai_usage_daily` execute grant folded to service_role in original owner migration.
