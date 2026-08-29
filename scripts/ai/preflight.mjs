import { existsSync } from "node:fs";

const required = [
  "AGENTS.md",
  "PRODUCT.md",
  "ARCHITECTURE.md",
  "DESIGN.md",
  "GLOSSARY.md",
  "CONTEXT-MAP.md",
  "docs/upstream/BASELINE.md",
];

const missing = required.filter((file) => !existsSync(file));
if (missing.length) {
  console.error("AI governance preflight failed. Missing:");
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}
console.log("AI governance preflight OK");
