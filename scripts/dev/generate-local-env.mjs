import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { parseLocalEnv, resolveLocalSecrets } from "./local-env-secrets.mjs";

const cli = fileURLToPath(new URL("../../node_modules/supabase/dist/supabase.js", import.meta.url));
const raw = execFileSync(process.execPath, [cli, "status", "-o", "json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
  env: {
    ...process.env,
    SUPABASE_PROJECT_ID: "vmoaimartech-local",
    VITE_SUPABASE_PROJECT_ID: "vmoaimartech-local",
    SUPABASE_TELEMETRY_DISABLED: "1",
  },
});
const status = JSON.parse(raw);
const publishableKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
const serverKey = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
const databaseUrl = status.DB_URL;

if (!status.API_URL || !publishableKey || !serverKey || !databaseUrl) {
  throw new Error("Local Supabase is not running or did not return its local keys.");
}

const envPath = ".env.local";
const temporaryEnvPath = ".env.local.tmp";
const existingValues = existsSync(envPath)
  ? parseLocalEnv(readFileSync(envPath, "utf8"))
  : new Map();
const secrets = resolveLocalSecrets(existingValues);

const lines = [
  "# Generated for this isolated local environment. Never commit this file.",
  "# Product-owned secrets are cryptographically random and preserved across normal starts.",
  "# RESET-LOCAL.cmd deletes this file, causing a completely new secret set to be generated.",
  "",
  "# Browser-safe local Supabase values.",
  `VITE_SUPABASE_URL=${status.API_URL}`,
  `VITE_SUPABASE_PUBLISHABLE_KEY=${publishableKey}`,
  "VITE_APP_ENV=development",
  "",
  `DATABASE_URL=${databaseUrl}`,
  `SUPABASE_URL=${status.API_URL}`,
  `SUPABASE_PUBLISHABLE_KEY=${publishableKey}`,
  `SUPABASE_SERVICE_ROLE_KEY=${serverKey}`,
  "",
  "# Product-owned server secrets. Never add a VITE_ prefix.",
  `SESSION_SECRET=${secrets.SESSION_SECRET}`,
  `SETUP_SECRET=${secrets.SETUP_SECRET}`,
  `INTERNAL_CRON_TOKEN=${secrets.INTERNAL_CRON_TOKEN}`,
  `WEBHOOK_DISPATCH_SECRET=${secrets.WEBHOOK_DISPATCH_SECRET}`,
  `WIDGET_SIGNING_SECRET=${secrets.WIDGET_SIGNING_SECRET}`,
  `APP_USER_CONNECTION_KEY_SECRET=${secrets.APP_USER_CONNECTION_KEY_SECRET}`,
  `WA_QR_WEBHOOK_SECRET=${secrets.WA_QR_WEBHOOK_SECRET}`,
  `WA_QR_WORKER_TOKEN=${secrets.WA_QR_WORKER_TOKEN}`,
  `WA_QR_WORKER_SIGNING_SECRET=${secrets.WA_QR_WORKER_SIGNING_SECRET}`,
  "",
  "NODE_ENV=development",
  "HOST=127.0.0.1",
  "PORT=8080",
  "APP_ORIGIN=http://127.0.0.1:8080",
  "LOG_LEVEL=debug",
  "",
  "# Third-party integrations remain intentionally unconfigured.",
  "# Add AI, WhatsApp, SMTP, Stripe, or other provider credentials manually when needed.",
  "",
];

writeFileSync(temporaryEnvPath, lines.join("\n"), { encoding: "utf8", mode: 0o600 });
rmSync(envPath, { force: true });
renameSync(temporaryEnvPath, envPath);
console.log("Wrote .env.local with local Supabase values and secure Product-owned secrets.");
