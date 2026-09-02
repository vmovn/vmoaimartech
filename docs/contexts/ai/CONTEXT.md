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
- `src/lib/ai/workspace-auth.ts`
- `src/lib/ai/credential-crypto.server.ts`, `src/lib/ai/provider-credentials.server.ts`
- `src/lib/ai/providers/**`, `src/lib/admin/ai-providers.functions.ts`
- `src/lib/ai/platform-ollama.ts`, `src/lib/ai/platform-ollama.functions.ts`
- `src/lib/tenant/provision.functions.ts` (first-login consumer of `ensurePlatformOllamaForUserWorkspaces`)
- `src/lib/ai/task-policy.ts`, `src/lib/ai/execution-mode.ts`
- `src/lib/ai/premium-credits.ts`, `src/lib/ai/premium-credits.server.ts`, `src/lib/ai/premium-credits.functions.ts`
- `src/lib/ai/intelligence.server.ts`, `src/lib/ai/background-intelligence.ts`, `src/lib/ai/background-intelligence.server.ts`, `src/lib/ai/ollama-fairness.ts`
- `src/routes/api/public/hooks/analyze-conversations.ts`

## Source of Truth
AI owns suggestions/generation/orchestration metadata; domain services own canonical business state.
`src/lib/ai/task-policy.ts` is product policy metadata (task class + allowed execution modes). It is not a second router.

## Invariants
- AI does not become an alternate source of truth for Customer, Deal, Ticket, Order or Workflow state.
- provider keys remain server-side according to environment boundary.
- scores/suggestions should remain explainable enough for business use when they influence customer actions.
- adding an AI provider should reuse provider configuration abstractions before adding bespoke branching.
- `runChat` owns `ai_feature_config` routing. Lookup is always `workspace_id` + `feature`. Explicit `primaryProviderId` / `request.model` win over config. Missing config uses the first policy-allowed provider (not an implicit vendor). Disabled config fails before provider transport.
- Three economic execution modes are derived from the selected provider's credential ownership, not vendor kind: `platform_local` (platform-managed Ollama, no Premium Credits), `premium_credits` (operator ENV keys such as `GEMINI_API_KEY`), `workspace_byok` (encrypted workspace key, conceptual `creditsToCharge = 0`). BYOK is optional. Premium features work without it when a platform ENV provider exists.
- Platform-managed Ollama is a workspace-scoped `ai_providers` row (`config.managed_by = "platform"`, `purpose = "utility"`), not a global provider table. Production requires operator `OLLAMA_BASE_URL`; localhost is never a production fallback. P0 utility allowlist is seeded via `ai_feature_config`. Ollama is not a customer-facing default or silent generative fallback.
- AI workspace resolution uses the product active-workspace header (`x-swiffer-workspace-id` from `readActiveWorkspaceId`) or an explicit `workspaceId`, then `is_workspace_member` / `is_workspace_admin`. Domain-entity AI uses `entity.workspace_id` plus the same membership check. Never the first membership row.
- A provider may execute only when `ai_providers.workspace_id` equals the execution workspace. Explicit cross-tenant provider IDs fail closed.
- Workspace BYOK API keys live in server-only `ai_provider_secrets` (ciphertext), never on `ai_providers`. Decrypt uses operator `AI_CREDENTIAL_ENCRYPTION_KEY`. Credential sources are `workspace_encrypted` | `platform_env` | `keyless` and are never mixed. Platform Ollama remains keyless.
- `runChat`/`runEmbed` resolve credentials through `resolveProviderCredentials` after the tenant check. Ciphertext and plaintext never return to the browser.
- Accounting metadata (`executionMode`, `costOwner`, `creditsToCharge`, `creditsCharged`) is written to existing `ai_request_logs.metadata`; AI does not duplicate the purchased balance owned by billing quotas.
- `premium_credits` resolves a priced `ai_models` row and atomically reserves the organization plan pool before provider transport. Successful calls settle actual credits (`ceil(computeCost * 1000)`, minimum 1); missing provider usage settles the conservative reservation. Provider failure releases it. Pricing/quota/configuration errors fail closed without economic fallback.
- `platform_local` and `workspace_byok` never reserve or debit Premium Credits. Null `userId` charges only the organization pool; a real user additionally observes optional workspace/user period and daily ceilings derived from the same settled usage events plus active reservations.
- PLATFORM_LOCAL utility intelligence is backgrounded on the existing `conversation_intelligence.needs_reanalysis` flag (message INSERT trigger coalesces by conversation PK). Canonical message/conversation persist must not wait on Ollama. The cron hook `/api/public/hooks/analyze-conversations` drains with CAS lease claim (`analysis_claimed_at`, `needs_reanalysis` stays true while claimed), tenant check (`entity.workspace_id` equals queued workspace), Zod validation before persist, and bounded retry of transient AI errors only. Expired leases are reclaimable without a new message. Success/terminal updates are snapshot-guarded on `last_message_at` so a newer message keeps the row pending. Interactive `analyzeConversation` remains available. Premium/user-triggered features are not auto-queued.
- Shared platform Ollama in-flight calls are bounded per Node process by `OLLAMA_MAX_CONCURRENCY` (default 2) and `OLLAMA_WORKSPACE_MAX_CONCURRENCY` (default 1). This is not a substitute for the per-minute rate limiter and is replica-local.
- First-login `ensureMyOrganization` best-effort calls `ensurePlatformOllamaForUserWorkspaces` after SQL personal-org/workspace create. Setup and `useCreateWorkspace` already called `ensurePlatformOllamaForWorkspace`. Missing `OLLAMA_BASE_URL` must not fail signup. Platform premium providers are operator-configured (Super Admin create / applyToAllWorkspaces / sync / price / plan credits). They are not auto-provisioned.
- `lovable` and `grok` remain inert DB/type compatibility values. They are not executable, not selectable, and not auto-seeded. `LOVABLE_API_KEY` remains for non-AI Lovable email/connector services.

## AI CORE v1 LOCKED

Locked architecture:

1. `ai_feature_config` is the routing source of truth.
2. Workspace/tenant isolation is mandatory.
3. Three execution modes only: `platform_local`, `premium_credits`, `workspace_byok`.
4. PLATFORM_LOCAL: shared Ollama utility AI, PM.ai.vn-funded compute, zero Premium Credits.
5. PREMIUM_CREDITS: operator-owned external AI credentials, organization subscription credit pool, optional per-user caps.
6. WORKSPACE_BYOK: encrypted customer credential, zero PM.ai.vn Premium Credits.
7. Provider/model choice is configuration-driven. No executable feature-level vendor/model hardcoding.
8. Background utility AI is non-blocking and lease-recoverable.
9. Premium Credits use atomic reservation/settlement.
10. Workspace BYOK secrets remain server-only encrypted.
11. Lovable AI is not supported.
12. xAI/Grok runtime is not supported.
13. Lovable non-AI services remain a separate future vendor-exit concern.
14. No parallel router/provider/billing system may be introduced.

Do not modify this AI Core architecture unless a real production bug requires it, or a future intentionally versioned AI Core v2 requires it. Normal product work belongs in features, prompts, workflows, CRM, Inbox, Sales, Marketing, Helpdesk, PM workflows and UI — not in provider/router/economic infrastructure.

Operator production checklist: `docs/engineering/COOLIFY-ENV-CHECKLIST.md` (section **AI Core v1 — operator run**).

## Validation
Provider/config change → provider/config tests and secret boundary. Domain assistant change → targeted domain behavior, not whole-repo AI audit.
Feature-routing change → `src/lib/ai/feature-routing.test.ts`.
Tenant-boundary change → `src/lib/ai/tenant-boundary.test.ts`.
Platform Ollama URL/policy → `src/lib/ai/platform-ollama.test.ts`, `src/lib/ai/platform-ollama.provision.test.ts`.
Workspace BYOK crypto/credentials → `src/lib/ai/credential-crypto.test.ts`, `src/lib/ai/provider-credentials.test.ts`.
Task policy / execution mode → `src/lib/ai/task-policy.test.ts`.
Background intelligence / Ollama fairness → `src/lib/ai/background-intelligence.test.ts`.
AI Core v1 lock / P8 E2E → `src/lib/ai/p8-core.lock.test.ts`.

## Last Verified
- Runtime baseline: `v1.0.0-Freedom-v1.0.7` / `ecfe90ba4e612b39a0a93277cfb821cbc6afd25e`.
- Date: 2026-09-02.
- Verification scope: Phase 8 first-login Ollama provision, operator run checklist, focused E2E for Ollama drain/failure/lease, Premium Credits settle/fail-closed/user cap/reservation reclaim, BYOK zero-debit, three-way economics, cron/env/secret contracts. P1–P7 architecture unchanged. AI CORE v1 LOCKED.
