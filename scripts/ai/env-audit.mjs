import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const catalogPath = join(root, "src/lib/environment/environment-catalog.json");
const examplePath = join(root, ".env.example");
const referencePath = join(root, "docs/engineering/ENVIRONMENT-VARIABLES.md");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));

const ACTIVE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".yml",
  ".yaml",
  ".toml",
  ".cmd",
  ".ps1",
  ".sh",
]);
const ACTIVE_ROOTS = ["src", "scripts", "qr-worker/src"];
const ROOT_FILES = [
  "app.js",
  "app.cjs",
  "vite.config.ts",
  "playwright.config.ts",
  "Dockerfile",
  "Dockerfile.dev",
  "docker-compose.yml",
  "docker-compose.dev.yml",
  "docker-compose.staging.yml",
  "vitest.rls.config.ts",
  "START-LOCAL.cmd",
  "RESET-LOCAL.cmd",
  "STOP-LOCAL.cmd",
];
const EXCLUDED = [
  "node_modules",
  ".git",
  ".output",
  "dist",
  "coverage",
  "src/routeTree.gen.ts",
  "src/integrations/supabase/types.ts",
];

// These are documentation snippets rendered by developer tools, not configuration
// read by this application. Keeping the allowlist explicit prevents regex drift.
const IGNORED_SNIPPET_REFERENCES = new Map([
  ["SWIFFER_API_KEY", "src/routes/_authenticated/developer-portal.tsx"],
  ["SWIFFER_WEBHOOK_SECRET", "src/routes/_authenticated/developer-tools.webhook-tester.tsx"],
]);
const VITE_BUILT_INS = new Set(["DEV", "PROD", "MODE", "BASE_URL", "SSR"]);
const CMD_EXPORTED_ENV = new Set([
  "SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_PROJECT_ID",
  "SUPABASE_TELEMETRY_DISABLED",
]);

function walk(directory, output = []) {
  if (!statSync(directory, { throwIfNoEntry: false })?.isDirectory()) return output;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    const rel = relative(root, full).replaceAll("\\", "/");
    if (EXCLUDED.some((part) => rel === part || rel.startsWith(`${part}/`))) continue;
    if (entry.isDirectory()) walk(full, output);
    else if (ACTIVE_EXTENSIONS.has(extname(entry.name))) output.push(full);
  }
  return output;
}

const files = [
  ...ACTIVE_ROOTS.flatMap((item) => walk(join(root, item))),
  ...ROOT_FILES.map((item) => join(root, item)).filter((item) =>
    statSync(item, { throwIfNoEntry: false })?.isFile(),
  ),
];
const used = new Map();

function record(key, file) {
  if (!key || VITE_BUILT_INS.has(key)) return;
  const rel = relative(root, file).replaceAll("\\", "/");
  if (IGNORED_SNIPPET_REFERENCES.get(key) === rel) return;
  const sites = used.get(key) ?? new Set();
  sites.add(rel);
  used.set(key, sites);
}

const accessPatterns = [
  /process\.env\??\.([A-Z][A-Z0-9_]*)/gu,
  /process\.env\??\.?(?:\[|\?\.\[)["']([A-Z][A-Z0-9_]*)["']\]/gu,
  /import\.meta\.env\??\.([A-Z][A-Z0-9_]*)/gu,
  /import\.meta\.env\??\.?(?:\[|\?\.\[)["']([A-Z][A-Z0-9_]*)["']\]/gu,
  /Deno\.env\.get\(["']([A-Z][A-Z0-9_]*)["']\)/gu,
  /Bun\.env(?:\.|\[["'])([A-Z][A-Z0-9_]*)/gu,
];

for (const file of files) {
  const contents = readFileSync(file, "utf8");
  const extension = extname(file).toLowerCase();
  const name = relative(root, file).replaceAll("\\", "/");
  for (const pattern of accessPatterns) {
    for (const match of contents.matchAll(pattern)) record(match[1], file);
  }
  if ([".yml", ".yaml"].includes(extension) || name.startsWith("Dockerfile")) {
    for (const match of contents.matchAll(/\$\{([A-Z][A-Z0-9_]*)(?::-[^}]*)?\}/gu))
      record(match[1], file);
  }
  if (name.startsWith("Dockerfile")) {
    for (const match of contents.matchAll(/^\s*(?:ARG|ENV)\s+([A-Z][A-Z0-9_]*)/gmu))
      record(match[1], file);
  }
  if (extension === ".cmd") {
    for (const match of contents.matchAll(/^\s*set\s+"?([A-Z][A-Z0-9_]*)=/gimu)) {
      if (CMD_EXPORTED_ENV.has(match[1])) record(match[1], file);
    }
  }
  for (const match of contents.matchAll(/suggestedSecretName:\s*["']([A-Z][A-Z0-9_]*)["']/gu))
    record(match[1], file);
  for (const match of contents.matchAll(/required\(["']([A-Z][A-Z0-9_]*)["']\)/gu))
    record(match[1], file);
  for (const match of contents.matchAll(
    /["']([A-Z][A-Z0-9_]*APP_USER_CONNECTOR_CLIENT_API_KEY)["']/gu,
  ))
    record(match[1], file);
  for (const match of contents.matchAll(/resolveSecretByName\(["']([A-Z][A-Z0-9_]*)["']/gu))
    record(match[1], file);
}

// The implemented billing route resolves these names from a provider id at runtime.
record("STRIPE_WEBHOOK_SECRET", join(root, "src/routes/api/public/webhooks/billing.$provider.ts"));
record("PADDLE_WEBHOOK_SECRET", join(root, "src/routes/api/public/webhooks/billing.$provider.ts"));

const catalogVariables = catalog.variables;
const catalogKeys = new Set(catalogVariables.map((item) => item.key));
const exampleKeys = new Set(
  readFileSync(examplePath, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/u)?.[1])
    .filter(Boolean),
);
const reference = readFileSync(referencePath, "utf8");

const errors = [];
const warnings = [];
for (const [key, sites] of used) {
  if (!catalogKeys.has(key))
    errors.push(`Used but absent from catalog: ${key} (${[...sites].join(", ")})`);
  if (!exampleKeys.has(key)) errors.push(`Used but absent from .env.example: ${key}`);
  if (!reference.includes(`\`${key}\``))
    errors.push(`Used but absent from ENVIRONMENT-VARIABLES.md: ${key}`);
}
for (const key of catalogKeys) {
  if (!used.has(key)) warnings.push(`Catalog key has no active executable reference: ${key}`);
  if (!exampleKeys.has(key)) errors.push(`Catalog key absent from .env.example: ${key}`);
  if (!reference.includes(`\`${key}\``))
    errors.push(`Catalog key absent from ENVIRONMENT-VARIABLES.md: ${key}`);
}
for (const key of exampleKeys) {
  if (!catalogKeys.has(key)) warnings.push(`.env.example key is not in the catalog: ${key}`);
}
for (const item of catalogVariables) {
  if (
    /^VITE_/u.test(item.key) &&
    /(SECRET|TOKEN|PASSWORD|SERVICE_ROLE|PRIVATE_KEY)/u.test(item.key)
  ) {
    errors.push(`Suspicious secret-like browser variable: ${item.key}`);
  }
  if (
    /(^|_)(LOCAL|DEMO|SMOKE|TEST)(_|$)/u.test(item.key) &&
    !["LOCAL_ONLY", "CI"].includes(item.scope)
  ) {
    errors.push(
      `Local/test/demo variable appears in a production scope: ${item.key} (${item.scope})`,
    );
  }
}

console.log(
  `Environment audit: ${used.size} active keys, ${catalogKeys.size} catalog keys, ${exampleKeys.size} example keys.`,
);
for (const warning of warnings) console.warn(`WARN: ${warning}`);
for (const error of errors) console.error(`ERROR: ${error}`);
if (errors.length > 0 || warnings.length > 0) process.exitCode = 1;
else console.log("Environment catalog, documentation and template are synchronized.");
