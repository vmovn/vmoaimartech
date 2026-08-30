import { randomBytes } from "node:crypto";

export const LOCAL_SECRET_NAMES = [
  "SESSION_SECRET",
  "SETUP_SECRET",
  "INTERNAL_CRON_TOKEN",
  "WEBHOOK_DISPATCH_SECRET",
  "WIDGET_SIGNING_SECRET",
  "APP_USER_CONNECTION_KEY_SECRET",
  "WA_QR_WEBHOOK_SECRET",
  "WA_QR_WORKER_TOKEN",
  "WA_QR_WORKER_SIGNING_SECRET",
];

export function parseLocalEnv(contents) {
  const values = new Map();
  for (const line of contents.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const name = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values.set(name, value);
  }
  return values;
}

export function isReusableLocalSecret(value) {
  if (typeof value !== "string" || value.length < 32) return false;
  if (value.includes("<") || value.includes(">")) return false;
  if (value.startsWith("local-development-")) return false;
  return true;
}

export function generateLocalSecret(name) {
  const entropy = randomBytes(32).toString("base64url");
  return entropy;
}

export function resolveLocalSecrets(existingValues = new Map()) {
  return Object.fromEntries(
    LOCAL_SECRET_NAMES.map((name) => {
      const existing = existingValues.get(name);
      return [name, isReusableLocalSecret(existing) ? existing : generateLocalSecret(name)];
    }),
  );
}
