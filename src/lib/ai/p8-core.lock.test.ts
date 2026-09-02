import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { AICreditsError, AIError } from "./errors";
import { ENVIRONMENT_VARIABLES } from "@/lib/environment/environment-catalog";
import { isActiveAiProviderKind } from "./registry.server";
import { tryResolveOllamaBaseUrlForProvision } from "./platform-ollama";
import { isAiCredentialMasterKeyConfigured } from "./credential-crypto.server";
import { encryptAiCredential } from "./credential-crypto.server";
import { INTELLIGENCE_LEASE_MS } from "./background-intelligence";
import { stripCredentialShapes } from "./log-privacy";
import { RETIRED_AI_PROVIDER_KINDS } from "./registry.server";

type Row = Record<string, unknown>;

const ORG = "00000000-0000-4000-8000-000000000001";
const WS_A = "00000000-0000-4000-8000-0000000000aa";
const WS_B = "00000000-0000-4000-8000-0000000000bb";
const USER_A = "00000000-0000-4000-8000-0000000000a1";
const USER_B = "00000000-0000-4000-8000-0000000000b1";
const PLAN = "00000000-0000-4000-8000-0000000000pl";
const SUB = "00000000-0000-4000-8000-0000000000su";
const CONV = "00000000-0000-4000-8000-0000000000c1";
const OLLAMA = "00000000-0000-4000-8000-0000000000o1";
const PREMIUM = "00000000-0000-4000-8000-0000000000p1";
const BYOK = "00000000-0000-4000-8000-0000000000k1";
const PREMIUM_B = "00000000-0000-4000-8000-0000000000p2";
const PERIOD_START = "2026-09-01T00:00:00.000Z";
const PERIOD_END = "2026-10-01T00:00:00.000Z";
const T1 = "2026-09-02T12:00:00.000Z";
const MASTER = Buffer.alloc(32, 5).toString("base64");
const PLATFORM_KEY = "sk-platformp8EEEE";
const BYOK_KEY = "sk-testp8byokAAAA";
const VALID_ANALYSIS = JSON.stringify({
  summary: "Customer asked about an invoice.",
  key_points: ["invoice"],
  intent: "support",
  sentiment: "neutral",
  sentiment_score: 0,
  emotion: "curious",
  urgency: "low",
  priority: "low",
  satisfaction_score: 0.7,
  satisfaction_prediction: "likely satisfied",
  risk_score: 0.1,
  risk_reasons: [],
  is_spam: false,
  spam_score: 0,
  category: "billing",
  topics: ["invoice"],
  language: "en",
});

const p8 = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {};
  const state = {
    nowMs: Date.parse("2026-09-02T12:00:00.000Z"),
    fetchDown: false,
    fetchCalls: [] as Array<{ url: string; authorization?: string }>,
    tables,
    reset() {
      state.nowMs = Date.parse("2026-09-02T12:00:00.000Z");
      state.fetchDown = false;
      state.fetchCalls = [];
      for (const key of Object.keys(tables)) delete tables[key];
    },
    rows(table: string): Row[] {
      if (!tables[table]) tables[table] = [];
      return tables[table];
    },
    nowIso() {
      return new Date(state.nowMs).toISOString();
    },
  };

  function matchRow(
    row: Row,
    filters: Array<{ op: string; col: string; val: unknown }>,
    orExpr?: string,
  ): boolean {
    const ok = filters.every((f) => {
      if (f.op === "eq") return row[f.col] === f.val;
      if (f.op === "neq") return row[f.col] !== f.val;
      if (f.op === "is") return row[f.col] == null && f.val == null;
      if (f.op === "in") return Array.isArray(f.val) && f.val.includes(row[f.col]);
      if (f.op === "lt") return String(row[f.col] ?? "") < String(f.val);
      if (f.op === "contains") {
        const obj = row[f.col];
        if (!obj || typeof obj !== "object") return false;
        return Object.entries(f.val as Record<string, unknown>).every(
          ([k, v]) => (obj as Record<string, unknown>)[k] === v,
        );
      }
      return true;
    });
    if (!ok) return false;
    if (!orExpr) return true;
    return orExpr.split(",").some((part) => {
      if (part.includes(".is.null")) {
        const col = part.split(".is.null")[0];
        return row[col] == null;
      }
      const lt = part.match(/^([^.]+)\.lt\."(.+)"$/);
      if (lt) return String(row[lt[1]] ?? "") < lt[2];
      return false;
    });
  }

  function from(table: string) {
    const filters: Array<{ op: string; col: string; val: unknown }> = [];
    const orders: Array<{ col: string; asc: boolean }> = [];
    let orExpr: string | undefined;
    let limit: number | undefined;
    let mode: "select" | "insert" | "update" | "upsert" | "delete" = "select";
    let payload: Row | null = null;
    let onConflict: string | undefined;
    const execute = () => {
      const list = state.rows(table);
      if (mode === "insert" && payload) {
        const row = { id: payload.id ?? crypto.randomUUID(), ...payload };
        list.push(row);
        return { data: [row], error: null };
      }
      if (mode === "upsert" && payload) {
        const keys = (onConflict ?? "id").split(",").map((k) => k.trim());
        const existing = list.find((row) => keys.every((k) => row[k] === payload![k]));
        if (existing) {
          Object.assign(existing, payload);
          return { data: [existing], error: null };
        }
        const row = { id: payload.id ?? crypto.randomUUID(), ...payload };
        list.push(row);
        return { data: [row], error: null };
      }
      let matched = list.filter((row) => matchRow(row, filters, orExpr));
      if (orders.length) {
        matched = [...matched].sort((a, b) => {
          for (const o of orders) {
            const av = a[o.col] as number | string | boolean | null;
            const bv = b[o.col] as number | string | boolean | null;
            if (av === bv) continue;
            if (av == null) return o.asc ? -1 : 1;
            if (bv == null) return o.asc ? 1 : -1;
            const cmp = av > bv ? 1 : -1;
            return o.asc ? cmp : -cmp;
          }
          return 0;
        });
      }
      if (limit != null) matched = matched.slice(0, limit);
      if (mode === "update" && payload) {
        for (const row of matched) Object.assign(row, payload);
        return { data: matched, error: null };
      }
      if (mode === "delete") {
        const keep = list.filter((row) => !matchRow(row, filters, orExpr));
        tables[table] = keep;
        return { data: matched, error: null };
      }
      return { data: matched, error: null };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select: () => builder,
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
      upsert: (row: Row, opts?: { onConflict?: string }) => {
        mode = "upsert";
        payload = row;
        onConflict = opts?.onConflict;
        return builder;
      },
      delete: () => {
        mode = "delete";
        return builder;
      },
      eq: (col: string, val: unknown) => {
        filters.push({ op: "eq", col, val });
        return builder;
      },
      neq: (col: string, val: unknown) => {
        filters.push({ op: "neq", col, val });
        return builder;
      },
      is: (col: string, val: unknown) => {
        filters.push({ op: "is", col, val });
        return builder;
      },
      in: (col: string, val: unknown[]) => {
        filters.push({ op: "in", col, val });
        return builder;
      },
      contains: (col: string, val: unknown) => {
        filters.push({ op: "contains", col, val });
        return builder;
      },
      or: (expr: string) => {
        orExpr = expr;
        return builder;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        orders.push({ col, asc: opts?.ascending !== false });
        return builder;
      },
      limit: (n: number) => {
        limit = n;
        return builder;
      },
      maybeSingle: async () => {
        const result = execute();
        return { data: result.data[0] ?? null, error: result.error };
      },
      single: async () => {
        const result = execute();
        const row = result.data[0] ?? null;
        return { data: row, error: row ? result.error : { message: "not found" } };
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(execute()).then(resolve, reject),
    };
    return builder;
  }

  function quota() {
    return state.rows("tenant_quotas").find((row) => row.meter_code === "ai_premium_credits") ?? null;
  }

  function rpc(name: string, args: Record<string, unknown>) {
    if (name === "enforce_rate_limit") return Promise.resolve({ data: true, error: null });
    if (name === "upsert_ai_usage_daily") return Promise.resolve({ data: null, error: null });
    if (name === "release_expired_ai_credit_reservations") {
      const cutoff = state.nowIso();
      let count = 0;
      for (const row of state.rows("ai_credit_reservations")) {
        if (row.status !== "reserved") continue;
        if (String(row.expires_at) > cutoff) continue;
        if (args.p_organization_id && row.organization_id !== args.p_organization_id) continue;
        const q = quota();
        if (q) q.used = Math.max(0, Number(q.used) - Number(row.reserved_credits));
        row.status = "expired";
        count += 1;
      }
      return Promise.resolve({ data: count, error: null });
    }
    if (name === "reserve_ai_premium_credits") {
      const existing = state.rows("ai_credit_reservations").find((row) => row.request_id === args.p_request_id);
      if (existing) {
        return Promise.resolve({
          data: {
            ok: existing.status === "reserved" || existing.status === "settled",
            status: existing.status,
            reserved_credits: existing.reserved_credits,
            settled_credits: existing.settled_credits,
            organization_id: existing.organization_id,
            idempotent: true,
          },
          error: null,
        });
      }
      const workspace = state.rows("workspaces").find((row) => row.id === args.p_workspace_id);
      if (!workspace?.organization_id) {
        return Promise.resolve({ data: { ok: false, reason: "workspace_organization_unavailable" }, error: null });
      }
      if (args.p_user_id) {
        const member = state.rows("workspace_members").some(
          (row) => row.workspace_id === args.p_workspace_id && row.user_id === args.p_user_id,
        );
        if (!member) {
          return Promise.resolve({ data: { ok: false, reason: "user_workspace_mismatch" }, error: null });
        }
      }
      const provider = state.rows("ai_providers").find(
        (row) => row.id === args.p_provider_id && row.workspace_id === args.p_workspace_id && row.enabled === true,
      );
      if (!provider) {
        return Promise.resolve({ data: { ok: false, reason: "provider_workspace_mismatch" }, error: null });
      }
      const model = state.rows("ai_models").find(
        (row) => row.provider_id === args.p_provider_id && row.model_id === args.p_model && row.enabled === true,
      );
      if (!model) {
        return Promise.resolve({ data: { ok: false, reason: "premium_model_unresolved" }, error: null });
      }
      const sub = state.rows("subscriptions").find(
        (row) => row.organization_id === workspace.organization_id && (row.status === "active" || row.status === "trialing"),
      );
      const plan = state.rows("plans").find((row) => row.id === sub?.plan_id);
      const limits = (plan?.limits ?? {}) as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(limits, "ai_premium_credits")) {
        return Promise.resolve({ data: { ok: false, reason: "premium_credits_unconfigured" }, error: null });
      }
      for (const row of state.rows("ai_credit_reservations")) {
        if (row.status === "reserved" && String(row.expires_at) <= state.nowIso()
          && row.organization_id === workspace.organization_id) {
          const q = quota();
          if (q) q.used = Math.max(0, Number(q.used) - Number(row.reserved_credits));
          row.status = "expired";
        }
      }
      const q = state.rows("tenant_quotas").find(
        (row) =>
          row.organization_id === workspace.organization_id
          && row.meter_code === "ai_premium_credits"
          && row.period_start === sub?.current_period_start,
      );
      if (!q) {
        return Promise.resolve({ data: { ok: false, reason: "premium_credits_unavailable" }, error: null });
      }
      const credits = Number(args.p_credits);
      if (q.hard_limit != null && Number(q.used) + credits > Number(q.hard_limit)) {
        return Promise.resolve({
          data: { ok: false, reason: "premium_credits_exhausted", used: q.used, remaining: Math.max(0, Number(q.hard_limit) - Number(q.used)) },
          error: null,
        });
      }
      if (args.p_user_id) {
        const cap = state.rows("ai_user_credit_limits").find(
          (row) => row.workspace_id === args.p_workspace_id && row.user_id === args.p_user_id,
        );
        if (cap?.monthly_credit_limit != null) {
          const monthActual = state.rows("usage_events")
            .filter((row) =>
              row.meter_code === "ai_premium_credits"
              && (row.metadata as Row)?.user_id === args.p_user_id
              && (row.metadata as Row)?.workspace_id === args.p_workspace_id,
            )
            .reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
          const monthReserved = state.rows("ai_credit_reservations")
            .filter((row) =>
              row.workspace_id === args.p_workspace_id
              && row.user_id === args.p_user_id
              && row.status === "reserved"
              && String(row.expires_at) > state.nowIso(),
            )
            .reduce((sum, row) => sum + Number(row.reserved_credits ?? 0), 0);
          if (monthActual + monthReserved + credits > Number(cap.monthly_credit_limit)) {
            return Promise.resolve({ data: { ok: false, reason: "user_premium_credits_exhausted" }, error: null });
          }
        }
      }
      const reservation = {
        id: crypto.randomUUID(),
        request_id: args.p_request_id,
        organization_id: workspace.organization_id,
        subscription_id: sub?.id,
        workspace_id: args.p_workspace_id,
        user_id: args.p_user_id ?? null,
        feature: args.p_feature ?? null,
        provider_id: args.p_provider_id,
        model: args.p_model,
        reserved_credits: credits,
        settled_credits: null,
        status: "reserved",
        period_start: sub?.current_period_start,
        period_end: sub?.current_period_end,
        expires_at: new Date(state.nowMs + Number(args.p_lease_seconds ?? 900) * 1000).toISOString(),
      };
      state.rows("ai_credit_reservations").push(reservation);
      q.used = Number(q.used) + credits;
      return Promise.resolve({
        data: {
          ok: true,
          status: "reserved",
          reservation_id: reservation.id,
          organization_id: workspace.organization_id,
          reserved_credits: credits,
          remaining: q.hard_limit == null ? null : Math.max(0, Number(q.hard_limit) - Number(q.used)),
          idempotent: false,
        },
        error: null,
      });
    }
    if (name === "settle_ai_premium_credits") {
      const res = state.rows("ai_credit_reservations").find((row) => row.request_id === args.p_request_id);
      if (!res) return Promise.resolve({ data: { ok: false, reason: "reservation_not_found" }, error: null });
      if (res.status === "settled") {
        return Promise.resolve({ data: { ok: true, status: "settled", settled_credits: res.settled_credits, idempotent: true }, error: null });
      }
      const actual = Number(args.p_actual_credits);
      const delta = res.status === "reserved" ? actual - Number(res.reserved_credits) : actual;
      const q = quota();
      if (!q) return Promise.resolve({ data: { ok: false, reason: "premium_credits_unavailable" }, error: null });
      q.used = Math.max(0, Number(q.used) + delta);
      state.rows("usage_events").push({
        id: crypto.randomUUID(),
        organization_id: res.organization_id,
        meter_code: "ai_premium_credits",
        quantity: actual,
        occurred_at: state.nowIso(),
        idempotency_key: `ai-credit:${args.p_request_id}:actual`,
        metadata: {
          ...(args.p_metadata as Row ?? {}),
          workspace_id: res.workspace_id,
          user_id: res.user_id,
          feature: res.feature,
          provider_id: res.provider_id,
          model: res.model,
          execution_mode: "premium_credits",
          credits: actual,
          ai_request_id: args.p_request_id,
        },
      });
      res.status = "settled";
      res.settled_credits = actual;
      return Promise.resolve({ data: { ok: true, status: "settled", settled_credits: actual, idempotent: false }, error: null });
    }
    if (name === "release_ai_premium_credits") {
      const res = state.rows("ai_credit_reservations").find((row) => row.request_id === args.p_request_id);
      if (!res) return Promise.resolve({ data: { ok: true, status: "not_found", idempotent: true }, error: null });
      if (res.status !== "reserved") {
        return Promise.resolve({ data: { ok: true, status: res.status, idempotent: true }, error: null });
      }
      const q = quota();
      if (q) q.used = Math.max(0, Number(q.used) - Number(res.reserved_credits));
      res.status = "released";
      return Promise.resolve({ data: { ok: true, status: "released", released_credits: res.reserved_credits, idempotent: false }, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  }

  return { state, from, rpc };
});

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => p8.from(table),
    rpc: (name: string, args?: Record<string, unknown>) => p8.rpc(name, args ?? {}),
  },
}));

import { runChat } from "./complete.functions";
import { drainConversationIntelligence } from "./background-intelligence.server";

function usedCredits(): number {
  return Number(p8.state.rows("tenant_quotas")[0]?.used ?? 0);
}

function lastLog(): Row | undefined {
  const logs = p8.state.rows("ai_request_logs");
  return logs[logs.length - 1];
}

function seedCore() {
  p8.state.rows("organizations").push({ id: ORG });
  p8.state.rows("workspaces").push(
    { id: WS_A, organization_id: ORG },
    { id: WS_B, organization_id: ORG },
  );
  p8.state.rows("workspace_members").push(
    { workspace_id: WS_A, user_id: USER_A },
    { workspace_id: WS_A, user_id: USER_B },
    { workspace_id: WS_B, user_id: USER_B },
  );
  p8.state.rows("plans").push({ id: PLAN, limits: { ai_premium_credits: 100 } });
  p8.state.rows("subscriptions").push({
    id: SUB,
    organization_id: ORG,
    plan_id: PLAN,
    status: "active",
    current_period_start: PERIOD_START,
    current_period_end: PERIOD_END,
  });
  p8.state.rows("tenant_quotas").push({
    id: crypto.randomUUID(),
    organization_id: ORG,
    meter_code: "ai_premium_credits",
    period_start: PERIOD_START,
    period_end: PERIOD_END,
    used: 0,
    included: 100,
    hard_limit: 100,
  });
  p8.state.rows("ai_providers").push({
    id: OLLAMA,
    workspace_id: WS_A,
    kind: "ollama",
    name: "Platform Local AI",
    base_url: "http://ollama.test/v1",
    api_key_secret_name: null,
    enabled: true,
    is_default: false,
    priority: 50,
    config: { managed_by: "platform", purpose: "utility" },
  });
  p8.state.rows("ai_feature_config").push({
    workspace_id: WS_A,
    feature: "conversation_intelligence",
    provider_id: OLLAMA,
    fallback_provider_ids: [],
    model: "llama3.2",
    enabled: true,
    config: { purpose: "utility", execution_mode: "platform_local" },
  });
  p8.state.rows("conversations").push({
    id: CONV,
    workspace_id: WS_A,
    contact_id: null,
    channel: "whatsapp",
    subject: "Invoice",
  });
  p8.state.rows("messages").push({
    conversation_id: CONV,
    direction: "inbound",
    body: "Where is my invoice?",
    message_type: "text",
    is_internal: false,
    created_at: T1,
  });
  p8.state.rows("conversation_intelligence").push({
    conversation_id: CONV,
    workspace_id: WS_A,
    needs_reanalysis: true,
    analysis_claimed_at: null,
    last_message_at: T1,
  });
}

function seedPremium(opts: { priced?: boolean; enabled?: boolean } = {}) {
  p8.state.rows("ai_providers").push({
    id: PREMIUM,
    workspace_id: WS_A,
    kind: "openai",
    name: "Platform OpenAI",
    base_url: "http://premium.test/v1",
    api_key_secret_name: "OPENAI_API_KEY",
    enabled: opts.enabled ?? true,
    is_default: true,
    priority: 10,
    config: {},
  });
  p8.state.rows("ai_models").push({
    id: crypto.randomUUID(),
    provider_id: PREMIUM,
    model_id: "p8-premium",
    display_name: "P8 fixture",
    capabilities: { chat: true },
    context_window: 8000,
    max_output_tokens: 1024,
    input_cost_per_1k: opts.priced === false ? 0 : 0.001,
    output_cost_per_1k: opts.priced === false ? 0 : 0.003,
    enabled: true,
    is_default: true,
    sort_order: 1,
  });
  p8.state.rows("ai_feature_config").push({
    workspace_id: WS_A,
    feature: "reply_assistant",
    provider_id: PREMIUM,
    fallback_provider_ids: [],
    model: "p8-premium",
    enabled: true,
    config: {},
  });
}

function seedByok() {
  p8.state.rows("ai_providers").push({
    id: BYOK,
    workspace_id: WS_A,
    kind: "openai",
    name: "Workspace OpenAI BYOK",
    base_url: "http://byok.test/v1",
    api_key_secret_name: null,
    enabled: true,
    is_default: false,
    priority: 20,
    config: { credential_source: "workspace_encrypted" },
  });
  p8.state.rows("ai_provider_secrets").push({
    provider_id: BYOK,
    workspace_id: WS_A,
    api_key_ciphertext: encryptAiCredential(BYOK_KEY, { AI_CREDENTIAL_ENCRYPTION_KEY: MASTER }),
    api_key_last4: "AAAA",
  });
}

async function premiumChat(userId: string | null = USER_A) {
  return runChat({
    workspaceId: WS_A,
    userId,
    feature: "reply_assistant",
    request: {
      model: "p8-premium",
      messages: [{ role: "user", content: "Draft a short reply." }],
      max_tokens: 1,
    },
  });
}

describe("P8 AI Core lock", () => {
  beforeEach(() => {
    p8.state.reset();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OLLAMA_BASE_URL", "http://ollama.test/v1");
    vi.stubEnv("OLLAMA_UTILITY_MODEL", "llama3.2");
    vi.stubEnv("OPENAI_API_KEY", PLATFORM_KEY);
    vi.stubEnv("AI_CREDENTIAL_ENCRYPTION_KEY", MASTER);
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const authorization = new Headers(init?.headers).get("Authorization") ?? undefined;
      p8.state.fetchCalls.push({ url, authorization });
      if (p8.state.fetchDown) throw new Error("connect ECONNREFUSED");
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as { model?: string; response_format?: { type?: string } } : {};
      const content = body.response_format?.type === "json_object" ? VALID_ANALYSIS : "premium-ok";
      return new Response(JSON.stringify({
        id: "chatcmpl-p8",
        model: body.model ?? "p8",
        choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("TEST 3 — background Ollama drain runs lease, runChat, structured persist", async () => {
    seedCore();
    const stats = await drainConversationIntelligence({
      workspaceId: WS_A,
      now: () => p8.state.nowMs,
      deadlineMs: 5_000,
    });
    expect(stats.claimed).toBe(1);
    expect(stats.completed).toBe(1);
    expect(p8.state.fetchCalls.some((c) => c.url.startsWith("http://ollama.test/v1"))).toBe(true);
    const intel = p8.state.rows("conversation_intelligence")[0];
    expect(intel?.needs_reanalysis).toBe(false);
    expect(intel?.summary).toContain("invoice");
    expect(intel?.intent).toBe("support");
    expect(lastLog()?.metadata).toMatchObject({ executionMode: "platform_local", creditsCharged: 0 });
    expect(usedCredits()).toBe(0);
  });

  it("TEST 4 — Ollama failure keeps intelligence retryable and does not drop the message", async () => {
    seedCore();
    p8.state.fetchDown = true;
    const stats = await drainConversationIntelligence({
      workspaceId: WS_A,
      now: () => p8.state.nowMs,
      deadlineMs: 5_000,
    });
    expect(stats.retryable).toBe(1);
    expect(p8.state.rows("messages")).toHaveLength(1);
    expect(p8.state.rows("conversation_intelligence")[0]?.needs_reanalysis).toBe(true);
    expect(p8.state.rows("conversation_intelligence")[0]?.analysis_claimed_at).toBeNull();
  });

  it("TEST 5 — expired intelligence lease is reclaimed without another message", async () => {
    seedCore();
    p8.state.rows("conversation_intelligence")[0]!.analysis_claimed_at = T1;
    p8.state.rows("conversation_intelligence")[0]!.needs_reanalysis = true;
    const later = p8.state.nowMs + INTELLIGENCE_LEASE_MS + 1_000;
    const stats = await drainConversationIntelligence({
      workspaceId: WS_A,
      now: () => later,
      deadlineMs: 5_000,
    });
    expect(stats.claimed).toBe(1);
    expect(stats.completed).toBe(1);
    expect(p8.state.rows("messages")).toHaveLength(1);
    expect(p8.state.rows("conversation_intelligence")[0]?.needs_reanalysis).toBe(false);
  });

  it("TEST 6 — platform premium reserves, calls provider, settles, and decrements quota", async () => {
    seedCore();
    seedPremium();
    const before = usedCredits();
    expect(before).toBe(0);
    const result = await premiumChat();
    expect(result.content).toBe("premium-ok");
    expect(result.providerKind).toBe("openai");
    expect(p8.state.fetchCalls.some((c) => c.url.startsWith("http://premium.test/v1"))).toBe(true);
    expect(usedCredits()).toBeGreaterThan(before);
    expect(usedCredits()).toBeLessThan(100);
    expect(lastLog()?.metadata).toMatchObject({
      executionMode: "premium_credits",
      credentialSource: "platform_env",
    });
    expect(Number((lastLog()?.metadata as Row).creditsCharged)).toBeGreaterThan(0);
    expect(p8.state.rows("usage_events")).toHaveLength(1);
    expect(p8.state.rows("ai_credit_reservations")[0]?.status).toBe("settled");
  });

  it("TEST 7 — premium fail-closed does not call the provider or fall back to Ollama", async () => {
    seedCore();
    await expect(premiumChat()).rejects.toBeInstanceOf(AIError);
    expect(p8.state.fetchCalls).toHaveLength(0);

    seedPremium({ priced: false });
    p8.state.fetchCalls = [];
    await expect(premiumChat()).rejects.toBeInstanceOf(AICreditsError);
    expect(p8.state.fetchCalls).toHaveLength(0);
    expect(usedCredits()).toBe(0);

    p8.state.rows("ai_models")[0]!.input_cost_per_1k = 0.001;
    p8.state.rows("ai_models")[0]!.output_cost_per_1k = 0.003;
    p8.state.rows("tenant_quotas").splice(0, 1);
    p8.state.fetchCalls = [];
    await expect(premiumChat()).rejects.toBeInstanceOf(AICreditsError);
    expect(p8.state.fetchCalls).toHaveLength(0);

    p8.state.rows("tenant_quotas").push({
      organization_id: ORG,
      meter_code: "ai_premium_credits",
      period_start: PERIOD_START,
      used: 100,
      hard_limit: 100,
    });
    p8.state.fetchCalls = [];
    await expect(premiumChat()).rejects.toMatchObject({ code: "premium_credits_exhausted" });
    expect(p8.state.fetchCalls).toHaveLength(0);
  });

  it("TEST 8 — BYOK decrypts server-side, charges zero credits, and never returns plaintext", async () => {
    seedCore();
    seedByok();
    const before = usedCredits();
    const result = await runChat({
      workspaceId: WS_A,
      userId: USER_A,
      feature: "reply_assistant",
      primaryProviderId: BYOK,
      request: {
        model: "p8-premium",
        messages: [{ role: "user", content: "Draft a short reply." }],
        max_tokens: 1,
      },
    });
    expect(result.providerId).toBe(BYOK);
    expect(lastLog()?.metadata).toMatchObject({
      executionMode: "workspace_byok",
      creditsCharged: 0,
      credentialSource: "workspace_encrypted",
    });
    expect(usedCredits()).toBe(before);
    const blob = JSON.stringify({ logs: p8.state.rows("ai_request_logs"), events: p8.state.rows("usage_events") });
    expect(blob).not.toContain(BYOK_KEY);
    expect(blob).not.toContain(p8.state.rows("ai_provider_secrets")[0]?.api_key_ciphertext);
  });

  it("TEST 9 — three-way economics: local and BYOK hold the pool, premium decrements it", async () => {
    seedCore();
    seedPremium();
    seedByok();
    await drainConversationIntelligence({ workspaceId: WS_A, now: () => p8.state.nowMs, deadlineMs: 5_000 });
    expect(usedCredits()).toBe(0);
    await premiumChat();
    const afterPremium = usedCredits();
    expect(afterPremium).toBeGreaterThan(0);
    await runChat({
      workspaceId: WS_A,
      userId: USER_A,
      feature: "reply_assistant",
      primaryProviderId: BYOK,
      request: {
        model: "p8-premium",
        messages: [{ role: "user", content: "Draft a short reply." }],
        max_tokens: 1,
      },
    });
    expect(usedCredits()).toBe(afterPremium);
  });

  it("TEST 10 — user cap blocks user A while user B can still spend org credits", async () => {
    seedCore();
    seedPremium();
    p8.state.rows("ai_user_credit_limits").push({
      workspace_id: WS_A,
      user_id: USER_A,
      monthly_credit_limit: 1,
    });
    await premiumChat(USER_A);
    p8.state.fetchCalls = [];
    await expect(premiumChat(USER_A)).rejects.toMatchObject({ code: "user_premium_credits_exhausted" });
    expect(p8.state.fetchCalls).toHaveLength(0);
    const beforeB = usedCredits();
    await premiumChat(USER_B);
    expect(usedCredits()).toBeGreaterThan(beforeB);
  });

  it("TEST 11 — expired reservation is reclaimed on the next reserve without double debit", async () => {
    seedCore();
    seedPremium();
    p8.state.rows("ai_credit_reservations").push({
      id: crypto.randomUUID(),
      request_id: "stale-p8",
      organization_id: ORG,
      subscription_id: SUB,
      workspace_id: WS_A,
      user_id: USER_A,
      provider_id: PREMIUM,
      model: "p8-premium",
      reserved_credits: 40,
      status: "reserved",
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      expires_at: "2026-09-02T11:00:00.000Z",
    });
    p8.state.rows("tenant_quotas")[0]!.used = 40;
    await premiumChat();
    expect(p8.state.rows("ai_credit_reservations").find((row) => row.request_id === "stale-p8")?.status).toBe("expired");
    expect(usedCredits()).toBeLessThan(40);
    expect(usedCredits()).toBeGreaterThan(0);
    const settled = p8.state.rows("ai_credit_reservations").filter((row) => row.status === "settled");
    expect(settled).toHaveLength(1);
  });

  it("TEST 12 — workspace A cannot execute workspace B providers or decrypt B BYOK", async () => {
    seedCore();
    seedPremium();
    p8.state.rows("ai_providers").push({
      id: PREMIUM_B,
      workspace_id: WS_B,
      kind: "openai",
      name: "B premium",
      base_url: "http://b.test/v1",
      api_key_secret_name: "OPENAI_API_KEY",
      enabled: true,
      is_default: true,
      priority: 10,
      config: {},
    });
    p8.state.rows("ai_provider_secrets").push({
      provider_id: PREMIUM_B,
      workspace_id: WS_B,
      api_key_ciphertext: encryptAiCredential(BYOK_KEY, { AI_CREDENTIAL_ENCRYPTION_KEY: MASTER }),
    });
    p8.state.fetchCalls = [];
    await expect(runChat({
      workspaceId: WS_A,
      userId: USER_A,
      feature: "reply_assistant",
      primaryProviderId: PREMIUM_B,
      request: { model: "p8-premium", messages: [{ role: "user", content: "no" }], max_tokens: 1 },
    })).rejects.toBeInstanceOf(AIError);
    expect(p8.state.fetchCalls).toHaveLength(0);
  });

  it("TEST 13 — missing optional AI env does not throw at import/startup seams", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OLLAMA_BASE_URL", "");
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.AI_CREDENTIAL_ENCRYPTION_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect(tryResolveOllamaBaseUrlForProvision({ NODE_ENV: "production", OLLAMA_BASE_URL: "" })).toBeNull();
    expect(isAiCredentialMasterKeyConfigured({})).toBe(false);
    const aiVars = ENVIRONMENT_VARIABLES.filter((item) => item.capability === "ai");
    expect(aiVars.every((item) => item.setupBlocking === "NO")).toBe(true);
    expect(isActiveAiProviderKind("openai")).toBe(true);
  });

  it("TEST 14 — representative secrets stay out of logs, usage events, and list DTOs", async () => {
    seedCore();
    seedPremium();
    seedByok();
    await premiumChat();
    await runChat({
      workspaceId: WS_A,
      userId: USER_A,
      feature: "reply_assistant",
      primaryProviderId: BYOK,
      request: { model: "p8-premium", messages: [{ role: "user", content: "hi" }], max_tokens: 1 },
    });
    const publicBlob = JSON.stringify({
      logs: p8.state.rows("ai_request_logs"),
      events: p8.state.rows("usage_events"),
      list: p8.state.rows("ai_providers").map((row) => ({
        id: row.id,
        kind: row.kind,
        has_credential: true,
        credential_last4: row.id === BYOK ? "AAAA" : null,
      })),
    });
    expect(publicBlob).not.toContain(PLATFORM_KEY);
    expect(publicBlob).not.toContain(BYOK_KEY);
    expect(publicBlob).not.toContain("api_key_ciphertext");
    expect(stripCredentialShapes(`Bearer ${PLATFORM_KEY}`)).toContain("[redacted]");
  });

  it("TEST 15/16 — env catalog and cron contract stay operator-owned", () => {
    const catalog = readFileSync("src/lib/environment/environment-catalog.json", "utf8");
    const example = readFileSync(".env.example", "utf8");
    expect(catalog).not.toMatch(/XAI_API_KEY/);
    expect(example).not.toMatch(/XAI_API_KEY/);
    expect(catalog).toMatch(/LOVABLE_API_KEY/);
    expect(catalog).toMatch(/Not used for PM\.ai\.vn AI inference/);
    expect(RETIRED_AI_PROVIDER_KINDS).toEqual(["lovable", "grok"]);
    const cronSql = readFileSync(
      "supabase/migrations/20260808144139_6e73e655-11de-4d56-a9a8-7e6012bf71d1.sql",
      "utf8",
    );
    const scheduleSql = readFileSync(
      "supabase/migrations/20260731154703_78c96d49-8039-4db9-afc6-fb9fff57acdd.sql",
      "utf8",
    );
    const hook = readFileSync("src/routes/api/public/hooks/analyze-conversations.ts", "utf8");
    expect(cronSql).toMatch(/vault\.decrypted_secrets/);
    expect(cronSql).toMatch(/APP_ORIGIN/);
    expect(cronSql).toMatch(/INTERNAL_CRON_TOKEN/);
    expect(cronSql).toMatch(/x-cron-token/);
    expect(cronSql).not.toMatch(/localhost/);
    expect(cronSql).not.toMatch(/lovable/i);
    expect(scheduleSql).toMatch(/swiffer-analyze-conversations/);
    expect(scheduleSql).toMatch(/\/api\/public\/hooks\/analyze-conversations/);
    expect(hook).toMatch(/guardCronRequest/);
  });
});
