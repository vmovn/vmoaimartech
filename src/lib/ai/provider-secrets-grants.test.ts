import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION = "supabase/migrations/20260717132020_0b2f4486-c6fb-4b60-a215-6b49d22989e2.sql";

describe("ai_provider_secrets grants", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("creates a server-only secret table in the canonical AI migration", () => {
    expect(sql).toMatch(/create table public\.ai_provider_secrets/i);
    expect(sql).toMatch(/api_key_ciphertext text not null/i);
    expect(sql).toMatch(/REVOKE ALL ON public\.ai_provider_secrets FROM public, anon, authenticated/i);
    expect(sql).toMatch(/grant all on public\.ai_provider_secrets to service_role/i);
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete|all)\s+on\s+public\.ai_provider_secrets\s+to\s+(authenticated|anon)/i);
  });

  it("enforces secret.workspace_id = provider.workspace_id", () => {
    expect(sql).toMatch(/enforce_ai_provider_secret_workspace/);
    expect(sql).toMatch(/ai_provider_secrets\.workspace_id must match ai_providers\.workspace_id/);
  });

  it("workspace list/config functions never select ciphertext", () => {
    const cfg = readFileSync("src/lib/ai/config.functions.ts", "utf8");
    expect(cfg).not.toMatch(/api_key_ciphertext/);
    expect(cfg).toMatch(/requireAiWorkspace\(context, \{ admin: true \}\)/);
  });
});
