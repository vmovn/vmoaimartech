/**
 * Facebook Messenger Webhook — server-only.
 *
 *   GET   → hub.challenge verification (META_WEBHOOK_VERIFY_TOKEN)
 *   POST  → inbound envelope: verify X-Hub-Signature-256 against META_APP_SECRET,
 *           dedupe by provider message id, and materialise incoming messages
 *           plus delivery / read receipts into the omnichannel inbox tables.
 *
 * Loaded dynamically from the public route handler so the server-only Supabase
 * admin client never reaches the browser bundle.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// ---------- GET verification ----------

import { ensureInboxThread } from "@/lib/inbox/thread-dedup.server";

export async function verifyMessengerWebhook(url: URL): Promise<Response> {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected =
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
    process.env.MESSENGER_WEBHOOK_VERIFY_TOKEN ||
    "";
  if (!expected) return new Response("Verify token not configured", { status: 500 });
  if (mode === "subscribe" && token && challenge && safeEq(token, expected)) {
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("forbidden", { status: 403 });
}

// ---------- POST handler ----------

export async function handleMessengerWebhook(
  request: Request,
  rawBody: string,
): Promise<Response> {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return new Response("app secret not configured", { status: 500 });

  const signature =
    request.headers.get("x-hub-signature-256") ??
    request.headers.get("X-Hub-Signature-256") ??
    "";

  const {
    claimWebhookDelivery,
    completeWebhookDelivery,
    recordRejectedDelivery,
  } = await import("@/lib/webhooks/idempotency.server");

  // Meta sends no delivery id header; retries repeat the exact body, so a
  // body digest is a stable idempotency key.
  const deliveryKey = createHash("sha256").update(rawBody, "utf8").digest("hex");

  if (!verifyMetaSignature(rawBody, secret, signature)) {
    await recordRejectedDelivery({
      provider: "messenger",
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
    provider: "messenger",
    deliveryKey,
    payload,
  });
  if (!claim.fresh) {
    // Duplicate redelivery from Meta — ack without reprocessing.
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  try {
    await processEntries(payload);
    await completeWebhookDelivery(claim.id, "processed");
  } catch (err) {
    // Meta retries on non-2xx; swallow processing errors after they're logged
    // so a poison entry doesn't multiply.
    console.error("[messenger-webhook] processing error:", err);
    await completeWebhookDelivery(claim.id, "failed", (err as Error).message);
  }
  return new Response("EVENT_RECEIVED", { status: 200 });
}


// ---------- signature ----------

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

// ---------- processing ----------

type Admin = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

interface MessengerAccountRow {
  id: string;
  workspace_id: string;
  page_id: string;
  page_name: string | null;
  status: string;
  access_token_ciphertext: string | null;
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

async function processEntries(payload: unknown) {
  const root = payload as { object?: string; entry?: Array<Record<string, unknown>> };
  // Messenger webhooks are delivered under `object: "page"`.
  if (root?.object !== "page") return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const entries = root.entry ?? [];

  for (const entry of entries) {
    const pageId = String(entry.id ?? "");
    const messaging = (entry.messaging as Array<Record<string, unknown>> | undefined) ?? [];
    if (!pageId || messaging.length === 0) continue;

    const { data: acctData } = await supabaseAdmin
      .from("messenger_accounts")
      .select("id, workspace_id, page_id, page_name, status, access_token_ciphertext")
      .eq("page_id", pageId)
      .maybeSingle();
    const account = acctData as MessengerAccountRow | null;

    for (const evt of messaging) {
      try {
        await processMessagingEvent(supabaseAdmin, account, pageId, evt);
      } catch (err) {
        console.error("[messenger-webhook] event failed:", err);
      }
    }
  }
}

async function processMessagingEvent(
  admin: Admin,
  account: MessengerAccountRow | null,
  pageId: string,
  evt: Record<string, unknown>,
) {
  const message = evt.message as Record<string, unknown> | undefined;
  const postback = evt.postback as Record<string, unknown> | undefined;
  const delivery = evt.delivery as { mids?: string[]; watermark?: number } | undefined;
  const read = evt.read as { watermark?: number } | undefined;
  const sender = evt.sender as { id?: string } | undefined;
  const recipient = evt.recipient as { id?: string } | undefined;
  const timestamp = Number(evt.timestamp ?? Date.now());

  const senderId = sender?.id ?? "";
  const recipientId = recipient?.id ?? "";
  const isEcho = Boolean(message?.is_echo);

  // Direction: page -> user is outbound (echoes of agent sends), user -> page inbound.
  const direction: "inbound" | "outbound" =
    senderId === pageId || isEcho ? "outbound" : "inbound";

  // The customer's PSID is whichever end of the conversation is not the page.
  const customerPsid = direction === "inbound" ? senderId : recipientId;

  // Always log the raw event for observability & dedupe on Meta retries.
  const providerMessageId =
    (message?.mid as string | undefined) ??
    (postback?.mid as string | undefined) ??
    (delivery?.mids?.[0] as string | undefined) ??
    null;

  const eventType = message
    ? isEcho
      ? "message_echo"
      : "message"
    : postback
      ? "postback"
      : delivery
        ? "delivery"
        : read
          ? "read"
          : "other";

  // Skip if we have no page account: log-only to avoid orphan writes.
  if (!account) {
    console.warn("[messenger-webhook] unknown page_id:", pageId);
    return;
  }

  // For message/postback events we need a customer + conversation.
  if (message || postback) {
    if (!customerPsid) return;

    // Resolve or create contact via channel_identities.
    const contactId = await resolveContact(admin, account.workspace_id, customerPsid, {
      displayName: null,
    });

    // Thread key: Messenger conversations from webhooks arrive without the
    // t_XXXX thread id. We key the conversation on the customer PSID paired
    // with the page (that pair uniquely identifies the thread on Meta's side).
    const externalConversationId = `psid:${pageId}:${customerPsid}`;

    const nowIso = new Date(timestamp).toISOString();

    const text =
      (message?.text as string | undefined) ??
      ((postback?.title as string | undefined) ?? "");
    const attachments = (message?.attachments as unknown[] | undefined) ?? [];
    const firstAttachment = attachments[0] as
      | { type?: string; payload?: { url?: string } }
      | undefined;
    const mediaUrl = firstAttachment?.payload?.url ?? null;
    const mediaType = firstAttachment?.type ?? null;
    const messageType = mediaUrl ? "media" : "text";
    const preview = text ? text.slice(0, 240) : mediaType ? `[${mediaType}]` : "";

    const { conversationId } = await ensureInboxThread(admin, {
      workspaceId: account.workspace_id,
      channel: "messenger",
      externalConversationId,
      accountId: account.id,
      contactId,
      inbound: direction === "inbound",
      preview,
      metadata: {
        source: "messenger_webhook",
        page_id: pageId,
        psid: customerPsid,
      },
    });

    // Insert message (dedupe on provider_message_id when present).
    if (providerMessageId) {
      const { data: dupe } = await admin
        .from("messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("provider_message_id", providerMessageId)
        .maybeSingle();
      if (dupe) return;
    }

    const { error: msgErr } = await admin.from("messages").insert({
      workspace_id: account.workspace_id,
      conversation_id: conversationId,
      direction,
      status: direction === "outbound" ? "sent" : "delivered",
      body: text,
      media_url: mediaUrl,
      media_type: mediaType,
      message_type: messageType,
      provider_message_id: providerMessageId,
      from_address: senderId || null,
      to_address: recipientId || null,
      created_at: nowIso,
      metadata: {
        source: "messenger_webhook",
        event_type: eventType,
        payload: evt,
      },
    });
    if (msgErr && !String(msgErr.message ?? "").toLowerCase().includes("duplicate")) {
      console.warn("[messenger-webhook] message insert failed:", msgErr.message);
    }

    // Trigger chatbot auto-reply on inbound customer messages only.
    if (direction === "inbound" && (text.trim() || attachments.length > 0)) {
      try {
        await runMessengerChatbot({
          admin,
          account,
          conversationId,
          senderPsid: customerPsid,
          userText: text || "[non-text message]",
        });
      } catch (err) {
        console.error("[messenger-webhook] chatbot failed:", err);
      }
    }
    return;
  }

  // Delivery receipts → mark matching outbound messages as delivered.
  if (delivery) {
    const mids = delivery.mids ?? [];
    if (mids.length === 0) return;
    await admin
      .from("messages")
      .update({ status: "delivered" })
      .eq("workspace_id", account.workspace_id)
      .in("provider_message_id", mids);
    return;
  }

  // Read receipts → mark outbound messages up to watermark as read + zero unread.
  if (read) {
    const watermarkIso = new Date(Number(read.watermark ?? Date.now())).toISOString();
    if (!customerPsid) return;
    const externalConversationId = `psid:${pageId}:${customerPsid}`;

    const { data: convRaw } = await admin
      .from("conversations")
      .select("id")
      .eq("workspace_id", account.workspace_id)
      .eq("channel", "messenger")
      .eq("external_conversation_id", externalConversationId)
      .maybeSingle();
    const conv = convRaw as { id: string } | null;
    if (!conv) return;

    await admin
      .from("messages")
      .update({ status: "read" })
      .eq("conversation_id", conv.id)
      .eq("direction", "outbound")
      .lte("created_at", watermarkIso)
      .neq("status", "read");

    // When the customer reads, our outbound-side unread doesn't change; but
    // if the agent-side read comes back (unlikely on Meta), still clamp to 0.
    await admin
      .from("conversations")
      .update({ unread_count: 0, updated_at: new Date().toISOString() })
      .eq("id", conv.id);
    return;
  }
}

// ---------- contact / identity ----------

async function resolveContact(
  admin: Admin,
  workspaceId: string,
  externalId: string,
  meta: { displayName: string | null },
): Promise<string> {
  const { data: existingIdRaw } = await admin
    .from("channel_identities")
    .select("id, contact_id")
    .eq("workspace_id", workspaceId)
    .eq("channel", "messenger")
    .eq("external_id", externalId)
    .maybeSingle();
  const existingId = existingIdRaw as { id: string; contact_id: string | null } | null;

  if (existingId?.contact_id) {
    await admin
      .from("channel_identities")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", existingId.id);
    return existingId.contact_id;
  }

  const { data: contactRaw, error: cErr } = await admin
    .from("contacts")
    .insert({
      workspace_id: workspaceId,
      name: meta.displayName ?? `Messenger user ${externalId.slice(-6)}`,
      display_name: meta.displayName,
      source: "messenger",
    })
    .select("id")
    .maybeSingle();
  if (cErr) throw new Error(cErr.message);
  const contactId = (contactRaw as { id: string }).id;

  if (existingId) {
    await admin
      .from("channel_identities")
      .update({ contact_id: contactId, last_seen_at: new Date().toISOString() })
      .eq("id", existingId.id);
  } else {
    await admin.from("channel_identities").insert({
      workspace_id: workspaceId,
      contact_id: contactId,
      channel: "messenger",
      external_id: externalId,
      display_name: meta.displayName,
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    });
  }

  return contactId;
}

// ---------- Chatbot auto-reply ----------

interface RunBotArgs {
  admin: Admin;
  account: MessengerAccountRow;
  conversationId: string;
  senderPsid: string;
  userText: string;
}

async function runMessengerChatbot(args: RunBotArgs) {
  const { admin, account, conversationId, senderPsid, userText } = args;
  const start = Date.now();

  // Find an active chatbot deployed to this Messenger account.
  const { data: botRaw } = await admin
    .from("chatbots")
    .select(
      "id, workspace_id, status, fallback_message, welcome_message, model, provider_id, temperature, max_tokens, system_prompt, handoff_enabled, handoff_keywords, language, personality, tone, widget_config",
    )
    .eq("workspace_id", account.workspace_id)
    .eq("status", "active")
    .contains("widget_config", { channel: "messenger", messenger_account_id: account.id })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const bot = botRaw as ChatbotRow | null;
  if (!bot) return;

  // Reuse or open a chatbot session for this (bot, psid).
  const { data: existingRaw } = await admin
    .from("chatbot_sessions")
    .select("id, status")
    .eq("chatbot_id", bot.id)
    .eq("channel", "messenger")
    .eq("external_id", senderPsid)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const existingSession = existingRaw as { id: string; status: string } | null;

  // If the session has been handed off to a human agent, don't auto-reply.
  if (existingSession?.status === "handed_off") return;

  let sessionId = existingSession?.id ?? null;
  if (!sessionId) {
    const { data: createdRaw, error } = await admin
      .from("chatbot_sessions")
      .insert({
        workspace_id: bot.workspace_id,
        chatbot_id: bot.id,
        channel: "messenger",
        external_id: senderPsid,
        status: "active",
        metadata: {
          messenger_account_id: account.id,
          page_id: account.page_id,
          page_name: account.page_name,
          conversation_id: conversationId,
        },
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    sessionId = (createdRaw as { id: string }).id;
  }

  // Prompt-injection heuristic (mirrors Instagram + chatbotChat).
  const cleaned = userText
    .replace(/<\s*\/?\s*system\s*>/gi, "")
    .replace(/^\s*(ignore|disregard)\s+(all\s+)?previous\s+instructions.*/gim, "[filtered]");

  await admin.from("chatbot_messages").insert({
    workspace_id: bot.workspace_id,
    session_id: sessionId,
    role: "user",
    content: cleaned,
  });

  // Handoff via keyword.
  const lower = cleaned.toLowerCase();
  const handoff =
    bot.handoff_enabled &&
    (bot.handoff_keywords ?? []).some((k) => k && lower.includes(k.toLowerCase()));
  if (handoff) {
    const reply = "Connecting you with a human agent — one moment.";
    await admin
      .from("chatbot_sessions")
      .update({
        status: "handed_off",
        handoff_reason: "keyword",
        handed_off_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
    await admin.from("chatbot_messages").insert({
      workspace_id: bot.workspace_id,
      session_id: sessionId,
      role: "assistant",
      content: reply,
      latency_ms: Date.now() - start,
    });
    await sendAndPersist({ admin, account, conversationId, recipientPsid: senderPsid, text: reply });
    return;
  }

  // Load short history (last 10 turns).
  const { data: histRaw } = await admin
    .from("chatbot_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(10);
  const history = ((histRaw as { role: string; content: string }[] | null) ?? []).reverse();

  const system = [
    bot.system_prompt || "You are a helpful Facebook Messenger assistant.",
    `Channel: Facebook Messenger for page "${account.page_name ?? "our business"}".`,
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
  let model = bot.model ?? "google/gemini-2.5-flash";
  let providerKind = "";
  try {
    const { runChat } = await import("@/lib/ai/complete.functions");
    const res = await runChat({
      workspaceId: bot.workspace_id,
      feature: "chatbot:messenger",
      primaryProviderId: bot.provider_id,
      request: {
        model: bot.model || "google/gemini-2.5-flash",
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
    console.warn("[messenger-webhook] AI call failed, using fallback:", (err as Error).message);
  }

  await admin.from("chatbot_messages").insert({
    workspace_id: bot.workspace_id,
    session_id: sessionId,
    role: "assistant",
    content: reply,
    latency_ms: Date.now() - start,
    model,
    provider_kind: providerKind,
  });
  await admin
    .from("chatbot_sessions")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", sessionId);

  await sendAndPersist({ admin, account, conversationId, recipientPsid: senderPsid, text: reply });
}

async function sendAndPersist(opts: {
  admin: Admin;
  account: MessengerAccountRow;
  conversationId: string;
  recipientPsid: string;
  text: string;
}) {
  const { admin, account, conversationId, recipientPsid, text } = opts;
  if (!account.access_token_ciphertext) {
    console.warn("[messenger-webhook] no page token; skipping auto-reply");
    return;
  }
  try {
    const { sendMessengerMessage } = await import("./send.server");
    const result = await sendMessengerMessage({
      pageId: account.page_id,
      accessTokenCipher: account.access_token_ciphertext,
      recipientPsid,
      text,
      messagingType: "RESPONSE",
    });
    const nowIso = new Date().toISOString();
    await admin.from("messages").insert({
      workspace_id: account.workspace_id,
      conversation_id: conversationId,
      direction: "outbound",
      status: "sent",
      body: text,
      message_type: "text",
      provider_message_id: result.messageId,
      from_address: account.page_id,
      to_address: recipientPsid,
      created_at: nowIso,
      metadata: { source: "messenger_chatbot", auto_reply: true },
    });
    await admin
      .from("conversations")
      .update({
        last_message_at: nowIso,
        last_message_preview: text.slice(0, 240),
        last_message_from: "bot",
        updated_at: nowIso,
      })
      .eq("id", conversationId);
  } catch (err) {
    console.error("[messenger-webhook] auto-reply send failed:", (err as Error).message);
  }
}
