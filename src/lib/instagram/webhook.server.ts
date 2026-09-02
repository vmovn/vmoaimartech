/**
 * Instagram Messaging Webhook — server-only.
 *
 *   GET   → hub.challenge verification (META_WEBHOOK_VERIFY_TOKEN)
 *   POST  → inbound envelope: verify X-Hub-Signature-256 against META_APP_SECRET,
 *           parse messaging entries, dedupe by provider message id, run the
 *           configured Instagram chatbot, and echo the reply back through the
 *           Graph API using the account's stored access token.
 *
 * This module is imported dynamically from the public route handler so no
 * server-only client (`supabaseAdmin`) reaches the browser bundle.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { decryptToken } from "./token-crypto.server";
import { mirrorInstagramMessage } from "./inbox-bridge.server";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// ---------- Types (loose — payloads come straight from Meta) ----------

interface IgAccountRow {
  id: string;
  workspace_id: string;
  ig_user_id: string;
  page_id: string | null;
  username: string | null;
  access_token_ciphertext: string | null;
  status: string;
}

interface ChatbotRow {
  id: string;
  workspace_id: string;
  status: string;
  fallback_message: string | null;
  welcome_message: string | null;
  model: string | null;
  provider_id: string | null;
  temperature: number | null;
  max_tokens: number | null;
  system_prompt: string | null;
  handoff_enabled: boolean;
  handoff_keywords: string[] | null;
  language: string | null;
  personality: string | null;
  tone: string | null;
  widget_config: Record<string, unknown> | null;
}

// ---------- GET verification ----------

export async function verifyInstagramWebhook(url: URL): Promise<Response> {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected =
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
    process.env.IG_WEBHOOK_VERIFY_TOKEN ||
    "";
  if (!expected) {
    return new Response("Verify token not configured", { status: 500 });
  }
  if (mode === "subscribe" && token && challenge && safeEq(token, expected)) {
    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }
  return new Response("forbidden", { status: 403 });
}

// ---------- POST handler ----------

export async function handleInstagramWebhook(
  request: Request,
  rawBody: string,
): Promise<Response> {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return new Response("app secret not configured", { status: 500 });

  const signatureHeader =
    request.headers.get("x-hub-signature-256") ??
    request.headers.get("X-Hub-Signature-256") ??
    "";

  const {
    claimWebhookDelivery,
    completeWebhookDelivery,
    recordRejectedDelivery,
  } = await import("@/lib/webhooks/idempotency.server");

  const deliveryKey = createHash("sha256").update(rawBody, "utf8").digest("hex");

  const signatureValid = verifyMetaSignature(rawBody, secret, signatureHeader);
  if (!signatureValid) {
    // Meta requires 200 in some retry scenarios, but for bad signatures we
    // return 401 so misconfiguration surfaces during setup.
    await recordRejectedDelivery({
      provider: "instagram",
      deliveryKey: `unverified:${deliveryKey}:${Date.now()}`,
      reason: "Invalid or missing X-Hub-Signature-256",
    });
    return new Response("invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const claim = await claimWebhookDelivery({
    provider: "instagram",
    deliveryKey,
    payload,
  });
  if (!claim.fresh) return new Response("EVENT_RECEIVED", { status: 200 });

  // Never let a single bad entry take the whole webhook down: Meta retries on
  // any non-2xx, which would multiply broken payloads.
  try {
    await processEntries(payload);
    await completeWebhookDelivery(claim.id, "processed");
  } catch (err) {
    console.error("[instagram-webhook] processing error:", err);
    await completeWebhookDelivery(claim.id, "failed", (err as Error).message);
  }
  return new Response("EVENT_RECEIVED", { status: 200 });
}


// ---------- Core processing ----------

function verifyMetaSignature(rawBody: string, secret: string, header: string): boolean {
  if (!header.startsWith("sha256=")) return false;
  const provided = header.slice("sha256=".length);
  const computed = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(computed, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function safeEq(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

async function processEntries(payload: unknown) {
  const root = payload as { object?: string; entry?: Array<Record<string, unknown>> };
  if (root?.object !== "instagram" && root?.object !== "page") return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const entries = root.entry ?? [];

  for (const entry of entries) {
    const messaging = (entry.messaging as Array<Record<string, unknown>> | undefined) ?? [];
    for (const evt of messaging) {
      try {
        await processMessagingEvent(supabaseAdmin, evt);
      } catch (err) {
        console.error("[instagram-webhook] event failed:", err);
      }
    }
  }
}

type SupabaseAdminLike = {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

async function processMessagingEvent(supabaseAdmin: SupabaseAdminLike, evt: Record<string, unknown>) {
  const message = evt.message as Record<string, unknown> | undefined;
  const postback = evt.postback as Record<string, unknown> | undefined;
  const sender = evt.sender as { id?: string } | undefined;
  const recipient = evt.recipient as { id?: string } | undefined;

  // Ignore delivery/read receipts and echoes.
  if (!message && !postback) return;
  if (message?.is_echo) return;

  const senderId = sender?.id ?? "";
  const recipientId = recipient?.id ?? "";
  const providerMessageId =
    (message?.mid as string | undefined) ??
    (postback?.mid as string | undefined) ??
    null;
  const text =
    (message?.text as string | undefined) ??
    (postback?.title as string | undefined) ??
    "";
  const attachments = (message?.attachments as unknown[] | undefined) ?? [];

  if (!senderId || !recipientId) return;

  // Resolve the workspace's Instagram account. Meta delivers the business
  // IGSID as `recipient.id` (or as `entry.id` when hitting the page object).
  const { data: acctData } = await supabaseAdmin
    .from("instagram_accounts")
    .select("id, workspace_id, ig_user_id, page_id, username, access_token_ciphertext, status")
    .eq("ig_user_id", recipientId)
    .maybeSingle();
  const account = acctData as IgAccountRow | null;

  // Insert dedupe/observability row first (idempotent on provider_message_id).
  const eventRow = {
    workspace_id: account?.workspace_id ?? null,
    instagram_account_id: account?.id ?? null,
    provider_message_id: providerMessageId,
    sender_id: senderId,
    recipient_id: recipientId,
    event_type: message ? "message" : "postback",
    text,
    attachments,
    raw_payload: evt,
    signature_valid: true,
    status: account ? "received" : "orphaned",
    error: account ? null : "instagram_account not found for recipient",
  };

  const { data: insertedRaw, error: insertErr } = await supabaseAdmin
    .from("instagram_webhook_events")
    .insert(eventRow)
    .select("id")
    .maybeSingle();
  const inserted = insertedRaw as { id: string } | null;

  if (insertErr) {
    // 23505 = unique violation → duplicate delivery from Meta, silently skip.
    if (String(insertErr.message ?? "").toLowerCase().includes("duplicate")) return;
    console.error("[instagram-webhook] log insert failed:", insertErr.message);
    return;
  }
  if (!account) return;
  if (!text.trim() && attachments.length === 0) return;

  // Mirror the inbound DM into the unified inbox so Instagram threads appear
  // in the omnichannel Inbox even when no chatbot is deployed.
  const attachmentType = (attachments[0] as { type?: string } | undefined)?.type ?? null;
  await mirrorInstagramMessage(supabaseAdmin, account, senderId, {
    body: text,
    direction: "inbound",
    providerMessageId,
    mediaType: text ? null : attachmentType,
  });

  // Find an active chatbot deployed to this Instagram account.
  const { data: botRaw } = await supabaseAdmin
    .from("chatbots")
    .select(
      "id, workspace_id, status, fallback_message, welcome_message, model, provider_id, temperature, max_tokens, system_prompt, handoff_enabled, handoff_keywords, language, personality, tone, widget_config",
    )
    .eq("workspace_id", account.workspace_id)
    .eq("status", "active")
    .contains("widget_config", { channel: "instagram", instagram_account_id: account.id })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const bot = botRaw as ChatbotRow | null;
  if (!bot) {
    await supabaseAdmin
      .from("instagram_webhook_events")
      .update({ status: "no_bot", processed_at: new Date().toISOString() })
      .eq("id", inserted?.id ?? "");
    return;
  }

  const reply = await runInstagramTurn({
    supabaseAdmin,
    account,
    bot,
    senderId,
    userText: text || "[non-text message]",
  });

  let replySent = false;
  let sendError: string | null = null;
  if (reply) {
    try {
      await sendInstagramMessage({
        accessTokenCipher: account.access_token_ciphertext,
        recipientId: senderId,
        text: reply,
      });
      replySent = true;
      await mirrorInstagramMessage(supabaseAdmin, account, senderId, {
        body: reply,
        direction: "outbound",
      });
    } catch (err) {
      sendError = (err as Error).message;
      console.error("[instagram-webhook] send failed:", sendError);
    }
  }

  await supabaseAdmin
    .from("instagram_webhook_events")
    .update({
      chatbot_id: bot.id,
      status: replySent ? "replied" : reply ? "send_failed" : "no_reply",
      error: sendError,
      reply_sent: replySent,
      reply_text: reply,
      processed_at: new Date().toISOString(),
    })
    .eq("id", inserted?.id ?? "");
}

// ---------- Turn runner (session + LLM + persistence) ----------

interface RunTurnArgs {
  supabaseAdmin: SupabaseAdminLike;
  account: IgAccountRow;
  bot: ChatbotRow;
  senderId: string;
  userText: string;
}

async function runInstagramTurn({
  supabaseAdmin,
  account,
  bot,
  senderId,
  userText,
}: RunTurnArgs): Promise<string | null> {
  const start = Date.now();

  // Reuse an existing session for this (bot, sender) or open a new one.
  const { data: existingRaw } = await supabaseAdmin
    .from("chatbot_sessions")
    .select("id")
    .eq("chatbot_id", bot.id)
    .eq("channel", "instagram")
    .eq("external_id", senderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let sessionId = (existingRaw as { id?: string } | null)?.id ?? null;

  if (!sessionId) {
    const { data: createdRaw, error } = await supabaseAdmin
      .from("chatbot_sessions")
      .insert({
        workspace_id: bot.workspace_id,
        chatbot_id: bot.id,
        channel: "instagram",
        external_id: senderId,
        status: "active",
        metadata: {
          instagram_account_id: account.id,
          ig_user_id: account.ig_user_id,
          username: account.username,
        },
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    sessionId = (createdRaw as { id: string }).id;
  }

  // Prompt-injection heuristic (kept in sync with chatbotChat).
  const cleaned = userText
    .replace(/<\s*\/?\s*system\s*>/gi, "")
    .replace(/^\s*(ignore|disregard)\s+(all\s+)?previous\s+instructions.*/gim, "[filtered]");

  await supabaseAdmin.from("chatbot_messages").insert({
    workspace_id: bot.workspace_id,
    session_id: sessionId,
    role: "user",
    content: cleaned,
  });

  // Handoff via keyword — mirror chatbotChat semantics.
  const lower = cleaned.toLowerCase();
  const handoff =
    bot.handoff_enabled &&
    (bot.handoff_keywords ?? []).some((k) => k && lower.includes(k.toLowerCase()));
  if (handoff) {
    const reply = "Connecting you with a human agent — one moment.";
    await supabaseAdmin
      .from("chatbot_sessions")
      .update({
        status: "handed_off",
        handoff_reason: "keyword",
        handed_off_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
    await supabaseAdmin.from("chatbot_messages").insert({
      workspace_id: bot.workspace_id,
      session_id: sessionId,
      role: "assistant",
      content: reply,
      latency_ms: Date.now() - start,
    });
    return reply;
  }

  // Load short history.
  const { data: histRaw } = await supabaseAdmin
    .from("chatbot_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(10);
  const history = ((histRaw as { role: string; content: string }[] | null) ?? []).reverse();

  const system = [
    bot.system_prompt || "You are a helpful Instagram DM assistant.",
    `Channel: Instagram DM as @${account.username ?? "our_business"}.`,
    bot.personality ? `Personality:\n${bot.personality}` : "",
    bot.tone ? `Tone: ${bot.tone}.` : "",
    bot.language
      ? `Reply in language code "${bot.language}" unless the user writes another language.`
      : "",
    "Keep replies short and DM-appropriate (under 3 short sentences unless clarifying).",
  ]
    .filter(Boolean)
    .join("\n\n");

  let reply = bot.fallback_message ?? "Thanks for your message! We'll get back to you shortly.";
  let model = bot.model ?? "";
  let providerKind = "";
  try {
    const { runChat } = await import("@/lib/ai/complete.functions");
    const res = await runChat({
      workspaceId: bot.workspace_id,
      feature: "chatbot:instagram",
      primaryProviderId: bot.provider_id,
      request: {
        model: bot.model || "",
        temperature: bot.temperature ?? 0.4,
        max_tokens: bot.max_tokens ?? 500,
        messages: [
          { role: "system", content: system },
          ...history.map((m) => ({
            role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
            content: m.content,
          })),
          { role: "user", content: cleaned },
        ],
      },
    });
    reply = res.content?.trim() || reply;
    model = res.model || model;
    providerKind = res.providerKind;
  } catch (err) {
    console.warn("[instagram-webhook] AI call failed, using fallback:", (err as Error).message);
  }

  await supabaseAdmin.from("chatbot_messages").insert({
    workspace_id: bot.workspace_id,
    session_id: sessionId,
    role: "assistant",
    content: reply,
    latency_ms: Date.now() - start,
    model,
    provider_kind: providerKind,
  });

  await supabaseAdmin
    .from("chatbot_sessions")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", sessionId);

  return reply;
}

// ---------- Graph API send ----------

async function sendInstagramMessage(opts: {
  accessTokenCipher: string | null;
  recipientId: string;
  text: string;
}) {
  if (!opts.accessTokenCipher) throw new Error("account has no access token stored");
  const accessToken = decryptToken(opts.accessTokenCipher);
  const url = `${GRAPH_BASE}/me/messages?access_token=${encodeURIComponent(accessToken)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      recipient: { id: opts.recipientId },
      messaging_type: "RESPONSE",
      message: { text: opts.text.slice(0, 1000) },
    }),
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`graph ${res.status}: ${bodyText.slice(0, 200)}`);
  }
}
