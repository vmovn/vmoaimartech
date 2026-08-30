# Environment Context — Biến môi trường & Deployment Readiness

## Purpose
Owns classification of environment configuration: public build variables, server secrets, Supabase/edge/runtime values, integration-specific values, local-only values and deployment readiness.

## Primary Entry Points
- `.env.example` — deployable template.
- `package.json` — scripts/runtime contract.
- `scripts/dev/generate-local-env.mjs` and related `scripts/dev/**` — local environment generation/verification.
- `supabase/config.toml` and deployment/Docker files where relevant.
- If present after the active Product cleanup: `src/lib/environment/environment-catalog.ts`, `src/lib/setup/environment-readiness.server.ts`, `scripts/ai/env-audit.mjs` become the preferred metadata/readiness/drift owners.

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

## Last Verified
- Base checkpoint: `v1.0.0-localhost-1.0.5` / `67704b8967b6db5cb2a9389d8f1a7f2f836783ea`
- Date: 2026-08-30
- Newer commit alone does not invalidate this memory. Re-audit only if the listed owner/source-of-truth disappears or current evidence contradicts the contract.
