/**
 * Conversation intelligence analysis core (interactive + background worker).
 * Loads fresh domain data at process time — queue payloads must not carry
 * prompts or credentials.
 */
import { z } from "zod";
import { runChat as defaultRunChat } from "./complete.functions";
import type { AIMessage, ChatRequest, ChatResponse } from "./types";
import {
  assertIntelligenceTenant,
  IntelligenceOutputError,
} from "./background-intelligence";

export interface ConversationInsight {
  conversationId: string;
  workspaceId: string;
  summary: string | null;
  keyPoints: string[];
  intent: string | null;
  sentiment: "positive" | "neutral" | "negative" | "mixed" | null;
  sentimentScore: number | null;
  emotion: string | null;
  urgency: "low" | "medium" | "high" | "critical" | null;
  priority: "low" | "medium" | "high" | "urgent" | null;
  satisfactionScore: number | null;
  satisfactionPrediction: string | null;
  riskScore: number | null;
  riskReasons: string[];
  isSpam: boolean;
  spamScore: number | null;
  category: string | null;
  topics: string[];
  language: string | null;
  model: string | null;
  tokensUsed: number;
  messagesAnalyzed: number;
  analyzedAt: string | null;
  needsReanalysis: boolean;
  lastMessageAt: string | null;
}

export interface RawIntelRow {
  conversation_id: string;
  workspace_id: string;
  summary: string | null;
  key_points: unknown;
  intent: string | null;
  sentiment: string | null;
  sentiment_score: number | null;
  emotion: string | null;
  urgency: string | null;
  priority: string | null;
  satisfaction_score: number | null;
  satisfaction_prediction: string | null;
  risk_score: number | null;
  risk_reasons: unknown;
  is_spam: boolean;
  spam_score: number | null;
  category: string | null;
  topics: string[] | null;
  language: string | null;
  model: string | null;
  tokens_used: number | null;
  messages_analyzed: number | null;
  analyzed_at: string | null;
  needs_reanalysis: boolean;
  last_message_at: string | null;
}

/** Minimal thenable query surface used by analysis (RLS client or service role). */
export type IntelligenceDb = {
  from: (table: string) => unknown;
};

type RunChatFn = (opts: {
  workspaceId: string;
  userId?: string | null;
  feature?: string | null;
  request: ChatRequest;
}) => Promise<ChatResponse & { providerId: string; providerKind: string }>;

interface MessageRow {
  direction: "inbound" | "outbound";
  body: string | null;
  message_type: string;
  created_at: string;
}

interface ConversationRow {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  channel: string | null;
  subject: string | null;
}

interface ContactRow {
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  language: string | null;
  lead_status: string | null;
  customer_status: string | null;
  tags: string[] | null;
}

const AnalysisSchema = z.object({
  summary: z.string(),
  key_points: z.array(z.string()).default([]),
  intent: z.string().nullable().optional(),
  sentiment: z.enum(["positive", "neutral", "negative", "mixed"]).nullable().optional(),
  sentiment_score: z.number().min(-1).max(1).nullable().optional(),
  emotion: z.string().nullable().optional(),
  urgency: z.enum(["low", "medium", "high", "critical"]).nullable().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).nullable().optional(),
  satisfaction_score: z.number().min(0).max(1).nullable().optional(),
  satisfaction_prediction: z.string().nullable().optional(),
  risk_score: z.number().min(0).max(1).nullable().optional(),
  risk_reasons: z.array(z.string()).default([]),
  is_spam: z.boolean().default(false),
  spam_score: z.number().min(0).max(1).nullable().optional(),
  category: z.string().nullable().optional(),
  topics: z.array(z.string()).default([]),
  language: z.string().nullable().optional(),
});

export function mapInsight(r: RawIntelRow): ConversationInsight {
  const kp = Array.isArray(r.key_points) ? (r.key_points as string[]) : [];
  const rr = Array.isArray(r.risk_reasons) ? (r.risk_reasons as string[]) : [];
  return {
    conversationId: r.conversation_id,
    workspaceId: r.workspace_id,
    summary: r.summary,
    keyPoints: kp,
    intent: r.intent,
    sentiment: (r.sentiment as ConversationInsight["sentiment"]) ?? null,
    sentimentScore: r.sentiment_score,
    emotion: r.emotion,
    urgency: (r.urgency as ConversationInsight["urgency"]) ?? null,
    priority: (r.priority as ConversationInsight["priority"]) ?? null,
    satisfactionScore: r.satisfaction_score,
    satisfactionPrediction: r.satisfaction_prediction,
    riskScore: r.risk_score,
    riskReasons: rr,
    isSpam: !!r.is_spam,
    spamScore: r.spam_score,
    category: r.category,
    topics: r.topics ?? [],
    language: r.language,
    model: r.model,
    tokensUsed: r.tokens_used ?? 0,
    messagesAnalyzed: r.messages_analyzed ?? 0,
    analyzedAt: r.analyzed_at,
    needsReanalysis: !!r.needs_reanalysis,
    lastMessageAt: r.last_message_at,
  };
}

export function safeJsonParse(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function parseConversationIntelligence(content: string): z.infer<typeof AnalysisSchema> {
  const parsed = safeJsonParse(content || "");
  const validated = AnalysisSchema.safeParse(parsed);
  if (!validated.success) {
    throw new IntelligenceOutputError();
  }
  return validated.data;
}

function asDb(db: IntelligenceDb): {
  from: (table: string) => {
    select: (cols: string) => unknown;
    upsert: (payload: Record<string, unknown>, opts: { onConflict: string }) => unknown;
  };
} {
  return db as {
    from: (table: string) => {
      select: (cols: string) => unknown;
      upsert: (payload: Record<string, unknown>, opts: { onConflict: string }) => unknown;
    };
  };
}

export async function processConversationIntelligence(opts: {
  conversationId: string;
  queuedWorkspaceId?: string | null;
  userId: string | null;
  db: IntelligenceDb;
  runChat?: RunChatFn;
}): Promise<ConversationInsight> {
  const db = asDb(opts.db);
  const chat = opts.runChat ?? defaultRunChat;

  const { data: convRaw, error: convErr } = await (db.from("conversations") as {
    select: (c: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }> } };
  })
    .select("id, workspace_id, contact_id, channel, subject")
    .eq("id", opts.conversationId)
    .maybeSingle();
  if (convErr) throw new Error(convErr.message);
  if (!convRaw) throw new Error("Conversation not found");
  const conv = convRaw as ConversationRow;

  if (opts.queuedWorkspaceId) {
    assertIntelligenceTenant({
      queuedWorkspaceId: opts.queuedWorkspaceId,
      entityWorkspaceId: conv.workspace_id,
    });
  }

  let contact: ContactRow | null = null;
  if (conv.contact_id) {
    const { data: c } = await (db.from("contacts") as {
      select: (c: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> } };
    })
      .select("first_name, last_name, company, language, lead_status, customer_status, tags")
      .eq("id", conv.contact_id)
      .maybeSingle();
    contact = (c ?? null) as ContactRow | null;
  }

  const { data: msgsRaw } = await (db.from("messages") as {
    select: (c: string) => {
      eq: (c: string, v: unknown) => {
        eq: (c: string, v: unknown) => {
          order: (c: string, o: { ascending: boolean }) => {
            limit: (n: number) => Promise<{ data: unknown }>;
          };
        };
      };
    };
  })
    .select("direction, body, message_type, created_at")
    .eq("conversation_id", opts.conversationId)
    .eq("is_internal", false)
    .order("created_at", { ascending: false })
    .limit(50);
  const messages = ((msgsRaw ?? []) as unknown as MessageRow[]).reverse();
  if (messages.length === 0) {
    throw new Error("No messages to analyze");
  }

  const contactName =
    contact && [contact.first_name, contact.last_name].filter(Boolean).length
      ? [contact.first_name, contact.last_name].filter(Boolean).join(" ")
      : "Customer";

  const transcript = messages
    .filter((m) => (m.body ?? "").trim())
    .map(
      (m) =>
        `${m.direction === "inbound" ? contactName : "Agent"} [${m.message_type}]: ${m.body}`,
    )
    .join("\n");

  const crmLines: string[] = [];
  if (contact?.company) crmLines.push(`Company: ${contact.company}`);
  if (contact?.lead_status) crmLines.push(`Lead status: ${contact.lead_status}`);
  if (contact?.customer_status) crmLines.push(`Customer status: ${contact.customer_status}`);
  if (contact?.tags?.length) crmLines.push(`Tags: ${contact.tags.join(", ")}`);

  const systemPrompt = `You are an AI conversation intelligence engine for a customer support & sales CRM.
You analyze a customer conversation and return a STRICT JSON object. No prose, no markdown, no code fences.

Return ONLY this JSON shape:
{
  "summary": "1-3 sentence neutral summary of what this conversation is about and where it stands",
  "key_points": ["short bullet", "..."],
  "intent": "purchase | support | complaint | inquiry | cancel | feedback | spam | other — one label",
  "sentiment": "positive | neutral | negative | mixed",
  "sentiment_score": -1..1 numeric,
  "emotion": "primary emotion e.g. happy, frustrated, anxious, angry, curious, satisfied",
  "urgency": "low | medium | high | critical",
  "priority": "low | medium | high | urgent",
  "satisfaction_score": 0..1 (0 = churn risk, 1 = delighted),
  "satisfaction_prediction": "short human-readable prediction (e.g. 'likely satisfied', 'at risk of churn')",
  "risk_score": 0..1 (churn / escalation / legal / refund risk),
  "risk_reasons": ["short reason", "..."],
  "is_spam": true|false,
  "spam_score": 0..1,
  "category": "billing | sales | support | onboarding | complaint | feature_request | shipping | technical | other",
  "topics": ["short topic tag", "..." up to 6],
  "language": "ISO 639-1 code detected in customer messages"
}
Base every field on evidence in the transcript. If unknown, use null or an empty array. Never invent facts.`;

  const userPrompt = [
    `Channel: ${conv.channel || "chat"}`,
    conv.subject ? `Subject: ${conv.subject}` : "",
    crmLines.length ? `CRM context:\n${crmLines.join("\n")}` : "",
    `Transcript (oldest to newest):`,
    transcript.slice(0, 12000),
  ]
    .filter(Boolean)
    .join("\n");

  const aiMessages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const req: ChatRequest = {
    model: "",
    messages: aiMessages,
    temperature: 0.2,
    max_tokens: 1200,
    response_format: "json_object",
    timeout_ms: 20_000,
  };

  const res = await chat({
    workspaceId: conv.workspace_id,
    userId: opts.userId,
    feature: "conversation_intelligence",
    request: req,
  });

  const a = parseConversationIntelligence(res.content || "");

  const searchText = [
    a.summary,
    a.intent ?? "",
    a.category ?? "",
    (a.topics ?? []).join(" "),
    (a.key_points ?? []).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 4000);

  const payload = {
    conversation_id: conv.id,
    workspace_id: conv.workspace_id,
    summary: a.summary,
    key_points: a.key_points ?? [],
    intent: a.intent ?? null,
    sentiment: a.sentiment ?? null,
    sentiment_score: a.sentiment_score ?? null,
    emotion: a.emotion ?? null,
    urgency: a.urgency ?? null,
    priority: a.priority ?? null,
    satisfaction_score: a.satisfaction_score ?? null,
    satisfaction_prediction: a.satisfaction_prediction ?? null,
    risk_score: a.risk_score ?? null,
    risk_reasons: a.risk_reasons ?? [],
    is_spam: !!a.is_spam,
    spam_score: a.spam_score ?? null,
    category: a.category ?? null,
    topics: a.topics ?? [],
    language: a.language ?? null,
    model: res.model,
    provider_kind: res.providerKind,
    tokens_used: res.usage?.total_tokens ?? 0,
    messages_analyzed: messages.length,
    last_message_at: messages[messages.length - 1]?.created_at ?? null,
    needs_reanalysis: false,
    analyzed_at: new Date().toISOString(),
    search_text: searchText,
  };

  const { data: saved, error: upErr } = await (db.from("conversation_intelligence") as {
    upsert: (
      p: Record<string, unknown>,
      o: { onConflict: string },
    ) => { select: (c: string) => { maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }> } };
  })
    .upsert(payload, { onConflict: "conversation_id" })
    .select("*")
    .maybeSingle();
  if (upErr) throw new Error(upErr.message);

  return mapInsight(saved as unknown as RawIntelRow);
}
