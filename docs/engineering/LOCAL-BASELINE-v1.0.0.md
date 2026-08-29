# Local Baseline — Product v1.0.0

## Record

- Date: 2026-08-29
- Upstream technical source: Swiffer 4.4.6
- Product baseline target: v1.0.0
- Baseline phase: pre-freeze normalization
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
   `20260809165200_security_hardening.sql`. Full evidence and vendor provenance
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
- `npm run lint`: FAIL, 59,113 inherited findings (58,939 errors and 174 warnings)

## Smoke-Test Data

The ignored `.env.local` contains a disposable local account used by
`npm run dev:verify`. No customer, production or provider data is included.
The application provisioned organization and workspace context on first login.

## Known Warnings

- Repository-wide lint/formatting is not normalized and remains a Product
  v1.0.0 freeze gate.
- Vite reports inherited non-route helper files under `src/routes/**/server`.
- Several server functions use the deprecated `inputValidator()` API.
- The build reports chunks larger than 500 kB.
- Rapid automated navigation aborted some in-flight browser Auth lookups and
  produced transient `Failed to fetch` messages; stable pages, direct service
  checks and readiness remained healthy with no continuous failures.
- The disposable user's new organization membership rendered as `member`, so
  General Settings was read-only. Tenant context itself loaded correctly; role
  semantics should be reviewed separately before freeze.

## Files Modified or Created

- `AGENTS.md`
- `.gitignore`
- `.env.local.example`
- `package.json`
- `package-lock.json`
- `supabase/config.toml`
- `supabase/seed.sql`
- `supabase/migrations/20260809165200_security_hardening.sql`
- `scripts/dev/generate-local-env.mjs`
- `scripts/dev/verify-local-supabase.mjs`
- `docs/engineering/BASELINE-FIXES.md`
- `docs/engineering/LOCAL-DEVELOPMENT.md`
- `docs/engineering/LOCAL-BASELINE-v1.0.0.md`

`.env.local` and local runtime/build logs are ignored machine state and are not
part of the committed baseline.

## Current Status

The localhost development environment is operational, isolated from production,
and ready for daily AI-assisted development. Product v1.0.0 should not be frozen
until the inherited lint gate is normalized or deliberately baselined through a
separate reviewed decision. No release tag was created.
