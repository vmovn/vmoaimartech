import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const requiredAgentPhrases = [
  "repository memory before repository discovery",
  "FAST / SURGICAL",
  "DEEP — escalate only when needed",
  "Core invariants",
  "Upstream policy",
  "Token-efficiency rule",
];

function contextFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return contextFiles(path);
    return entry.name === "CONTEXT.md" ? [path] : [];
  });
}

function primaryEntryPoints(contents) {
  const paths = [];
  let inPrimarySection = false;
  for (const line of contents.split(/\r?\n/u)) {
    if (/^##\s+Primary Entry Points?\s*$/u.test(line)) {
      inPrimarySection = true;
      continue;
    }
    if (inPrimarySection && /^##\s+/u.test(line)) break;
    if (!inPrimarySection) continue;
    for (const match of line.matchAll(/`((?:src|scripts|supabase|docs|\.env|package\.json|docker)[^`]+)`/gu)) {
      paths.push(match[1]);
    }
  }
  return paths;
}

function claimedPathExists(claim) {
  if (!claim.includes("*")) return existsSync(claim);
  const base = claim.slice(0, claim.indexOf("*")).replace(/[\\/]+$/u, "");
  return base.length > 0 && existsSync(base);
}

const failures = [];
if (!existsSync("CONTEXT-MAP.md")) failures.push("CONTEXT-MAP.md is missing");

const agents = readFileSync("AGENTS.md", "utf8");
const missingAgentPhrases = requiredAgentPhrases.filter((phrase) => !agents.includes(phrase));
if (missingAgentPhrases.length) {
  failures.push(`AGENTS.md governance sections missing: ${missingAgentPhrases.join(", ")}`);
}

if (!existsSync("docs/quality/REGRESSION-MATRIX.md")) {
  failures.push("docs/quality/REGRESSION-MATRIX.md is missing");
}

const contextMap = existsSync("CONTEXT-MAP.md") ? readFileSync("CONTEXT-MAP.md", "utf8") : "";
const referencedContexts = [...contextMap.matchAll(/`(docs\/contexts\/[^`/]+\/CONTEXT\.md)`/gu)].map(
  (match) => match[1],
);
for (const path of referencedContexts) {
  if (!existsSync(path)) failures.push(`CONTEXT-MAP.md references missing context: ${path}`);
}

for (const file of contextFiles("docs/contexts")) {
  const contents = readFileSync(file, "utf8");
  for (const claim of primaryEntryPoints(contents)) {
    if (!claimedPathExists(claim)) {
      failures.push(`${relative(".", file)} claims missing Primary Entry Point: ${claim}`);
    }
  }
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log("AI repository memory contract OK");
