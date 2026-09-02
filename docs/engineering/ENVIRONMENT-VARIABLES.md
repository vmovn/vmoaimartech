# Environment Variables

This is the canonical human-readable environment reference for the current Product baseline. Machine-readable metadata lives in `src/lib/environment/environment-catalog.json`; `npm run env:audit` keeps the catalog, this document and `.env.example` synchronized.

Never store real values in this repository. `VITE_*` values are public build inputs. Service-role keys, provider secrets, signing secrets and passwords must remain server-only.

Requiredness: **Required** blocks safe Product setup; **Conditional** is required only when the named capability is enabled; **Optional** has a safe default; **Dev/CI only** must not be copied into Coolify.

## 1. Minimum Core Environment

| Variable | Purpose | Requiredness | Secret | Scope | Feature dependency | Coolify |
|---|---|---|---|---|---|---|
| `DATABASE_URL` | Direct PostgreSQL URL for the migration runner | Required | Yes | Runtime server | Database & migrations | Yes |
| `SUPABASE_URL` | Server-side Supabase API/Auth/Storage base URL | Required | No | Runtime server | Supabase | Yes |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key for server-authenticated/public clients | Required | No | Runtime server | Supabase | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged server administration | Required | Yes | Runtime server | Setup, jobs, webhooks | Yes |
| `APP_ORIGIN` | Canonical application origin | Required | No | Runtime server | Redirect/CORS/deployment safety | Yes |
| `SESSION_SECRET` | Server session signing/encryption | Required | Yes | Runtime server | Application security | Yes |
| `SETUP_SECRET` | One-time first-run setup authorization | Required | Yes | Runtime server | Secure setup | Yes |

Validation: database URL must use `postgres://` or `postgresql://`; URLs must be absolute; `SESSION_SECRET` should be at least 32 random characters; `SETUP_SECRET` must be at least 24 characters. Production `APP_ORIGIN` must use HTTPS and must not be localhost.

## 2. Build / Public Environment

| Variable | Purpose | Requiredness | Secret | Scope | Feature dependency | Coolify |
|---|---|---|---|---|---|---|
| `VITE_SUPABASE_URL` | Browser Supabase endpoint | Required | No | Build public | Web Data/Auth client | Yes |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser publishable key | Required | No | Build public | Web Data/Auth client | Yes |
| `PUBLIC_BASE_URL` | Asset base path for sub-path hosting | Conditional | No | Build public | Non-root deployment | Conditional |
| `VITE_APP_ENV` | Browser-visible deployment label | Optional | No | Build public | Environment display | Yes |
| `VITE_BRAND_NAME` | Static build-time brand fallback | Optional | No | Build public | Static/white-label copy | Conditional |
| `VITE_DOCS_BASE_URL` | Operator-owned external documentation base URL | Conditional | No | Build public | Static documentation links | Conditional |
| `DEPLOY_TARGET` | Selects Node-compatible build output | Conditional | No | Build public | Docker/Coolify Node build | Yes |
| `NITRO_PRESET` | Alternative Nitro build selector | Conditional | No | Build public | Custom build pipeline | Conditional |
| `SWIFFER_VERSION` | Inherited Compose image/build tag variable | Optional | No | Build public | Docker Compose | Conditional |

`VITE_SUPABASE_PUBLISHABLE_KEY` is intentionally public. `SUPABASE_SERVICE_ROLE_KEY` must never be renamed into a `VITE_*` variable.

## 3. Runtime / Server Secrets and Settings

| Variable | Purpose | Requiredness | Secret | Scope | Feature dependency | Coolify |
|---|---|---|---|---|---|---|
| `NODE_ENV` | Runtime safeguard mode | Optional | No | Runtime server | Application runtime | Yes |
| `HOST` | Bind interface | Optional | No | Runtime server | Node app / QR worker | Yes |
| `PORT` | Listening port | Optional | No | Runtime server | Node app / tests / worker | Yes |
| `PASSENGER_PORT` | Inherited cPanel Passenger port fallback | Conditional | No | Runtime server | Passenger only | No |
| `LOG_LEVEL` | Logging verbosity | Optional | No | Runtime server | App / QR worker | Yes |
| `APP_VERSION` | Release version in image/health output | Optional | No | Runtime server | Deployment metadata | Yes |
| `APP_COMMIT` | Commit identifier in health output | Optional | No | Runtime server | Deployment metadata | Yes |
| `APP_REPLICAS` | Docker Compose replica count | Optional | No | Runtime server | Compose deploy mode | No |
| `INTERNAL_CRON_TOKEN` | Authenticates scheduled internal hooks | Conditional | Yes | Runtime server | Jobs/synchronization | Conditional |
| `WEBHOOK_DISPATCH_SECRET` | Authenticates webhook dispatch | Conditional | Yes | Runtime server | Webhook dispatch | Conditional |
| `WIDGET_SIGNING_SECRET` | Signs widget/live-chat sessions | Conditional | Yes | Runtime server | Client widgets | Conditional |
| `APP_USER_CONNECTION_KEY_SECRET` | Encrypts provider connection keys | Conditional | Yes | Runtime server | Calendar/Meta connections | Conditional |

## 4. Supabase / Edge Function Environment

The repository currently contains no Supabase Edge Function implementation. There are therefore no active `Deno.env.get(...)` or Supabase Edge-only variables. Supabase-backed server routes use the core server variables in section 1.

The local Supabase CLI additionally receives `SUPABASE_PROJECT_ID` and `SUPABASE_TELEMETRY_DISABLED`; those are documented under local development and are not deployment secrets.

## 5. AI Providers

| Variable | Purpose | Requiredness | Secret | Scope | Feature dependency | Coolify |
|---|---|---|---|---|---|---|
| `LOVABLE_API_KEY` | Lovable managed email-event and App User Connector key. Not used for AI inference. | Conditional | Yes | Runtime server | Managed email / calendar connector | Conditional |
| `OPENAI_API_KEY` | OpenAI provider credential | Conditional | Yes | Runtime server | OpenAI | Conditional |
| `ANTHROPIC_API_KEY` | Anthropic provider credential | Conditional | Yes | Runtime server | Anthropic | Conditional |
| `GEMINI_API_KEY` | Gemini provider credential | Conditional | Yes | Runtime server | Gemini | Conditional |
| `DEEPSEEK_API_KEY` | DeepSeek-compatible provider credential | Conditional | Yes | Runtime server | DeepSeek | Conditional |
| `OPENROUTER_API_KEY` | OpenRouter-compatible provider credential | Conditional | Yes | Runtime server | OpenRouter | Conditional |
| `CUSTOM_AI_API_KEY` | Default custom OpenAI-compatible credential name | Conditional | Yes | Runtime server | Custom AI provider | Conditional |
| `OLLAMA_BASE_URL` | Internal OpenAI-compatible URL for the shared platform Ollama utility service | Conditional | No | Runtime server | Platform-managed Ollama | Conditional |
| `OLLAMA_UTILITY_MODEL` | Default local chat model id for utility features such as conversation intelligence | Optional | No | Runtime server | Platform-managed Ollama | Conditional |
| `AI_CREDENTIAL_ENCRYPTION_KEY` | Operator master key that encrypts workspace BYOK API keys at rest | Conditional | Yes | Runtime server | Workspace BYOK | Conditional |
| `KB_VECTOR_STORE` | Knowledge-base vector backend selector; defaults to pgvector | Optional | No | Runtime server | Knowledge Base / RAG | Conditional |

Ollama is a keyless self-hosted provider. Production must set `OLLAMA_BASE_URL` to the operator-controlled internal URL (do not assume localhost or a Coolify hostname in source). Local development may omit it and use `http://localhost:11434/v1`. `OLLAMA_UTILITY_MODEL` selects the workspace utility model used when seeding `conversation_intelligence`; it is not a customer-facing chatbot default.

`AI_CREDENTIAL_ENCRYPTION_KEY` is the PM.ai.vn operator master key for workspace BYOK. It is not a customer Gemini/OpenAI key. Use a dedicated 32-byte base64 secret. Workspace keys are stored encrypted in `ai_provider_secrets` and are never returned to the browser. Missing this key does not block platform startup or keyless Ollama; BYOK save/decrypt fails clearly. Existing `GEMINI_API_KEY` / `OPENAI_API_KEY` (and siblings) remain valid for operator-managed `api_key_secret_name` providers.

Other provider kinds remain configured through workspace/provider settings and their API keys.

## 6. Messaging Providers

### WhatsApp Cloud and Meta

| Variable | Purpose | Requiredness | Secret | Scope | Feature dependency | Coolify |
|---|---|---|---|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Default WhatsApp Cloud access-token secret | Conditional | Yes | Runtime server | WhatsApp Cloud | Conditional |
| `WHATSAPP_APP_SECRET` | Default WhatsApp webhook HMAC secret | Conditional | Yes | Runtime server | WhatsApp Cloud webhooks | Conditional |
| `WHATSAPP_WABA_ID` | Optional global WABA ID fallback | Conditional | No | Runtime server | WhatsApp Flows | Conditional |
| `WHATSAPP_PHONE_NUMBER_ID` | Optional global phone-number ID fallback | Conditional | No | Runtime server | WhatsApp Flows | Conditional |
| `META_ACCESS_TOKEN` | Supported access-token alias | Conditional | Yes | Runtime server | WhatsApp/Meta fallback | Conditional |
| `META_APP_ID` | Meta OAuth application ID | Conditional | No | Runtime server | Messenger/Instagram | Conditional |
| `META_APP_SECRET` | Meta OAuth and webhook secret | Conditional | Yes | Runtime server | Messenger/Instagram | Conditional |
| `META_WEBHOOK_VERIFY_TOKEN` | Shared Meta webhook subscription token | Conditional | Yes | Runtime server | Messenger/Instagram fallback | Conditional |
| `MESSENGER_WEBHOOK_VERIFY_TOKEN` | Messenger-specific verify token | Conditional | Yes | Runtime server | Messenger | Conditional |
| `IG_WEBHOOK_VERIFY_TOKEN` | Instagram-specific verify token | Conditional | Yes | Runtime server | Instagram | Conditional |
| `META_TOKEN_ENCRYPTION_KEY` | Preferred Meta token-encryption key | Conditional | Yes | Runtime server | Instagram/Meta connections | Conditional |

Per-account WhatsApp secret names may also be stored in database configuration. Their values are resolved from the server environment dynamically and are never returned to the browser.

### WhatsApp QR worker

| Variable | Purpose | Requiredness | Secret | Scope | Feature dependency | Coolify |
|---|---|---|---|---|---|---|
| `WA_QR_WORKER_URL` | App-to-worker base URL | Conditional | No | Runtime server | QR WhatsApp Login | Conditional |
| `WA_QR_WORKER_TOKEN` | App/worker bearer token | Conditional | Yes | Runtime server | QR WhatsApp Login | Conditional |
| `WA_QR_WORKER_SIGNING_SECRET` | App-to-worker HMAC secret | Conditional | Yes | Runtime server | QR WhatsApp Login | Conditional |
| `WA_QR_WEBHOOK_SECRET` | Worker-to-app HMAC secret | Conditional | Yes | Runtime server | QR WhatsApp Login | Conditional |
| `SWIFFER_WEBHOOK_URL` | Inherited worker callback URL variable | Conditional | No | Runtime server | QR worker | Conditional |
| `WA_AUTH_DIR` | Persistent worker credential directory | Conditional | No | Runtime server | QR worker | Conditional |

### Telegram

| Variable | Purpose | Requiredness | Secret | Scope | Feature dependency | Coolify |
|---|---|---|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Optional fallback token during Telegram connection | Conditional | Yes | Runtime server | Telegram Bots | Conditional |

## 7. Email / SMS

| Variable | Purpose | Requiredness | Secret | Scope | Feature dependency | Coolify |
|---|---|---|---|---|---|---|
| `SMTP_HOST` | Inherited optimization-report readiness marker only | Optional | No | Runtime server | External SMTP convention | Conditional |
| `TWILIO_AUTH_TOKEN` | Validates inbound Twilio SMS signatures | Conditional | Yes | Runtime server | SMS Numbers / Twilio | Conditional |

Email account credentials for current Resend/Mailgun marketplace flows are stored in workspace integration configuration, not read from fixed environment names. The managed email-event endpoint uses `LOVABLE_API_KEY`.

## 8. Payment / Billing Providers

| Variable | Purpose | Requiredness | Secret | Scope | Feature dependency | Coolify |
|---|---|---|---|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe REST API credential | Conditional | Yes | Runtime server | Stripe billing | Conditional |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature secret | Conditional | Yes | Runtime server | Stripe webhooks | Conditional |
| `PADDLE_API_KEY` | Paddle REST API credential | Conditional | Yes | Runtime server | Paddle billing | Conditional |
| `PADDLE_ENV` | Paddle sandbox/live selector | Conditional | No | Runtime server | Paddle billing | Conditional |
| `PADDLE_WEBHOOK_SECRET` | Paddle webhook signature secret | Conditional | Yes | Runtime server | Paddle webhooks | Conditional |

Other billing providers in `src/lib/billing/providers/future.ts` are explicit stubs and are not environment capabilities in this inventory.

## 9. Other Current Integrations

| Variable | Purpose | Requiredness | Secret | Scope | Feature dependency | Coolify |
|---|---|---|---|---|---|---|
| `GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY` | Starts Google Calendar connector OAuth | Conditional | Yes | Runtime server | Google Calendar | Conditional |
| `MICROSOFT_OUTLOOK_APP_USER_CONNECTOR_CLIENT_API_KEY` | Starts Microsoft Outlook connector OAuth | Conditional | Yes | Runtime server | Microsoft Outlook | Conditional |

The Integration Marketplace also contains database-configured providers (Google Workspace, Microsoft 365, Slack, Discord, Zoom, Teams, Resend, Mailgun, S3, R2, Zapier, Make, n8n, inbound webhooks and HTTP Connector). Their connection credentials are entered after setup and are not fixed deployment environment variables.

## 10. Optional Variables

The following optional/current values have safe defaults and do not block setup: `NODE_ENV`, `HOST`, `PORT`, `LOG_LEVEL`, `APP_VERSION`, `APP_COMMIT`, `PUBLIC_BASE_URL`, `VITE_APP_ENV`, `VITE_BRAND_NAME`, `APP_REPLICAS`, `SWIFFER_VERSION`, `KB_VECTOR_STORE`, and `SMTP_HOST`.

Conditional provider and platform variables remain **Not configured** until their capability is explicitly enabled. Missing conditional values are not a core-system failure.

## 11. Local Development Only

Development only — do not copy these values to Coolify.

| Variable | Purpose | Requiredness | Secret | Scope | Feature dependency | Coolify |
|---|---|---|---|---|---|---|
| `VITE_DEBUG_COUNTS` | Browser conversation-count diagnostics | Dev only | No | Local only | Debugging | No |
| `VITE_AUDIT_VERBOSE` | Verbose browser audit telemetry | Dev only | No | Local only | Debugging | No |
| `SUPABASE_PROJECT_ID` | Pins CLI operations to `vmoaimartech-local` | Dev only | No | Local only | Local Supabase | No |
| `VITE_SUPABASE_PROJECT_ID` | Neutralizes an inherited local placeholder; web app does not read it | Dev only | No | Local only | Windows launchers | No |
| `SUPABASE_TELEMETRY_DISABLED` | Disables Supabase CLI telemetry | Dev only | No | Local only | Local tooling | No |

Local URLs such as `http://127.0.0.1:8080` and `http://127.0.0.1:56321` are also development-only. No `LOCAL_DEV_EMAIL`, `LOCAL_DEV_PASSWORD`, demo login, quick-login or persistent smoke account is part of local startup.

## 12. CI / Test Only

| Variable | Purpose | Requiredness | Secret | Scope | Feature dependency | Coolify |
|---|---|---|---|---|---|---|
| `RLS_TEST_HARNESS_SECRET` | Explicitly enables/authenticates the RLS harness | CI only | Yes | CI | RLS tests | No |
| `RLS_TEST_HARNESS_ALLOW_PROD` | Dangerous controlled staging override | CI only | No | CI | RLS staging drill | No |
| `E2E_BASE_URL` | Remote Playwright target | CI only | No | CI | Browser tests | No |
| `CI` | CI-platform indicator | CI only | No | CI | Browser test behavior | No |
| `PGHOST` | Enables psql-based engineering audits | CI only | No | CI | Database audits | No |
| `GITHUB_STEP_SUMMARY` | GitHub Actions summary output path | CI only | No | CI | CI reporting | No |

The RLS harness creates generated ephemeral users only on explicit invocation and exposes a teardown route. It is disabled when `RLS_TEST_HARNESS_SECRET` is absent.

## 13. Deprecated / Stale Variables Discovered

These names were found in ignored local state, legacy documentation, obsolete templates or deployment wiring but are not authoritative current runtime configuration:

| Variable | Finding | Action |
|---|---|---|
| `LOCAL_DEV_EMAIL`, `LOCAL_DEV_PASSWORD` | Persistent local verifier credentials | Removed; verifier now generates and deletes fixtures |
| `VITE_DEMO_MODE`, `DEMO_MODE`, `APP_MODE`, `VITE_APP_MODE` | Ignored/legacy demo-mode configuration; current auth code does not read it | Remove from local state and legacy docs |
| `ZALO_OA_ACCESS_TOKEN` | Template/setup guess with no executable Zalo integration | Removed; do not configure |
| `WHATSAPP_VERIFY_TOKEN` | Legacy environment alias; current account verify tokens are database-owned | Removed from canonical deployment template |
| `WEBHOOK_SECRET` | Passed by inherited Compose but not read by application code | Removed from Compose/template |
| `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Previously documented, no executable reader | Removed from canonical template |
| `SWIFFER_API_KEY`, `SWIFFER_WEBHOOK_SECRET` | Appear only inside developer-facing code snippets | Removed from deployment template |
| `RLS_HARNESS_BASE_URL` | Documentation-only name; current test config reads `E2E_BASE_URL` | Deprecated candidate |

Mobile note: `mobile/src/lib/env.ts` reads `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `API_BASE_URL` from Expo `app.json → extra`. Those are current mobile build configuration keys, not process environment variables and not Coolify server variables. Do not invent environment aliases without first changing the mobile build architecture.
