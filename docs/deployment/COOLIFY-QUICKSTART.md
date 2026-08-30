# Coolify Quick Start

1. Create a Coolify application from this GitHub repository.
2. Paste the complete contents of `.env.example` into Coolify Environment Variables.
3. Fill every value in the `REQUIRED` sections. Mark both `VITE_` variables as build-time variables.
4. Use the repository `Dockerfile` and deploy. Its default command applies pending migrations safely before starting the application.
5. Open `https://your-domain/setup`.
6. Enter the `SETUP_SECRET` you configured in Coolify.
7. Create the Platform Super Admin.
8. Configure the basic Product identity, system defaults, and platform behavior.
9. Click **Launch Application**.
10. Setup is now permanently locked.

AI, email, WhatsApp, billing, and other integrations are optional. Configure them later from Product settings.

## Required Variables

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `APP_ORIGIN`
- `SESSION_SECRET`
- `SETUP_SECRET`

`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `SESSION_SECRET`, and `SETUP_SECRET` are server-only. Never give them a `VITE_` prefix.

## Troubleshooting

- **Deployment stops before the app starts:** read the `[product:migrate]` error in the Coolify log. Startup fails closed if a migration cannot be applied.
- **Setup says the secret is unavailable:** use at least 24 characters for `SETUP_SECRET`, then redeploy.
- **Setup core check fails:** confirm the required Supabase URLs and keys belong to the same project and that `DATABASE_URL` reaches its PostgreSQL database.
- **Wrong Setup Secret was entered repeatedly:** wait 15 minutes after five failed attempts.
- **Setup is already locked:** this is expected after completion. Recovery requires an explicit operator database procedure; the secret cannot reopen setup.
