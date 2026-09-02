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

## Validation
Provider/config change → provider/config tests and secret boundary. Domain assistant change → targeted domain behavior, not whole-repo AI audit.
Feature-routing change → `src/lib/ai/feature-routing.test.ts`.

## Last Verified
- Runtime baseline: `v1.0.0-Freedom-v1.0.0` / `972431b9eb47d48c8ff8deb1cb3e03d312762269`.
- Date: 2026-09-02.
- Verification scope: `runChat` now loads `ai_feature_config`; P0 callsites no longer pin Gemini models.
