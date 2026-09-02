/**
 * Customer conversation insights — summary + next best action.
 *
 * Fetches the customer's recent WhatsApp threads and their latest messages,
 * then asks the configured workspace AI provider to produce a compact JSON with:
 *  - summary       : 2-4 sentence recap
 *  - sentiment     : positive | neutral | negative
 *  - topics        : short tags
 *  - nextAction    : object { title, reason, priority }
 *  - suggestedReply: optional short WhatsApp reply
 *
 * Auth: requireSupabaseAuth so RLS scopes to the caller's workspace.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { runChat } from "./complete.functions";

const InputSchema = z.object({
  customerId: z.string().uuid(),
  maxMessages: z.number().int().min(5).max(200).optional(),
});

export type CustomerInsight = {
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  topics: string[];
  nextAction: { title: string; reason: string; priority: "low" | "medium" | "high" };
  suggestedReply: string | null;
  meta: {
    messageCount: number;
    conversationCount: number;
    lastMessageAt: string | null;
    model: string;
    generatedAt: string;
  };
};

type ConversationRow = {
  id: string;
  workspace_id: string;
  channel: string | null;
  status: string | null;
  last_message_at: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound" | string;
  body: string | null;
  message_type: string | null;
  created_at: string;
};

export const generateCustomerInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => InputSchema.parse(v))
  .handler(async ({ data, context }): Promise<CustomerInsight> => {
    const maxMessages = data.maxMessages ?? 40;
    const supabase = context.supabase;

    // Pull recent WhatsApp conversations for the contact. Fall back to any
    // channel if there are no WhatsApp threads.
    const { data: waConvs } = await supabase
      .from("conversations" as never)
      .select("id, workspace_id, channel, status, last_message_at")
      .eq("contact_id", data.customerId)
      .eq("channel", "whatsapp")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(5);

    let conversations = (waConvs ?? []) as ConversationRow[];
    if (conversations.length === 0) {
      const { data: anyConvs } = await supabase
        .from("conversations" as never)
        .select("id, workspace_id, channel, status, last_message_at")
        .eq("contact_id", data.customerId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(5);
      conversations = (anyConvs ?? []) as ConversationRow[];
    }

    const convIds = conversations.map((c) => c.id);
    let messages: MessageRow[] = [];
    if (convIds.length) {
      const { data: msgs } = await supabase
        .from("messages" as never)
        .select("id, conversation_id, direction, body, message_type, created_at")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .limit(maxMessages);
      messages = ((msgs ?? []) as MessageRow[]).reverse();
    }

    const lastMessageAt =
      conversations.reduce<string | null>((acc, c) => {
        if (!c.last_message_at) return acc;
        if (!acc || c.last_message_at > acc) return c.last_message_at;
        return acc;
      }, null) ?? null;

    if (messages.length === 0) {
      return {
        summary: "No recent WhatsApp activity with this customer yet.",
        sentiment: "neutral",
        topics: [],
        nextAction: {
          title: "Send an intro message",
          reason: "No prior WhatsApp thread — open the channel with a personalized greeting.",
          priority: "medium",
        },
        suggestedReply: null,
        meta: {
          messageCount: 0,
          conversationCount: conversations.length,
          lastMessageAt,
          model: "",
          generatedAt: new Date().toISOString(),
        },
      };
    }

    // Compact transcript for the model.
    const transcript = messages
      .map((m) => {
        const who = m.direction === "outbound" ? "Agent" : "Customer";
        const when = new Date(m.created_at).toISOString();
        const body =
          (m.body ?? "").trim() ||
          (m.message_type && m.message_type !== "text" ? `[${m.message_type}]` : "[empty]");
        return `[${when}] ${who}: ${body.slice(0, 500)}`;
      })
      .join("\n");

    const workspaceId = conversations[0]?.workspace_id;
    if (!workspaceId) throw new Error("No workspace found for customer conversations");
    const systemPrompt = [
      "You are a senior CRM analyst.",
      "Given a WhatsApp transcript between an Agent and a Customer,",
      "produce a compact JSON with fields:",
      '  "summary" (2-4 sentences, factual),',
      '  "sentiment" ("positive" | "neutral" | "negative"),',
      '  "topics" (up to 5 short lower-case tags),',
      '  "nextAction" ({ "title": short imperative, "reason": one sentence, "priority": "low"|"medium"|"high" }),',
      '  "suggestedReply" (an optional short WhatsApp-ready reply from the Agent perspective, or null).',
      "Return ONLY valid JSON. No prose, no markdown.",
    ].join(" ");

    const res = await runChat({
      workspaceId,
      userId: context.userId,
      feature: "customer_insights",
      request: {
        model: "",
        response_format: "json_object",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Customer transcript (chronological, most recent last):\n\n${transcript}`,
          },
        ],
      },
    });
    const raw = res.content || "{}";

    let parsed: Partial<CustomerInsight> = {};
    try {
      parsed = JSON.parse(raw) as Partial<CustomerInsight>;
    } catch {
      parsed = { summary: raw.slice(0, 500) };
    }

    const sentiment = ["positive", "neutral", "negative"].includes(String(parsed.sentiment))
      ? (parsed.sentiment as CustomerInsight["sentiment"])
      : "neutral";
    const priority = ["low", "medium", "high"].includes(String(parsed.nextAction?.priority))
      ? (parsed.nextAction!.priority as "low" | "medium" | "high")
      : "medium";

    return {
      summary: (parsed.summary || "No summary available.").toString().trim(),
      sentiment,
      topics: Array.isArray(parsed.topics)
        ? parsed.topics.filter((t): t is string => typeof t === "string").slice(0, 5)
        : [],
      nextAction: {
        title: (parsed.nextAction?.title || "Follow up with the customer").toString().trim(),
        reason: (parsed.nextAction?.reason || "Keep the conversation moving.").toString().trim(),
        priority,
      },
      suggestedReply:
        typeof parsed.suggestedReply === "string" && parsed.suggestedReply.trim()
          ? parsed.suggestedReply.trim()
          : null,
      meta: {
        messageCount: messages.length,
        conversationCount: conversations.length,
        lastMessageAt,
        model: res.model,
        generatedAt: new Date().toISOString(),
      },
    };
  });
