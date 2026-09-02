import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AIError } from "./errors";
import {
  IntelligenceOutputError,
  IntelligenceTenantError,
  assertIntelligenceTenant,
  classifyIntelligenceFailure,
  coalescePendingIntelligence,
  intelligenceDedupeKey,
  pickFairIntelligenceJobs,
  runBounded,
  type PendingIntelligenceJob,
} from "./background-intelligence";
import {
  claimIntelligenceJob,
  drainConversationIntelligence,
  restoreIntelligenceJob,
} from "./background-intelligence.server";
import { parseConversationIntelligence, processConversationIntelligence } from "./intelligence.server";
import { conceptualCreditsToCharge } from "./execution-mode";
import { PLATFORM_LOCAL_TASK_IDS } from "./task-policy";
import {
  CountingSemaphore,
  readOllamaMaxConcurrency,
  readOllamaWorkspaceMaxConcurrency,
  resetOllamaFairnessForTests,
  shouldApplyOllamaFairness,
  withOllamaFairness,
} from "./ollama-fairness";

const WS_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WS_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CONV_A = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const CONV_B = "dddddddd-dddd-dddd-dddd-dddddddddddd";

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

afterEach(() => {
  delete process.env.OLLAMA_MAX_CONCURRENCY;
  delete process.env.OLLAMA_WORKSPACE_MAX_CONCURRENCY;
  resetOllamaFairnessForTests();
});

function job(
  conversationId: string,
  workspaceId: string,
  lastMessageAt: string,
): PendingIntelligenceJob {
  return { conversation_id: conversationId, workspace_id: workspaceId, last_message_at: lastMessageAt };
}

function chainable(result: () => Promise<{ data: unknown; error: { message: string } | null }>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    upsert: () => builder,
    update: () => builder,
    maybeSingle: result,
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      result().then(resolve, reject),
  };
  return builder;
}

function makeProcessDb(opts: {
  workspaceId: string;
  conversationId?: string;
  upserts: Record<string, unknown>[];
}) {
  const conversationId = opts.conversationId ?? CONV_A;
  return {
    from(table: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        upsert: (payload: Record<string, unknown>) => {
          opts.upserts.push(payload);
          builder._upsert = payload;
          return builder;
        },
        maybeSingle: async () => {
          if (table === "conversations") {
            return {
              data: {
                id: conversationId,
                workspace_id: opts.workspaceId,
                contact_id: null,
                channel: "whatsapp",
                subject: null,
              },
              error: null,
            };
          }
          if (table === "contacts") return { data: null, error: null };
          if (table === "conversation_intelligence") {
            return {
              data: {
                ...(builder._upsert ?? {}),
                tokens_used: 2,
                messages_analyzed: 1,
                analyzed_at: "2026-09-02T00:00:00.000Z",
                needs_reanalysis: false,
                last_message_at: "2026-09-02T00:00:00.000Z",
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
          if (table === "messages") {
            return Promise.resolve({
              data: [
                {
                  direction: "inbound",
                  body: "Where is my invoice?",
                  message_type: "text",
                  created_at: "2026-09-02T00:00:00.000Z",
                },
              ],
              error: null,
            }).then(resolve, reject);
          }
          return builder.maybeSingle().then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

function makeQueueDb(pending: Array<PendingIntelligenceJob & { needs_reanalysis?: boolean }>) {
  const rows = pending.map((row) => ({ ...row, needs_reanalysis: row.needs_reanalysis ?? true }));
  return {
    rows,
    from() {
      const filters: Record<string, unknown> = {};
      let values: Record<string, unknown> | null = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: () => builder,
        update: (v: Record<string, unknown>) => {
          values = v;
          return builder;
        },
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          const match = rows.find(
            (row) =>
              (!filters.conversation_id || row.conversation_id === filters.conversation_id) &&
              (!filters.workspace_id || row.workspace_id === filters.workspace_id) &&
              (filters.needs_reanalysis === undefined || row.needs_reanalysis === filters.needs_reanalysis),
          );
          if (values && match) {
            Object.assign(match, values);
            return { data: { conversation_id: match.conversation_id }, error: null };
          }
          return { data: null, error: null };
        },
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
          if (values) {
            for (const row of rows) {
              if (
                (!filters.conversation_id || row.conversation_id === filters.conversation_id) &&
                (!filters.workspace_id || row.workspace_id === filters.workspace_id)
              ) {
                Object.assign(row, values);
              }
            }
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          }
          const match = rows.filter(
            (row) =>
              (filters.needs_reanalysis === undefined || row.needs_reanalysis === filters.needs_reanalysis) &&
              (!filters.workspace_id || row.workspace_id === filters.workspace_id),
          );
          return Promise.resolve({ data: match, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

describe("background intelligence contract", () => {
  it("keeps the P5 PLATFORM_LOCAL allowlist and zero-credit economics", () => {
    expect([...PLATFORM_LOCAL_TASK_IDS].sort()).toEqual([
      "conversation_intelligence",
      "helpdesk.analyze",
      "helpdesk.priority",
      "helpdesk.tags",
      "tag_suggestions",
    ]);
    expect(conceptualCreditsToCharge("platform_local")).toBe(0);
    expect(conceptualCreditsToCharge("workspace_byok")).toBe(0);
    expect(conceptualCreditsToCharge("premium_credits")).toBeNull();
  });

  it("uses workspace + feature + entity as the conceptual dedupe key", () => {
    expect(intelligenceDedupeKey(WS_A, CONV_A)).toBe(
      `${WS_A}:conversation_intelligence:${CONV_A}`,
    );
  });

  it("coalesces rapid events to latest-wins per conversation", () => {
    const rows = [
      job(CONV_A, WS_A, "2026-09-02T00:00:01.000Z"),
      job(CONV_A, WS_A, "2026-09-02T00:00:04.000Z"),
      job(CONV_A, WS_A, "2026-09-02T00:00:02.000Z"),
    ];
    expect(coalescePendingIntelligence(rows)).toEqual([
      job(CONV_A, WS_A, "2026-09-02T00:00:04.000Z"),
    ]);
  });

  it("round-robins workspaces so a noisy tenant cannot take every slot", () => {
    const pending: PendingIntelligenceJob[] = [
      ...Array.from({ length: 8 }, (_, i) =>
        job(`c${i}`, WS_A, `2026-09-02T00:00:0${i}.000Z`),
      ),
      job(CONV_B, WS_B, "2026-09-02T00:00:00.000Z"),
    ];
    const picked = pickFairIntelligenceJobs(pending, { maxJobs: 2, perWorkspace: 1 });
    const workspaces = new Set(picked.map((row) => row.workspace_id));
    expect(picked).toHaveLength(2);
    expect(workspaces.has(WS_A)).toBe(true);
    expect(workspaces.has(WS_B)).toBe(true);
  });
});

describe("tenant + structured output", () => {
  it("rejects queued workspace A against entity workspace B before AI transport", async () => {
    const upserts: Record<string, unknown>[] = [];
    let ran = false;
    await expect(
      processConversationIntelligence({
        conversationId: CONV_A,
        queuedWorkspaceId: WS_A,
        userId: null,
        db: makeProcessDb({ workspaceId: WS_B, upserts }),
        runChat: async () => {
          ran = true;
          throw new Error("must not transport");
        },
      }),
    ).rejects.toBeInstanceOf(IntelligenceTenantError);
    expect(ran).toBe(false);
    expect(upserts).toHaveLength(0);
  });

  it("does not persist intelligence when the model returns invalid JSON", async () => {
    const upserts: Record<string, unknown>[] = [];
    await expect(
      processConversationIntelligence({
        conversationId: CONV_A,
        queuedWorkspaceId: WS_A,
        userId: null,
        db: makeProcessDb({ workspaceId: WS_A, upserts }),
        runChat: async () =>
          ({
            content: "not-json",
            model: "llama",
            providerKind: "ollama",
            providerId: "p1",
            finish_reason: "stop",
          }) as never,
      }),
    ).rejects.toBeInstanceOf(IntelligenceOutputError);
    expect(upserts).toHaveLength(0);
  });

  it("persists one combined structured analysis after a valid model response", async () => {
    const upserts: Record<string, unknown>[] = [];
    const insight = await processConversationIntelligence({
      conversationId: CONV_A,
      queuedWorkspaceId: WS_A,
      userId: null,
      db: makeProcessDb({ workspaceId: WS_A, upserts }),
      runChat: async (opts) => {
        expect(opts.feature).toBe("conversation_intelligence");
        expect(opts.workspaceId).toBe(WS_A);
        expect(opts.request.response_format).toBe("json_object");
        expect(opts.request.temperature).toBe(0.2);
        return {
          content: VALID_ANALYSIS,
          model: "llama",
          providerKind: "ollama",
          providerId: "p1",
          finish_reason: "stop",
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        };
      },
    });
    expect(insight.summary).toContain("invoice");
    expect(insight.intent).toBe("support");
    expect(insight.sentiment).toBe("neutral");
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.needs_reanalysis).toBe(false);
  });

  it("parses combined summary/intent/sentiment/tags in one object", () => {
    const parsed = parseConversationIntelligence(VALID_ANALYSIS);
    expect(parsed.summary).toBeTruthy();
    expect(parsed.intent).toBe("support");
    expect(parsed.sentiment).toBe("neutral");
    expect(parsed.topics).toContain("invoice");
  });

  it("treats tenant, invalid JSON, disabled feature, and missing model as terminal", () => {
    expect(classifyIntelligenceFailure(new IntelligenceTenantError())).toBe("terminal");
    expect(classifyIntelligenceFailure(new IntelligenceOutputError())).toBe("terminal");
    expect(classifyIntelligenceFailure(new AIError("validation", "disabled"))).toBe("terminal");
    expect(classifyIntelligenceFailure(new AIError("not_found", "model missing"))).toBe("terminal");
    expect(classifyIntelligenceFailure(new AIError("auth", "tenant"))).toBe("terminal");
  });

  it("retries only transient transport classes", () => {
    expect(classifyIntelligenceFailure(new AIError("network", "down"))).toBe("retryable");
    expect(classifyIntelligenceFailure(new AIError("timeout", "slow"))).toBe("retryable");
    expect(classifyIntelligenceFailure(new AIError("rate_limit", "429"))).toBe("retryable");
    expect(classifyIntelligenceFailure(new AIError("server", "ollama 502"))).toBe("retryable");
  });
});

describe("claim / retry isolation", () => {
  it("claims with CAS and restores only retryable failures", async () => {
    const db = makeQueueDb([job(CONV_A, WS_A, "2026-09-02T00:00:00.000Z")]);
    await expect(claimIntelligenceJob(db, job(CONV_A, WS_A, "2026-09-02T00:00:00.000Z"))).resolves.toBe(
      true,
    );
    await expect(claimIntelligenceJob(db, job(CONV_A, WS_A, "2026-09-02T00:00:00.000Z"))).resolves.toBe(
      false,
    );
    await restoreIntelligenceJob(db, job(CONV_A, WS_A, "2026-09-02T00:00:00.000Z"));
    expect(db.rows[0]?.needs_reanalysis).toBe(true);
  });

  it("drains persist → enqueue → worker → later intelligence", async () => {
    process.env.OLLAMA_MAX_CONCURRENCY = "2";
    process.env.OLLAMA_WORKSPACE_MAX_CONCURRENCY = "1";
    resetOllamaFairnessForTests();
    const db = makeQueueDb([job(CONV_A, WS_A, "2026-09-02T00:00:00.000Z")]);
    const stats = await drainConversationIntelligence({
      db,
      deadlineMs: 5_000,
      process: async () =>
        ({
          conversationId: CONV_A,
          workspaceId: WS_A,
          summary: "ok",
        }) as never,
    });
    expect(stats.pending).toBe(1);
    expect(stats.claimed).toBe(1);
    expect(stats.completed).toBe(1);
    expect(db.rows[0]?.needs_reanalysis).toBe(false);
  });

  it("restores the flag on transient failure and leaves it clear on terminal failure", async () => {
    const retryDb = makeQueueDb([job(CONV_A, WS_A, "2026-09-02T00:00:00.000Z")]);
    const retry = await drainConversationIntelligence({
      db: retryDb,
      process: async () => {
        throw new AIError("network", "Ollama unavailable");
      },
    });
    expect(retry.retryable).toBe(1);
    expect(retryDb.rows[0]?.needs_reanalysis).toBe(true);

    const termDb = makeQueueDb([job(CONV_B, WS_B, "2026-09-02T00:00:00.000Z")]);
    const term = await drainConversationIntelligence({
      db: termDb,
      process: async () => {
        throw new IntelligenceTenantError();
      },
    });
    expect(term.terminal).toBe(1);
    expect(term.retryable).toBe(0);
    expect(termDb.rows[0]?.needs_reanalysis).toBe(false);
  });
});

describe("shared Ollama fairness", () => {
  it("reads conservative defaults and clamps operator overrides", () => {
    expect(readOllamaMaxConcurrency({})).toBe(2);
    expect(readOllamaWorkspaceMaxConcurrency({})).toBe(1);
    expect(readOllamaMaxConcurrency({ OLLAMA_MAX_CONCURRENCY: "99" })).toBe(8);
    expect(
      readOllamaWorkspaceMaxConcurrency({
        OLLAMA_MAX_CONCURRENCY: "2",
        OLLAMA_WORKSPACE_MAX_CONCURRENCY: "4",
      }),
    ).toBe(2);
    expect(shouldApplyOllamaFairness("platform_local")).toBe(true);
    expect(shouldApplyOllamaFairness("premium_credits")).toBe(false);
    expect(shouldApplyOllamaFairness("workspace_byok")).toBe(false);
  });

  it("never exceeds the configured global in-flight bound", async () => {
    process.env.OLLAMA_MAX_CONCURRENCY = "2";
    resetOllamaFairnessForTests();
    const sem = new CountingSemaphore(2);
    let current = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        await withOllamaFairness(WS_A, async () => {
          current += 1;
          peak = Math.max(peak, current);
          await new Promise((r) => setTimeout(r, 20));
          current -= 1;
        });
      }),
    );
    expect(peak).toBeLessThanOrEqual(2);
    const release = await sem.acquire();
    release();
  });

  it("keeps a noisy workspace from occupying every in-flight slot", async () => {
    process.env.OLLAMA_MAX_CONCURRENCY = "2";
    process.env.OLLAMA_WORKSPACE_MAX_CONCURRENCY = "1";
    resetOllamaFairnessForTests();
    let aCurrent = 0;
    let aPeak = 0;
    let bRan = false;
    await Promise.all([
      ...Array.from({ length: 4 }, () =>
        withOllamaFairness(WS_A, async () => {
          aCurrent += 1;
          aPeak = Math.max(aPeak, aCurrent);
          await new Promise((r) => setTimeout(r, 30));
          aCurrent -= 1;
        }),
      ),
      withOllamaFairness(WS_B, async () => {
        bRan = true;
      }),
    ]);
    expect(aPeak).toBe(1);
    expect(bRan).toBe(true);
  });

  it("bounds runBounded in-flight work", async () => {
    let current = 0;
    let peak = 0;
    await runBounded([1, 2, 3, 4, 5], 2, async () => {
      current += 1;
      peak = Math.max(peak, current);
      await new Promise((r) => setTimeout(r, 15));
      current -= 1;
    });
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe("inbox persistence isolation", () => {
  it("does not await runChat on message ingest paths", () => {
    const inbox = readFileSync("src/lib/messaging/wa-inbox.server.ts", "utf8");
    const trigger = readFileSync(
      "supabase/migrations/20260717132812_7dc5c9e3-d17d-4709-9bdc-eb24e3d54c55.sql",
      "utf8",
    );
    expect(inbox).not.toMatch(/runChat/);
    expect(trigger).toMatch(/needs_reanalysis = true/);
    expect(trigger).toMatch(/tg_mark_intel_stale/);
  });
});

describe("assertIntelligenceTenant", () => {
  it("requires entity.workspace_id to equal the queued workspace", () => {
    expect(() =>
      assertIntelligenceTenant({ queuedWorkspaceId: WS_A, entityWorkspaceId: WS_B }),
    ).toThrow(IntelligenceTenantError);
    expect(() =>
      assertIntelligenceTenant({ queuedWorkspaceId: WS_A, entityWorkspaceId: WS_A }),
    ).not.toThrow();
  });
});
