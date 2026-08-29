import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import process from "node:process";

const cli = fileURLToPath(new URL("../../node_modules/supabase/dist/supabase.js", import.meta.url));
const raw = execFileSync(process.execPath, [cli, "status", "-o", "json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});
const status = JSON.parse(raw);
const publishableKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
const serverKey = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;

if (!status.API_URL || !publishableKey || !serverKey) {
  throw new Error("Local Supabase is not running or did not return its local keys.");
}

const lines = [
  "# Generated from the local Supabase CLI. Never commit this file.",
  `VITE_SUPABASE_URL=${status.API_URL}`,
  `VITE_SUPABASE_PUBLISHABLE_KEY=${publishableKey}`,
  "VITE_APP_ENV=development",
  "VITE_APP_MODE=production",
  "VITE_DEMO_MODE=false",
  "",
  `SUPABASE_URL=${status.API_URL}`,
  `SUPABASE_PUBLISHABLE_KEY=${publishableKey}`,
  `SUPABASE_SERVICE_ROLE_KEY=${serverKey}`,
  "",
  "APP_MODE=production",
  "DEMO_MODE=false",
  "NODE_ENV=development",
  "HOST=127.0.0.1",
  "PORT=8080",
  "APP_ORIGIN=http://127.0.0.1:8080",
  "LOG_LEVEL=debug",
  "",
  "# Disposable local-only smoke-test account.",
  "LOCAL_DEV_EMAIL=dev@local.test",
  "LOCAL_DEV_PASSWORD=LocalDevOnly!2026",
  "",
];

writeFileSync(".env.local", lines.join("\n"), { encoding: "utf8", mode: 0o600 });
console.log("Wrote .env.local from the running local Supabase stack.");
