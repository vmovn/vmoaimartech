# Local Baseline — Product v1.0.0

## Record

- Date: 2026-08-29
- Upstream technical source: Swiffer 4.4.6
- Product baseline: v1.0.0
- Baseline phase: FROZEN / READY
- Application: TanStack Start, React 19, Vite 8
- Application URL: `http://127.0.0.1:8080`

## Toolchain

- Node.js: 24.12.0; supported minimum pinned as 20.19.0
- npm: 11.6.2
- Git: 2.52.0.windows.1
- Docker Engine: 29.7.2
- Docker Desktop: 4.88.1
- Docker Compose: 5.4.0
- Supabase CLI: 2.116.0, exact repository-local dev dependency
- PostgreSQL: 17.6 through the official local Supabase image

## Local Service Architecture

- Supabase project ID: `vmoaimartech-local`
- API/Auth/Storage/Realtime gateway: `http://127.0.0.1:56321`
- PostgreSQL: `127.0.0.1:56322`
- Studio: `http://127.0.0.1:56323`
- Mailpit: `http://127.0.0.1:56324`
- Edge Runtime: disabled; the repository contains no Edge Function implementation
- Analytics/Logflare: disabled; not required for the application baseline

The host application reads browser-safe values through `VITE_*` variables and
server-only values through non-`VITE_*` variables. The local service-role value
is confined to ignored `.env.local` and server output.

## Database Validation

- SQL migrations discovered: 290
- Clean replay result: PASS, 290/290
- PostgreSQL extensions verified: `btree_gist`, `pg_cron`, `pg_net`, `pg_trgm`,
  `pgcrypto`, `vector`
- Public tables: 362
- Public tables with RLS enabled: 362
- Public tables without RLS: 0
- Public RLS policies: 658
- Realtime publication tables: 113
- Auth signup trigger: present
- Organization provisioner and workspace membership guard: present
- Storage buckets: eight, all private
- Infrastructure seed: PASS
- Product/demo data seed: none

## Baseline Fixes

1. Corrected the unambiguous vCard security-policy identifiers in
   `20260809165200_bffcae02-e6e7-46f7-8b9b-62d634d4684c.sql`. Full evidence and vendor provenance
   are recorded in `docs/engineering/BASELINE-FIXES.md`.
2. Pointed `xlsx` 0.20.3 to the official SheetJS CDN tarball already recorded
   by the vendor Bun lock and documentation. This resolved clean npm `ETARGET`
   failure without changing library or version.
3. Pinned Supabase CLI 2.116.0 locally and pinned npm 11.6.2 / Node minimum
   20.19.0 in `package.json`.
4. Completed local Supabase configuration with isolated ports, real Auth,
   private Storage, Realtime, migration replay and infrastructure seed.
5. Added deterministic local setup, environment generation, reset and
   verification commands.

## Validation Executed

- `docker version`: PASS
- `docker ps`: PASS
- `npm ci`: PASS
- clean Supabase bootstrap: PASS, 290/290 migrations
- local infrastructure seed: PASS
- PostgreSQL metadata/extensions: PASS
- Auth signup and password login: PASS
- profile/workspace signup trigger: PASS
- cross-tenant workspace denial through RLS: PASS
- private Storage upload/download/signed URL/removal: PASS
- Realtime subscription: PASS
- application startup: PASS
- public health endpoint: PASS
- database readiness endpoint: PASS
- authenticated browser smoke: PASS for Dashboard, Contacts, Customers, Leads,
  Deals, Inbox and General Settings
- browser console on verified pages: no persistent errors
- `npm run typecheck`: PASS
- `npm run build`: PASS
- build-time design/branding/deprecated-utility audits: PASS
- local security scan: PASS; one existing finding remains baselined with no new findings
- extension security probe: PASS
- security policy assertions: PASS, 6/6
- Realtime RLS audit: PASS
- public-bundle secret scan: PASS across 1,047 files
- `npm run lint`: inherited inventory of approximately 59,113 findings
  (58,939 errors and 174 warnings), accepted as non-blocking vendor debt by
  ADR-0004

## Smoke-Test Data

The frozen baseline originally used reusable local smoke credentials. The
current verifier instead generates random fixtures per run and deletes their
tenant data and Auth users before exit. `.env.local`, START and RESET contain no
demo/test/smoke user credentials and create no account.

## Organization Role Review

The first organization creator is expected to be an owner, not a member:

- `public.ensure_personal_organization` inserts the new organization with
  `owner_id = _user_id`.
- The same function explicitly inserts `organization_members.role = 'owner'`.
- It also creates or repairs the personal workspace with an active `owner`
  workspace membership.
- Organization update, membership management, billing and ownership-transfer
  paths consistently reserve privileged operations for `owner`/`admin` roles.

The `member` label observed during browser smoke testing came from presentation
fallback, not stored authorization state: `toSwitcherOrg()` does not copy role
data, and `OrganizationSwitcher` renders `active.role ?? "member"`.
Authorization hooks query `organization_members` separately. This is a
non-blocking inherited display inconsistency, not a provisioning, tenant
isolation or privilege-escalation blocker. Product behavior was not changed as
part of freeze preparation.

## Known Warnings

- Repository-wide lint/formatting remains inherited technical debt accepted by
  ADR-0004; it is not an active freeze gate.
- Vite reports inherited non-route helper files under `src/routes/**/server`.
- Several server functions use the deprecated `inputValidator()` API.
- The build reports chunks larger than 500 kB.
- Rapid automated navigation aborted some in-flight browser Auth lookups and
  produced transient `Failed to fetch` messages; stable pages, direct service
  checks and readiness remained healthy with no continuous failures.
- The organization switcher can display fallback role `member` because its
  organization mapper omits role data. The database provisions the creator as
  `owner`; the display inconsistency is non-blocking inherited debt.

## Files Modified or Created

- `AGENTS.md`
- `.gitignore`
- `.env.local.example`
- `package.json`
- `package-lock.json`
- `supabase/config.toml`
- `supabase/seed.sql`
- `supabase/migrations/20260809165200_bffcae02-e6e7-46f7-8b9b-62d634d4684c.sql`
- `scripts/dev/generate-local-env.mjs`
- `scripts/dev/verify-local-supabase.mjs`
- `docs/engineering/BASELINE-FIXES.md`
- `docs/engineering/LOCAL-DEVELOPMENT.md`
- `docs/engineering/LOCAL-BASELINE-v1.0.0.md`
- `docs/adr/0004-inherited-vendor-lint-debt-baseline.md`

`.env.local` and local runtime/build logs are ignored machine state and are not
part of the committed baseline.

## Current Status

**Product v1.0.0 baseline status: FROZEN / READY.**

The localhost development environment is operational, isolated from production,
and ready for daily AI-assisted development. The inherited lint inventory is
accepted under ADR-0004 and is not a freeze blocker. The organization creator is
provisioned as owner; the observed member label is a non-blocking presentation
fallback. The active database lifecycle state is POST-BASELINE / PRODUCT
DEVELOPMENT. No release tag was created.
