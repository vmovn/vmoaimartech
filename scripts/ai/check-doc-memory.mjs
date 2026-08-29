import { existsSync, readFileSync } from "node:fs";

const agents = readFileSync("AGENTS.md", "utf8");
const requiredPhrases = ["Mandatory preflight", "Core invariants", "Upstream policy", "Product memory rule"];
const failed = requiredPhrases.filter((x) => !agents.includes(x));
if (failed.length) {
  console.error("AGENTS.md governance sections missing:", failed.join(", "));
  process.exit(1);
}
if (!existsSync("docs/quality/REGRESSION-MATRIX.md")) process.exit(1);
console.log("AI repository memory contract OK");
