# Environment Context — Biến môi trường & Deployment Readiness

## Purpose
Owns classification of environment configuration: public build variables, server secrets, Supabase/edge/runtime values, integration-specific values, local-only values and deployment readiness.

## Primary Entry Points
- `.env.example` — deployable template.
- `src/lib/environment/environment-catalog.json` — canonical 74-key metadata catalog.
- `src/lib/environment/environment-catalog.ts` — typed shared metadata export.
- `src/lib/setup/environment-readiness.server.ts` — server-only readiness evaluation.
- `scripts/ai/env-audit.mjs` — deterministic drift validator.
- `docs/engineering/ENVIRONMENT-VARIABLES.md` — canonical human reference.
- `docs/engineering/COOLIFY-ENV-CHECKLIST.md` — deployment checklist.
- `scripts/dev/generate-local-env.mjs` — local environment generation.

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

## Staleness trigger
If a new executable environment read is introduced or an env key is removed/renamed, update the catalog/example/readiness docs and drift check in the same task.

## Validation
Prefer deterministic env-drift audit when present, plus build/public-bundle secret scan for public/private boundary changes.

## Drift Contract
`npm run env:audit` verifies the completed `74 active executable keys = 74 catalog keys = 74 .env.example keys` contract. Do not re-scan environment implementation merely to re-establish this completed checkpoint.

## Last Verified
- Runtime baseline: `v1.0.0-localhost-1.0.6.2`.
- Memory installation checkpoint: `v1.0.0-localhost-1.0.7` / `0f401975274490d0201581325a932d7865f73208`.
- Date: 2026-08-31.
- Verification scope: canonical environment artifacts and the completed 74/74/74 drift contract; environment implementation was not re-audited here.
