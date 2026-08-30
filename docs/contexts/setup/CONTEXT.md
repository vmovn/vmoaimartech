# Setup Context — Thiết lập lần đầu

## Purpose
Owns secure first-run platform initialization: setup access, first Super Admin, initial platform/business settings and permanent completion lock.

## User outcome
Deployment opens `/setup` once → authorized operator initializes platform → setup becomes unavailable as an onboarding backdoor.

## Primary Entry Points
- `src/routes/setup.tsx` — user-facing wizard and route guard.
- `src/lib/setup/setup.functions.ts` — server functions for setup operations.
- `src/lib/setup/setup-lock.server.ts` — bootstrap lock/concurrency support.
- `src/lib/setup/setup-state.server.ts` — open/closed setup state.
- `src/lib/setup/setup-steps.ts` — step definitions.
- `src/lib/setup/setup-store.ts` — client wizard state.

## Source of Truth
- platform setting `setup_complete` controls permanent completion state.
- `SETUP_SECRET` protects first-run access and is validated server-side.
- Supabase Auth + profile/role provisioning own the first Super Admin identity.
- Platform/tenant services own organization/workspace provisioning; Setup consumes them.

## Writes
First Super Admin; initial settings; initial organization/workspace context as supported; `setup_complete` only after required bootstrap conditions pass.

## Security Invariants / Red Zone
- `SETUP_SECRET` value never enters browser-readable state.
- signed/HttpOnly setup authorization must not become a plain client flag.
- stale tabs cannot bypass the server-side setup-open check.
- completing setup requires a valid Super Admin.
- `/setup` cannot create additional privileged owners after completion.
- service-role access stays server-only.

## Risk split
- UI copy/layout/order only: Tier 1.
- secure access, completion, first admin, service role, tenant bootstrap: Tier 2.

## Do Not Touch For Normal Setup UI Work
Baseline migrations, RLS policies, global auth architecture, unrelated settings/providers.

## Current UI note
The verified GitHub checkpoint had a six-step wizard (Environment, Administrator, Branding, System, SaaS, Launch). UI step count/labels are **not an invariant**. A later scoped Product cleanup may simplify the presentation without requiring rediscovery of the secure server contract.

## Validation
Presentation-only → setup route compile/typecheck + targeted browser view.
Security/bootstrap logic → targeted setup-state/access tests; verify first admin and post-completion lock; use fresh reset only when the changed behavior requires it.

## Last Verified
- Base checkpoint: `v1.0.0-localhost-1.0.5` / `67704b8967b6db5cb2a9389d8f1a7f2f836783ea`
- Date: 2026-08-30
- Newer commit alone does not invalidate this memory. Re-audit only if the listed owner/source-of-truth disappears or current evidence contradicts the contract.
