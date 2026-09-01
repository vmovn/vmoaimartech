# Local Development

## Architecture

Local development uses the application on the host and the official Supabase
CLI stack in Docker. It never requires or contacts production Supabase.

```text
Browser
  -> TanStack Start / Vite at http://127.0.0.1:8080
  -> local Supabase API at http://127.0.0.1:56321
       -> PostgreSQL 17 at 127.0.0.1:56322
       -> Auth
       -> Storage
       -> Realtime
       -> Studio at http://127.0.0.1:56323
       -> Mailpit at http://127.0.0.1:56324
```

The local Supabase project ID is `vmoaimartech-local`. Ports use the `5632x`
range because the standard `5432x` range was already assigned to another local
Supabase project on the baseline machine.

## Prerequisites

Verified baseline versions on 2026-08-29:

- Node.js 24.12.0; repository minimum is 20.19.0.
- npm 11.6.2, pinned by `packageManager` in `package.json`.
- Git 2.52.0.windows.1.
- Docker Engine 29.7.2 through Docker Desktop 4.88.1.
- Docker Compose 5.4.0.
- Supabase CLI 2.116.0, installed as an exact local dev dependency.

Bun and a global Supabase CLI are not required.

## First-Time Setup

From the repository root:

```powershell
npm run dev:setup
```

That command performs a lockfile install, starts the isolated local Supabase
stack, generates the ignored `.env.local`, and verifies Auth, the signup
profile/workspace trigger, cross-tenant RLS, Storage, and Realtime.

Equivalent expanded commands:

```powershell
npm ci
npm run dev:infra:start
npm run dev:env
npm run dev:verify
```

`npm ci` downloads SheetJS 0.20.3 from its official CDN URL recorded in the
lockfile; public npm does not publish that version.

## Windows One-Click Start

1. Double-click `START-LOCAL.cmd`.
2. Wait for Docker and the local services; the browser opens when the app is ready.
3. Develop while the **VMO AIMarTech App** terminal remains open.
4. Double-click `STOP-LOCAL.cmd` when finished.

The launcher uses repository-relative paths and `npm.cmd`, so it does not invoke
PowerShell's blocked `npm.ps1` shim or change Windows ExecutionPolicy. If Docker
Desktop is not running, the launcher may start it normally and wait up to about
120 seconds; it does not repair, reset, reconfigure, or stop Docker Desktop.

Manual PowerShell fallback:

```powershell
npm.cmd run dev:infra:start
npm.cmd run dev:env
npm.cmd run dev
```

## Environment Variables

`.env.local` is generated from the running local Supabase stack and is ignored
by Git. Never copy production values into it and never commit it.

| Variable | Purpose | Phase | Exposure | Requirement |
| --- | --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Local Supabase API URL | build/runtime | browser-safe | required |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Local publishable API key | build/runtime | browser-safe | required |
| `VITE_APP_ENV` | Deployment label (`development`) | build | browser-safe | required locally |
| `DATABASE_URL` | Direct local PostgreSQL connection for the Product migration runner | runtime | server-only | required for `product:migrate` and setup validation |
| `SUPABASE_URL` | Local Supabase API URL for server functions | runtime | server-only | required |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key for authenticated server clients | runtime | server-only | required |
| `SUPABASE_SERVICE_ROLE_KEY` | Local privileged key for trusted server operations | runtime | server-only | required for admin/provisioning functions |
| `SESSION_SECRET` | Local application session signing | runtime | server-only | required; generated with 256 bits of entropy |
| `SETUP_SECRET` | First-run setup challenge | runtime | server-only | required; generated with 256 bits of entropy |
| `INTERNAL_CRON_TOKEN` / `WEBHOOK_DISPATCH_SECRET` | Protect local internal jobs and dispatch | runtime | server-only | generated locally |
| `WIDGET_SIGNING_SECRET` / `APP_USER_CONNECTION_KEY_SECRET` | Sign widgets and encrypt local provider connections | runtime | server-only | generated locally |
| `WA_QR_WEBHOOK_SECRET` / `WA_QR_WORKER_TOKEN` / `WA_QR_WORKER_SIGNING_SECRET` | Protect the optional local QR-worker boundary | runtime | server-only | generated locally; worker remains disabled until configured |
| `HOST` / `PORT` | Local application bind address and port | runtime | server-only | required locally |
| `APP_ORIGIN` | OAuth/CORS application origin | runtime | server-only | required locally |
| `LOG_LEVEL` | Server logging verbosity | runtime | server-only | optional |
Provider credentials such as `LOVABLE_API_KEY`, WhatsApp, Meta, Stripe, SMTP,
and AI-provider keys are optional for core local development. Missing provider
credentials disable only those integrations.

The service-role key has no `VITE_` prefix. The baseline build scanned 1,047
public bundle files and confirmed that its value was absent.

## Start Local Infrastructure

```powershell
npm run dev:infra:start
```

Inspect sanitized service status when needed:

```powershell
npm exec -- supabase status
```

Do not link this directory to a hosted Supabase project for local development.

## Apply Database Migrations

`npm run dev:infra:start` applies pending migrations on the first start. To
prove the complete chain against an empty local database:

```powershell
npm run dev:reset
```

This resets only the database configured in `supabase/config.toml`, reapplies
all 290 frozen baseline migrations plus later additive Product migrations, applies `supabase/seed.sql`, regenerates `.env.local`, and
runs the service verification.

Product v1.0.0 baseline corrections are preserved as history in
`docs/engineering/BASELINE-FIXES.md`. The baseline is frozen: all existing 290
migrations are immutable and every future database change uses a new migration. The current chain contains 294 migrations: 290 frozen baseline migrations plus four additive Product migrations for bootstrap security, deletion-safe fixture/account cleanup, and operator-controlled internal cron callbacks.

## Seed Development Data

`supabase/seed.sql` creates the eight private Storage buckets required by the
application. It intentionally contains no product/demo/customer records.

`npm run dev:verify` generates two random Auth fixtures only for the duration of
the verification run. It validates signup, workspace provisioning, cross-tenant
RLS, Storage and Realtime, then removes the Storage object, users and their
tenant data in a `finally` cleanup path. It does not read reusable credentials
from `.env.local` and normal START/RESET creates no account.

## Start Application

```powershell
npm run dev
```

The application binds deterministically to `http://127.0.0.1:8080`.

## URLs

- Application: `http://127.0.0.1:8080`
- Authentication: `http://127.0.0.1:8080/auth`
- Health: `http://127.0.0.1:8080/api/public/health`
- Readiness: `http://127.0.0.1:8080/api/public/health/ready`
- Supabase API: `http://127.0.0.1:56321`
- REST API: `http://127.0.0.1:56321/rest/v1`
- Auth API: `http://127.0.0.1:56321/auth/v1`
- Storage API: `http://127.0.0.1:56321/storage/v1`
- Realtime: `ws://127.0.0.1:56321/realtime/v1`
- PostgreSQL: `127.0.0.1:56322`
- Supabase Studio: `http://127.0.0.1:56323`
- Mailpit: `http://127.0.0.1:56324`

Use `npm exec -- supabase status` to obtain current local keys and database
connection details. Do not copy those values into committed documentation.

## Stop Environment

Stop the application with `Ctrl+C` in its terminal, then stop Supabase while
preserving local database state:

```powershell
npm run dev:infra:stop
```

## Reset Local Database

For a complete clean-room reset, double-click `RESET-LOCAL.cmd`. It requires
typing `RESET-LOCAL` before deletion and refuses to run unless
`supabase/config.toml` identifies the project as `vmoaimartech-local`.

The launcher stops only the application terminal it owns, deletes only this
project's local Supabase volumes with `--no-backup`, and recreates PostgreSQL,
Auth, Storage, Realtime, migrations, and infrastructure seed. It deletes all
local users, sessions, application rows, uploads, and Storage objects. It does
not delete source code, dependencies, Docker Desktop, browser profiles, or
unrelated Docker projects. When complete it starts the app and opens `/setup`.

Step 7 generates a new production-strength local secret set using Node.js
cryptographic randomness. A normal `START-LOCAL.cmd` run preserves existing
strong values so sessions and setup authorization do not rotate every day.
`RESET-LOCAL.cmd` deletes `.env.local`, so a factory reset always creates an
independent secret set. Supabase's local keys come from the rebuilt stack;
third-party credentials are never fabricated.

The Windows launchers explicitly pin `SUPABASE_PROJECT_ID` to
`vmoaimartech-local`, overriding placeholder values that may exist in a legacy
root `.env`. After `--no-backup`, RESET waits until this project's containers
are fully removed before starting the clean stack, avoiding stop/start races.

Manual database-only fallback:

```powershell
npm.cmd exec -- supabase stop --project-id vmoaimartech-local --no-backup
npm.cmd run dev:infra:start
npm.cmd run dev:env
npm.cmd run dev
```

`npm.cmd run dev:reset` is a lighter reset that replays the database and runs
generated verification fixtures that are deleted before the command exits; use
`RESET-LOCAL.cmd` when testing the true first-run Product setup. Both workflows
finish with no test/demo/smoke account. Never use either workflow against a
linked or hosted project.

## Common Problems

### Standard Supabase ports are occupied

This repository intentionally uses `56321` through `56324`. Do not stop other
projects merely to reclaim the default `54321` through `54324` ports.

### npm cannot resolve `xlsx@0.20.3`

SheetJS 0.20.3 is distributed from `cdn.sheetjs.com`, not the public npm
registry. The repository manifest and lockfile already contain the intended
official tarball URL. Do not replace the library or upgrade it as a workaround.

### Supabase CLI user-state or telemetry write is blocked

The CLI is project-local. Run it from a normal developer terminal. Coding
agents should make one scoped attempt, then follow the external-environment
failure policy in `AGENTS.md`; do not enter machine-repair loops.

### Vite route warnings

Some inherited `src/routes/**/server/*.server.ts` helpers are discovered as
non-route files. They are excluded from the route tree and do not prevent
startup or build. Normalize their route-ignore naming in a separate scoped task.

### Lint reports a very large formatting backlog

The inherited repository reports approximately 59,113 lint findings, mostly
formatting. This vendor debt is baselined by
`docs/adr/0004-inherited-vendor-lint-debt-baseline.md` and is not a freeze
blocker. Do not run a repository-wide automatic fix. Keep new work clean with
checks scoped to changed files/modules and reduce inherited debt incrementally.

## Verification

For local services:

```powershell
npm run dev:verify
```

For the passing build/security baseline:

```powershell
npm run dev:check
```

A healthy environment has:

- `npm run dev:verify` reporting all six checks as `true`;
- health returning HTTP 200 with `status: ok`;
- readiness returning HTTP 200 with `status: ready` and database `ok: true`;
- `npm run typecheck` passing;
- `npm run build` passing;
- local security scan and policy assertions passing;
- no service-role value in `.output/public`.

## Rollback

Local infrastructure can be stopped with `npm run dev:infra:stop`. The ignored
`.env.local` can be deleted and regenerated with `npm run dev:env`. Repository
setup changes can be reviewed or reverted through Git without affecting any
production database or credentials.
