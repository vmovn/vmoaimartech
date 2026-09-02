/**
 * AI Conversation Intelligence — analyzes conversations and stores rich AI
 * insights (summary, sentiment, urgency, priority, risk, spam, category…)
 * back into the CRM. Also produces daily/weekly workspace-level rollups.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { runChat } from "./complete.functions";
import type { AIMessage, ChatRequest } from "./types";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { mapInsight, safeJsonParse, type ConversationInsight, type RawIntelRow } from "./intelligence.server";

export type { ConversationInsight };

export interface WorkspaceSummaryStats {
  total: number;
  by_sentiment: Record<string, number>;
  by_urgency: Record<string, number>;
  by_category: Record<string, number>;
  spam: number;
  avg_satisfaction: number | null;
  avg_risk: number | null;
}

export interface WorkspaceAiSummary {
  id: string;
  workspaceId: string;
  period: "daily" | "weekly";
  periodStart: string;
  periodEnd: string;
  summary: string;
  highlights: string[];
  stats: WorkspaceSummaryStats;
  model: string | null;
  tokensUsed: number;
  createdAt: string;
}

// ---------- Read ----------

export const getConversationInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({ conversationId: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data, context }): Promise<ConversationInsight | null> => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("conversation_intelligence")
      .select("*")
      .eq("conversation_id", data.conversationId)
      .maybeSingle();
    return row ? mapInsight(row as unknown as RawIntelRow) : null;
  });

export const searchConversationInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        query: z.string().optional(),
        category: z.string().optional(),
        urgency: z.enum(["low", "medium", "high", "critical"]).optional(),
        sentiment: z.enum(["positive", "neutral", "negative", "mixed"]).optional(),
        isSpam: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).optional().default(50),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<ConversationInsight[]> => {
    const { supabase } = context;
    let q = supabase
      .from("conversation_intelligence")
      .select("*")
      .eq("workspace_id", data.workspaceId);
    if (data.query && data.query.trim()) {
      q = q.ilike("search_text", `%${sanitizeSearchTerm(data.query.trim())}%`);
    }
    if (data.category) q = q.eq("category", data.category);
    if (data.urgency) q = q.eq("urgency", data.urgency);
    if (data.sentiment) q = q.eq("sentiment", data.sentiment);
    if (typeof data.isSpam === "boolean") q = q.eq("is_spam", data.isSpam);
    q = q.order("analyzed_at", { ascending: false }).limit(data.limit);
    const { data: rows } = await q;
    return ((rows ?? []) as unknown as RawIntelRow[]).map(mapInsight);
  });

// ---------- Analysis ----------

export const analyzeConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        force: z.boolean().optional().default(false),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<ConversationInsight> => {
    const { processConversationIntelligence } = await import("./intelligence.server");
    return processConversationIntelligence({
      conversationId: data.conversationId,
      userId: context.userId,
      db: context.supabase,
    });
  });

// ---------- Workspace daily / weekly summary ----------

export const generateWorkspaceSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        period: z.enum(["daily", "weekly"]),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<WorkspaceAiSummary> => {
    const { supabase, userId } = context;

    const now = new Date();
    const periodEnd = now;
    const periodStart = new Date(
      now.getTime() - (data.period === "daily" ? 24 : 24 * 7) * 3600_000,
    );

    const { data: intelRows } = await supabase
      .from("conversation_intelligence")
      .select(
        "summary, category, urgency, sentiment, priority, risk_score, is_spam, satisfaction_score, topics, intent, analyzed_at",
      )
      .eq("workspace_id", data.workspaceId)
      .gte("analyzed_at", periodStart.toISOString())
      .lte("analyzed_at", periodEnd.toISOString())
      .order("analyzed_at", { ascending: false })
      .limit(200);

    const rows = (intelRows ?? []) as Array<{
      summary: string | null;
      category: string | null;
      urgency: string | null;
      sentiment: string | null;
      priority: string | null;
      risk_score: number | null;
      is_spam: boolean;
      satisfaction_score: number | null;
      topics: string[] | null;
      intent: string | null;
      analyzed_at: string | null;
    }>;

    const stats = {
      total: rows.length,
      by_sentiment: countBy(rows, (r) => r.sentiment ?? "unknown"),
      by_urgency: countBy(rows, (r) => r.urgency ?? "unknown"),
      by_category: countBy(rows, (r) => r.category ?? "unknown"),
      spam: rows.filter((r) => r.is_spam).length,
      avg_satisfaction: avg(rows.map((r) => r.satisfaction_score ?? null)),
      avg_risk: avg(rows.map((r) => r.risk_score ?? null)),
    };

    const digest = rows
      .slice(0, 80)
      .map(
        (r, i) =>
          `${i + 1}. [${r.category ?? "?"}|${r.urgency ?? "?"}|${r.sentiment ?? "?"}] ${
            r.summary ?? ""
          }`,
      )
      .join("\n")
      .slice(0, 10000);

    const systemPrompt = `You are an executive AI analyst. Given a batch of per-conversation summaries from a customer support & sales workspace, produce a concise ${data.period} rollup for leadership.

Return STRICT JSON:
{
  "summary": "3-6 sentence executive summary — trends, sentiment shifts, top issues, wins",
  "highlights": ["short bullet", "..." up to 8]
}
No prose outside JSON. Focus on patterns, not individual conversations.`;

    const userPrompt = `Period: ${data.period} (${periodStart.toISOString()} → ${periodEnd.toISOString()})
Aggregate stats: ${JSON.stringify(stats)}

Conversation summaries:
${digest}`;

    const req: ChatRequest = {
      model: "",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 800,
      response_format: "json_object",
    };

    const res = await runChat({
      workspaceId: data.workspaceId,
      userId,
      feature: "workspace_summary",
      request: req,
    });

    const parsed = safeJsonParse(res.content || "");
    const RollupSchema = z.object({
      summary: z.string(),
      highlights: z.array(z.string()).default([]),
    });
    const validated = RollupSchema.safeParse(parsed);
    const summary = validated.success ? validated.data.summary : (res.content || "").slice(0, 2000);
    const highlights = validated.success ? validated.data.highlights : [];

    const { data: saved, error: upErr } = await supabase
      .from("workspace_ai_summaries")
      .upsert(
        {
          workspace_id: data.workspaceId,
          period: data.period,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          summary,
          highlights,
          stats,
          model: res.model,
          provider_kind: res.providerKind,
          tokens_used: res.usage?.total_tokens ?? 0,
        },
        { onConflict: "workspace_id,period,period_start" },
      )
      .select("*")
      .maybeSingle();
    if (upErr) throw new Error(upErr.message);

    const row = saved as unknown as {
      id: string;
      workspace_id: string;
      period: "daily" | "weekly";
      period_start: string;
      period_end: string;
      summary: string;
      highlights: unknown;
      stats: unknown;
      model: string | null;
      tokens_used: number | null;
      created_at: string;
    };
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      period: row.period,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      summary: row.summary,
      highlights: Array.isArray(row.highlights) ? (row.highlights as string[]) : [],
      stats: (row.stats as WorkspaceSummaryStats | null) ?? stats,
      model: row.model,
      tokensUsed: row.tokens_used ?? 0,
      createdAt: row.created_at,
    };
  });

function countBy<T>(arr: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of arr) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function avg(nums: Array<number | null>): number | null {
  const valid = nums.filter((n): n is number => typeof n === "number");
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}
