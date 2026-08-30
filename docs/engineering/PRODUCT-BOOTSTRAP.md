# Product Bootstrap

```text
Fresh deployment
  -> environment contract (.env.example)
  -> product:start
  -> advisory-locked pending migrations
  -> /setup secret gate
  -> Platform Owner
  -> First organization/workspace and regional defaults
  -> atomic setup_complete
  -> locked setup
  -> normal Product operation
```

## Sources of Truth

- Migration history: ordered files in `supabase/migrations/` and `supabase_migrations.schema_migrations`.
- Setup completion: the earliest `settings` row with `scope = platform`, `key = setup_complete`, and `value.complete = true`.
- Platform administrator: `user_roles.role = superadmin`.
- Setup authorization: server-only `SETUP_SECRET` plus a short-lived signed, HttpOnly, SameSite=Strict cookie.
- Setup abuse control: `setup_secret_attempts` and its service-role-only rate-limit functions.
- Product identity: platform `settings` key `branding`.
- System defaults: platform `settings` key `localization`.
- Advanced authentication and billing settings remain available after setup.

## Startup and Migrations

`npm run product:start` runs `product:migrate` before the HTTP server. The runner:

1. requires the server-only `DATABASE_URL`;
2. takes a PostgreSQL advisory lock, serializing concurrent container boots;
3. reads the authoritative ordered SQL migrations;
4. applies only versions absent from `supabase_migrations.schema_migrations`;
5. records each successful migration in the Supabase-compatible history table;
6. runs each migration and its history write in one transaction;
7. exits non-zero on failure, so the application does not start against an uncertain schema.

It never resets a database and exposes no SQL or command execution over HTTP. The frozen 290 Product v1.0.0 baseline migrations remain immutable; bootstrap security was added as migration `20260829190000_a389ab41-f42c-4427-aea9-91692a609a2e.sql`.

Generated verification users use the existing account-deletion path. Additive
migrations `20260830100000_54e4f433-702e-423e-a5a0-9fa8dc76971e.sql` and
`20260830101000_581a5211-8342-4a8d-bfa3-f93576596949.sql` correct inherited
deletion/audit defects without changing RLS or tenant ownership: deletion audit
rows retain immutable resource snapshots while deleted organization/workspace
foreign keys remain null, and workspace-member successor ordering uses the
actual `created_at` column.

## Setup Security

Production fails closed when `SETUP_SECRET` is absent or shorter than 24 characters. The raw value is compared only on the server, never logged, returned, stored in the database, or bundled for the browser. Five failed attempts from the same hashed request fingerprint trigger a 15-minute lock.

Every privileged setup server function independently requires both an incomplete setup and a valid signed setup session. Database functions serialize setting writes, the one-time Super Admin claim, and completion under one lifecycle advisory lock. Completion rechecks core services and the Super Admin, then atomically writes `setup_complete`. A completed setup rejects stale tabs and cannot be reopened with `SETUP_SECRET`.

## Optional Integrations

AI, WhatsApp, Meta, Messenger, Instagram, Telegram, Email/SMS, Stripe/Paddle,
calendar connectors and other implemented providers are not core boot
dependencies. The wizard derives its inventory from the environment catalog and
reports missing optional values as **Not configured**. It does not list future
or absent integrations. When no supported AI secret exists, initial AI
provider/config flags are disabled; AI calls remain unavailable until an
operator configures a provider later.

## Legacy URLs

`/install` contains no installer. Before Product setup it redirects to `/setup`;
after completion it redirects to `/auth`. Customer-facing demo accounts, demo
login, demo credentials and the demo banner are removed. Local verification
uses generated fixtures and deletes them before the verification command exits.

## Recovery

Setup recovery is intentionally not exposed in the Product UI. An operator must follow a reviewed database recovery procedure with a backup and explicit authorization. `SETUP_SECRET` alone never clears `setup_complete`.
