# Coolify Environment Checklist

Use this checklist later in **Coolify → Environment Variables**. It reflects only capabilities implemented in the current repository. Never paste values from `.env.local`, never add future-provider placeholders, and never expose a server secret through `VITE_*`.

## Section A — Must Configure

Production cannot complete secure setup without these names:

```text
DATABASE_URL
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
APP_ORIGIN
SESSION_SECRET
SETUP_SECRET
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
DEPLOY_TARGET
NODE_ENV
HOST
PORT
```

Production expectations:

- `APP_ORIGIN` is the final HTTPS origin, with no path or trailing localhost value.
- `VITE_SUPABASE_URL` is the production Supabase URL and is intentionally public.
- `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` and `SETUP_SECRET` are server-only.
- `DEPLOY_TARGET` selects the existing Node build path.
- The existing container health endpoint is `/api/public/health`; deep readiness is `/api/public/health/ready`.

## Section B — Configure If Feature Enabled

### Platform jobs, webhooks and widgets

```text
INTERNAL_CRON_TOKEN
WEBHOOK_DISPATCH_SECRET
WIDGET_SIGNING_SECRET
APP_USER_CONNECTION_KEY_SECRET
```

### AI providers

```text
LOVABLE_API_KEY
OPENAI_API_KEY
ANTHROPIC_API_KEY
GEMINI_API_KEY
DEEPSEEK_API_KEY
OPENROUTER_API_KEY
CUSTOM_AI_API_KEY
OLLAMA_BASE_URL
OLLAMA_UTILITY_MODEL
OLLAMA_MAX_CONCURRENCY
OLLAMA_WORKSPACE_MAX_CONCURRENCY
AI_CREDENTIAL_ENCRYPTION_KEY
KB_VECTOR_STORE
```

### WhatsApp Cloud and Meta

```text
WHATSAPP_ACCESS_TOKEN
WHATSAPP_APP_SECRET
WHATSAPP_WABA_ID
WHATSAPP_PHONE_NUMBER_ID
META_ACCESS_TOKEN
META_APP_ID
META_APP_SECRET
META_WEBHOOK_VERIFY_TOKEN
MESSENGER_WEBHOOK_VERIFY_TOKEN
IG_WEBHOOK_VERIFY_TOKEN
META_TOKEN_ENCRYPTION_KEY
```

### WhatsApp QR worker

```text
WA_QR_WORKER_URL
WA_QR_WORKER_TOKEN
WA_QR_WORKER_SIGNING_SECRET
WA_QR_WEBHOOK_SECRET
SWIFFER_WEBHOOK_URL
WA_AUTH_DIR
```

The three QR secrets must match between the app and the separately deployed worker. `WA_AUTH_DIR` must use persistent worker storage.

### Telegram, email and SMS

```text
TELEGRAM_BOT_TOKEN
SMTP_HOST
TWILIO_AUTH_TOKEN
```

`SMTP_HOST` is currently only an inherited readiness marker; current email account credentials are otherwise configured after setup.

### Billing

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
PADDLE_API_KEY
PADDLE_ENV
PADDLE_WEBHOOK_SECRET
```

### Calendar connections

```text
GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY
MICROSOFT_OUTLOOK_APP_USER_CONNECTOR_CLIENT_API_KEY
APP_USER_CONNECTION_KEY_SECRET
```

## Section C — Public Build Variables

These values may appear in the browser bundle by design:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_APP_ENV
VITE_BRAND_NAME
VITE_DOCS_BASE_URL
PUBLIC_BASE_URL
DEPLOY_TARGET
NITRO_PRESET
SWIFFER_VERSION
```

Do not put tokens, passwords, service-role keys or private provider credentials in any `VITE_*` variable.

## Section D — Server / Secret Variables

These must never enter the frontend bundle:

```text
DATABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SESSION_SECRET
SETUP_SECRET
INTERNAL_CRON_TOKEN
WEBHOOK_DISPATCH_SECRET
WIDGET_SIGNING_SECRET
APP_USER_CONNECTION_KEY_SECRET
LOVABLE_API_KEY
OPENAI_API_KEY
ANTHROPIC_API_KEY
GEMINI_API_KEY
DEEPSEEK_API_KEY
OPENROUTER_API_KEY
CUSTOM_AI_API_KEY
WHATSAPP_ACCESS_TOKEN
WHATSAPP_APP_SECRET
META_ACCESS_TOKEN
META_APP_SECRET
META_WEBHOOK_VERIFY_TOKEN
MESSENGER_WEBHOOK_VERIFY_TOKEN
IG_WEBHOOK_VERIFY_TOKEN
META_TOKEN_ENCRYPTION_KEY
WA_QR_WORKER_TOKEN
WA_QR_WORKER_SIGNING_SECRET
WA_QR_WEBHOOK_SECRET
TELEGRAM_BOT_TOKEN
TWILIO_AUTH_TOKEN
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
PADDLE_API_KEY
PADDLE_WEBHOOK_SECRET
GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY
MICROSOFT_OUTLOOK_APP_USER_CONNECTOR_CLIENT_API_KEY
```

## Section E — Do Not Copy From Local

Do not put these names or values into a normal Coolify production service:

```text
VITE_DEBUG_COUNTS
VITE_AUDIT_VERBOSE
SUPABASE_PROJECT_ID
VITE_SUPABASE_PROJECT_ID
SUPABASE_TELEMETRY_DISABLED
RLS_TEST_HARNESS_SECRET
RLS_TEST_HARNESS_ALLOW_PROD
E2E_BASE_URL
CI
PGHOST
GITHUB_STEP_SUMMARY
```

Also do not copy:

- localhost/loopback URLs;
- local Supabase keys or database URLs;
- `.env.local`;
- test-harness credentials;
- any demo/test/smoke email or password;
- `LOCAL_DEV_EMAIL` or `LOCAL_DEV_PASSWORD` (obsolete and removed);
- `VITE_DEMO_MODE`, `DEMO_MODE`, `APP_MODE` or `VITE_APP_MODE` (stale demo-mode names);
- `ZALO_OA_ACCESS_TOKEN` (no current executable integration).

## Optional Deployment Metadata

These are safe to set when the deployment pipeline supplies them:

```text
LOG_LEVEL
APP_VERSION
APP_COMMIT
APP_REPLICAS
```

Run `npm run env:audit` before deploying. After deployment, verify `/api/public/health`, `/api/public/health/ready`, then complete `/setup` exactly once.

## AI Core v1 — operator run (locked)

AI Core v1 is frozen. Super Admin configuration is required for Premium Credits; do not expect automatic platform-premium provisioning, automatic vendor prices, or invented plan allowances.

### Core runtime

```text
APP_ORIGIN
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
INTERNAL_CRON_TOKEN
```

`APP_ORIGIN` must be the production HTTPS origin (no path, no localhost). `INTERNAL_CRON_TOKEN` must be ≥32 characters. Product migrate/startup copies `APP_ORIGIN` and `INTERNAL_CRON_TOKEN` into Supabase Vault via `scripts/product/sync-cron-dispatcher-config.mjs`. pg_cron then posts to `APP_ORIGIN/api/public/hooks/analyze-conversations` with `x-cron-token`. Confirm Vault after deploy; do not hardcode a developer URL.

### Platform Local AI (Ollama)

```text
OLLAMA_BASE_URL
OLLAMA_UTILITY_MODEL
OLLAMA_MAX_CONCURRENCY
OLLAMA_WORKSPACE_MAX_CONCURRENCY
```

When `OLLAMA_BASE_URL` is set, first login and workspace creation ensure a workspace-scoped platform Ollama row and the existing utility feature configs. Missing Ollama must not block signup. Production must not use localhost.

### Workspace BYOK

```text
AI_CREDENTIAL_ENCRYPTION_KEY
```

Required only to save or use encrypted workspace keys. A 32-byte base64 AES-256 key. Missing this key does not block startup; BYOK save/decrypt fails clearly. Workspace keys never appear in `VITE_*`.

### Platform Premium AI (manual)

Set at least one operator ENV, for example:

```text
GEMINI_API_KEY
OPENAI_API_KEY
DEEPSEEK_API_KEY
```

Then in Super Admin:

1. Create the platform provider (secret name = the ENV key).
2. Apply to all workspaces.
3. Sync models.
4. Set real `inputCostPer1k` / `outputCostPer1k` (sync does not invent prices; zero prices fail closed).
5. Set plan `ai_premium_credits` to a real allowance (or `unlimited`). Seeded plans default to missing/zero until you save this.
6. Save the plan so `tenant_quotas` reseeds for active subscriptions.

`LOVABLE_API_KEY` is email/connector only. There is no `XAI_API_KEY`. Lovable AI and xAI/Grok are not supported.

### Live smoke (one paid call, not CI)

1. Configure one real platform provider and price one real model.
2. Give a test plan a small Premium Credit allowance and save/reseed.
3. Perform ONE premium request; confirm the answer and that org credits decreased.
4. Optionally perform ONE BYOK request; confirm credits are unchanged.
