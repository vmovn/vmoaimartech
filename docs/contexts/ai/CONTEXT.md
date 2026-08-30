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
- `src/lib/ai/providers/**`, `src/lib/ai-providers/**`.

## Source of Truth
AI owns suggestions/generation/orchestration metadata; domain services own canonical business state.

## Invariants
- AI does not become an alternate source of truth for Customer, Deal, Ticket, Order or Workflow state.
- provider keys remain server-side according to environment boundary.
- scores/suggestions should remain explainable enough for business use when they influence customer actions.
- adding an AI provider should reuse provider configuration abstractions before adding bespoke branching.

## Validation
Provider/config change → provider/config tests and secret boundary. Domain assistant change → targeted domain behavior, not whole-repo AI audit.

## Last Verified
- Base checkpoint: `v1.0.0-localhost-1.0.5` / `67704b8967b6db5cb2a9389d8f1a7f2f836783ea`
- Date: 2026-08-30
- Newer commit alone does not invalidate this memory. Re-audit only if the listed owner/source-of-truth disappears or current evidence contradicts the contract.
