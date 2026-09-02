# Setup Context — Thiết lập lần đầu

## Purpose
Owns secure first-run platform initialization: setup access, first Super Admin, initial platform/business settings and permanent completion lock.

## User outcome
Deployment opens `/setup` once → authorized operator initializes platform → setup becomes unavailable as an onboarding backdoor.

## Primary Entry Points
- `src/routes/setup.tsx` — user-facing wizard and route guard.
- `src/lib/setup/setup.functions.ts` — server functions for setup operations.
- `src/lib/setup/setup-security.server.ts` — server-only Setup Secret session/security handling.
- `src/lib/setup/environment-readiness.server.ts` — server-only environment/capability readiness evaluation.
- `src/lib/setup/launch-guidance.ts` — Vietnam-first first-run/launch recommendations (no secrets).

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
The verified Product setup is four steps:

`System → Owner → Business → Review & Finish`.

Step labels are presentation, but the secure server contract remains invariant.

Vietnam-first operator guidance for the System step lives in
`src/lib/setup/launch-guidance.ts`. The System step lists every catalog
capability and environment **variable name** (purpose, requiredness, scope,
Coolify flag, validation) without secret values. Optional integrations stay
non-blocking. Recommended first keys for a Vietnam launch are Gemini, Telegram
Bot, and a Meta App (Messenger/Instagram). Local operator keys belong in
`.env.integrations.local`, which START merges into `.env.local` and RESET does
not delete. Display brand on this step is `PM.ai.vn`; production origin is
`https://pm.ai.vn`.

Business-step defaults are `vi`, `Asia/Ho_Chi_Minh`, `VND`, `DD/MM/YYYY`.

## Validation
Presentation-only → setup route compile/typecheck + targeted browser view.
Security/bootstrap logic → targeted setup-state/access tests; verify first admin and post-completion lock; use fresh reset only when the changed behavior requires it.

## Last Verified
- Runtime baseline: `v1.0.0-localhost-1.0.6.2`.
- Memory installation checkpoint: `v1.0.0-localhost-1.0.7` / `0f401975274490d0201581325a932d7865f73208`.
- Date: 2026-09-02.
- Verification scope: Primary Entry Points, Vietnam-first System-step launch guidance (full catalog capability/variable-name listing, PM.ai.vn display, `https://pm.ai.vn` origin), and Business-step regional defaults. Secure setup semantics were not re-audited here.
