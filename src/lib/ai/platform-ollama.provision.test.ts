import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  PLATFORM_OLLAMA_PROVIDER_NAME,
  PLATFORM_UTILITY_FEATURES,
  isPlatformManagedProvider,
} from "./platform-ollama";
import {
  ensurePlatformOllamaForUserWorkspaces,
  ensurePlatformOllamaForWorkspace,
} from "./platform-ollama.functions";

const USER = "11111111-1111-1111-1111-111111111111";
const WS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

afterEach(() => {
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.OLLAMA_UTILITY_MODEL;
  vi.unstubAllEnvs();
});

type Row = Record<string, unknown>;

function memoryAdmin(init: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {
    workspace_members: [],
    ai_providers: [],
    ai_feature_config: [],
    ...init,
  };

  function rowsOf(table: string): Row[] {
    if (!tables[table]) tables[table] = [];
    return tables[table];
  }

  function match(row: Row, filters: Array<{ col: string; val: unknown; op: string }>): boolean {
    return filters.every((f) => {
      if (f.op === "eq") return row[f.col] === f.val;
      if (f.op === "neq") return row[f.col] !== f.val;
      return true;
    });
  }

  return {
    tables,
    from(table: string) {
      const filters: Array<{ col: string; val: unknown; op: string }> = [];
      let payload: Row | Row[] | null = null;
      let mode: "select" | "insert" | "update" = "select";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filters.push({ col, val, op: "eq" });
          return builder;
        },
        neq: (col: string, val: unknown) => {
          filters.push({ col, val, op: "neq" });
          return builder;
        },
        insert: (row: Row) => {
          mode = "insert";
          payload = row;
          return builder;
        },
        update: (row: Row) => {
          mode = "update";
          payload = row;
          return builder;
        },
        single: async () => {
          const result = await builder.then((v: { data: unknown; error: unknown }) => v);
          const data = Array.isArray(result.data) ? result.data[0] ?? null : result.data;
          return { data, error: result.error };
        },
        maybeSingle: async () => {
          const result = await builder.then((v: { data: unknown; error: unknown }) => v);
          const data = Array.isArray(result.data) ? result.data[0] ?? null : result.data;
          return { data, error: result.error };
        },
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
          try {
            const list = rowsOf(table);
            if (mode === "insert") {
              const row = { id: crypto.randomUUID(), ...(payload as Row) };
              list.push(row);
              return Promise.resolve({ data: row, error: null }).then(resolve, reject);
            }
            const matched = list.filter((row) => match(row, filters));
            if (mode === "update") {
              for (const row of matched) Object.assign(row, payload);
              return Promise.resolve({ data: matched, error: null }).then(resolve, reject);
            }
            return Promise.resolve({ data: matched, error: null }).then(resolve, reject);
          } catch (err) {
            return Promise.reject(err).then(resolve, reject);
          }
        },
      };
      return builder;
    },
  };
}

describe("first-login Platform Local AI provision", () => {
  it("is invoked from ensureMyOrganization without blocking signup", () => {
    const src = readFileSync("src/lib/tenant/provision.functions.ts", "utf8");
    expect(src).toMatch(/ensurePlatformOllamaForUserWorkspaces/);
    expect(src).toMatch(/ai\.platform_ollama\.provision_failed/);
    expect(src).toMatch(/return \{ organizationId \}/);
  });

  it("provisions platform Ollama and utility features when OLLAMA_BASE_URL is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OLLAMA_BASE_URL", "http://ollama.internal:11434/v1");
    vi.stubEnv("OLLAMA_UTILITY_MODEL", "llama3.2");
    const admin = memoryAdmin({
      workspace_members: [{ workspace_id: WS, user_id: USER }],
    });

    const result = await ensurePlatformOllamaForUserWorkspaces(admin as never, USER);
    expect(result.attempted).toBe(1);
    expect(result.provisioned).toBe(1);
    expect(admin.tables.ai_providers).toHaveLength(1);
    expect(admin.tables.ai_providers[0]?.kind).toBe("ollama");
    expect(admin.tables.ai_providers[0]?.name).toBe(PLATFORM_OLLAMA_PROVIDER_NAME);
    expect(admin.tables.ai_providers[0]?.is_default).toBe(false);
    expect(isPlatformManagedProvider(admin.tables.ai_providers[0]?.config as Record<string, unknown>)).toBe(true);
    expect(admin.tables.ai_feature_config.map((r) => r.feature).sort()).toEqual(
      [...PLATFORM_UTILITY_FEATURES].sort(),
    );
    expect(admin.tables.ai_providers.some((r) => r.kind === "lovable" || r.kind === "grok")).toBe(false);
  });

  it("skips Ollama rows in production when OLLAMA_BASE_URL is missing and still succeeds", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.OLLAMA_BASE_URL;
    const admin = memoryAdmin({
      workspace_members: [{ workspace_id: WS, user_id: USER }],
    });
    const result = await ensurePlatformOllamaForUserWorkspaces(admin as never, USER);
    expect(result.attempted).toBe(1);
    expect(result.provisioned).toBe(0);
    expect(result.skipped).toBe("ollama_url_not_configured");
    expect(admin.tables.ai_providers).toHaveLength(0);
    expect(admin.tables.ai_feature_config).toHaveLength(0);
  });

  it("does not throw when a workspace provision call fails", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OLLAMA_BASE_URL", "http://ollama.internal:11434/v1");
    const admin = memoryAdmin({
      workspace_members: [{ workspace_id: WS, user_id: USER }],
    });
    admin.from = () => {
      throw new Error("db down");
    };
    await expect(ensurePlatformOllamaForUserWorkspaces(admin as never, USER)).resolves.toMatchObject({
      attempted: 0,
      provisioned: 0,
    });
  });
});

describe("idempotent workspace Ollama provision", () => {
  it("updates the existing platform row instead of inserting a duplicate", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OLLAMA_BASE_URL", "http://ollama.internal:11434/v1");
    vi.stubEnv("OLLAMA_UTILITY_MODEL", "llama3.2");
    const admin = memoryAdmin({
      workspace_members: [{ workspace_id: WS, user_id: USER }],
    });
    const first = await ensurePlatformOllamaForWorkspace(admin as never, WS);
    const second = await ensurePlatformOllamaForWorkspace(admin as never, WS);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.providerId).toBe(first.providerId);
    expect(admin.tables.ai_providers).toHaveLength(1);
    expect(admin.tables.ai_feature_config).toHaveLength(PLATFORM_UTILITY_FEATURES.length);
  });
});
