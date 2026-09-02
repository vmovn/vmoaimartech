# Environment Context — Biến môi trường & Deployment Readiness

## Purpose
Owns classification of environment configuration: public build variables, server secrets, Supabase/edge/runtime values, integration-specific values, local-only values and deployment readiness.

## Primary Entry Points
- `.env.example` — deployable template.
- `src/lib/environment/environment-catalog.json` — canonical environment metadata catalog.
- `src/lib/environment/environment-catalog.ts` — typed shared metadata export.
- `src/lib/setup/environment-readiness.server.ts` — server-only readiness evaluation.
- `scripts/ai/env-audit.mjs` — deterministic drift validator.
- `docs/engineering/ENVIRONMENT-VARIABLES.md` — canonical human reference.
- `docs/engineering/COOLIFY-ENV-CHECKLIST.md` — deployment checklist.
- `scripts/dev/generate-local-env.mjs` — local environment generation.
- `scripts/product/sync-cron-dispatcher-config.mjs` — process environment to Supabase Vault synchronization for internal pg_cron callbacks.

## Source of Truth
Executable environment reads are truth; the canonical catalog/example must mirror them. Metadata may be shared, secret-value evaluation must remain server-side.

## Classification
- REQUIRED core runtime
- CONDITIONAL feature/provider
- OPTIONAL
- LOCAL_ONLY
- CI_ONLY

Scope:
- BUILD_PUBLIC
- RUNTIME_SERVER
- SUPABASE_EDGE
- LOCAL
- CI

## Invariants
- `VITE_*` is browser-visible; never place private provider/payment/service-role secrets there.
- optional provider credentials never block core setup unless the provider is explicitly required by Product policy.
- missing optional capability = `NOT CONFIGURED`, not platform failure.
- local test/smoke credentials never become persistent Product/default deployment accounts.
- Coolify checklist contains variable names and purposes, never secret values.
- PostgreSQL internal callbacks read `APP_ORIGIN` and `INTERNAL_CRON_TOKEN` from Supabase Vault; Product startup and local environment generation synchronize those values without exposing them to browser roles.

## Staleness trigger
If a new executable environment read is introduced or an env key is removed/renamed, update the catalog/example/readiness docs and drift check in the same task.

## Validation
Prefer deterministic env-drift audit when present, plus build/public-bundle secret scan for public/private boundary changes.

## Drift Contract
`npm run env:audit` verifies the completed catalog/example/executable-key contract. Do not re-scan environment implementation merely to re-establish this completed checkpoint.

## Last Verified
- Runtime baseline: `v1.0.0-Freedom-v1.0.4` / `64fbd57dbcc4c76c293c6d793fa236e19e0fe029`.
- Date: 2026-09-02.
- Verification scope: removed `XAI_API_KEY` (AI-only). `LOVABLE_API_KEY` remains for managed email events and App User Connector, not AI inference.
