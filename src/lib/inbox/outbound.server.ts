/**
 * Outbound delivery for the Inbox composer — server-only.
 *
 * Takes an already-persisted `messages` row (inserted optimistically by the
 * composer) and delivers it to the external thread for channels that have a
 * real provider implementation (Messenger, Instagram, Telegram). Channels
 * without an outbound implementation are left as `sent` locally so existing
 * behaviour is unchanged.
 *
 * Routing conventions (set by the inbound webhooks):
 *   - owning account  → `conversations.metadata.account_id`
 *   - external thread → `conversations.metadata.chat_id`
 *                       ?? `conversations.external_conversation_id`
 *                       ?? `channel_identities.external_id` for the contact
 */

import type { TemplateSendPayload } from "@/lib/messaging/template-send-payload";

export type DeliverableChannel = "messenger" | "instagram" | "telegram";

export const DELIVERABLE_CHANNELS: readonly DeliverableChannel[] = [
  "messenger",
  "instagram",
  "telegram",
];

export interface TemplateMessageMetadata {
  template_name?: string;
  template_language?: string;
  template_components?: TemplateSendPayload["components"];
}

interface ConversationRow {
  id: string;
  workspace_id: string;
  channel: string;
  contact_id: string | null;
  channel_account_id?: string | null;
  external_conversation_id: string | null;
  metadata: Record<string, unknown> | null;
}

interface MessageRow {
  id: string;
  workspace_id: string;
  conversation_id: string | null;
  direction: string;
  body: string | null;
  media_url: string | null;
  media_type: string | null;
  status: string;
  message_type: string | null;
  metadata: unknown | null;
}

export interface DeliverResult {
  delivered: boolean;
  status: "sent" | "failed" | "skipped";
  providerMessageId?: string | null;
  error?: string;
}

/** Map a mime type onto the coarse media kind each provider expects. */
function mediaKind(mime: string | null): "image" | "video" | "audio" | "document" {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "document";
}

/**
 * Resolve the external recipient id from the conversation record.
 *
 * `external_conversation_id` may be a composite thread key written by the
 * inbound webhooks (e.g. `wa:<phone_number_id>:<msisdn>`); the recipient is the
 * last segment, never the whole key.
 */
function resolveRecipient(conv: ConversationRow): string | null {
  const meta = (conv.metadata ?? {}) as Record<string, unknown>;
  const chatId = meta["chat_id"];
  if (typeof chatId === "string" && chatId) return chatId;
  if (typeof chatId === "number") return String(chatId);
  const ext = conv.external_conversation_id;
  if (ext) {
    if (ext.includes(":")) return ext.split(":").filter(Boolean).pop() ?? null;
    return ext;
  }
  return null;
}


/**
 * Deliver a persisted outbound message to its external channel.
 * Never throws — failures are recorded on the message row and returned.
 */
export async function deliverInboxMessage(args: {
  messageId: string;
  userId: string;
}): Promise<DeliverResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as {
    from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };

  const { data: msgRaw } = await admin
    .from("messages")
    .select(
      "id, workspace_id, conversation_id, direction, body, media_url, media_type, status, message_type, metadata",
    )
    .eq("id", args.messageId)
    .maybeSingle();
  const msg = msgRaw as MessageRow | null;
  if (!msg || msg.direction !== "outbound" || !msg.conversation_id) {
    return { delivered: false, status: "skipped" };
  }

  const { data: convRaw } = await admin
    .from("conversations")
    .select(
      "id, workspace_id, channel, contact_id, channel_account_id, external_conversation_id, metadata",
    )
    .eq("id", msg.conversation_id)
    .maybeSingle();
  const conv = convRaw as ConversationRow | null;
  if (!conv || conv.workspace_id !== msg.workspace_id) {
    return { delivered: false, status: "skipped" };
  }

  const markFailed = async (reason: string): Promise<DeliverResult> => {
    await admin
      .from("messages")
      .update({ status: "failed", failed_reason: reason.slice(0, 500) })
      .eq("id", msg.id);
    return { delivered: false, status: "failed", error: reason };
  };

  // ---- WhatsApp Cloud ------------------------------------------------------
  if (conv.channel === "whatsapp" || conv.channel === "whatsapp_cloud") {
    const metaAccount = ((conv.metadata ?? {}) as Record<string, unknown>)["account_id"];
    const waAccountId =
      (conv as unknown as { channel_account_id?: string | null }).channel_account_id ??
      (typeof metaAccount === "string" ? metaAccount : null);
    if (!waAccountId) {
      return markFailed("This conversation is not linked to a connected WhatsApp number.");
    }

    // Recipient: explicit to_address → conversation routing → contact phone.
    let to = resolveRecipient(conv);
    if (!to && conv.contact_id) {
      const { data: identRaw } = await admin
        .from("channel_identities")
        .select("external_id")
        .eq("contact_id", conv.contact_id)
        .eq("channel", "whatsapp")
        .maybeSingle();
      to = (identRaw as { external_id?: string } | null)?.external_id ?? null;
      if (!to) {
        const { data: contactRaw } = await admin
          .from("contacts")
          .select("phone")
          .eq("id", conv.contact_id)
          .maybeSingle();
        to = (contactRaw as { phone?: string | null } | null)?.phone ?? null;
      }
    }
    if (!to) return markFailed("Could not resolve the WhatsApp number for this thread.");

    const cleanTo = to.replace(/[^\d+]/g, "");

    const isTemplate = msg.message_type === "template";
    const meta = (msg.metadata as TemplateMessageMetadata | null) ?? {};
    const hasTemplateMeta =
      isTemplate && meta.template_name && meta.template_language && Array.isArray(meta.template_components);

    try {
      const { loadChannelAccount, loadCredentials, getProvider } = await import(
        "@/lib/messaging/registry.server"
      );
      const account = await loadChannelAccount(waAccountId);
      const credentials = loadCredentials(account);
      const impl = getProvider(account.provider);

      let payload: Record<string, unknown>;
      const interactivePayload =
        msg.message_type === "interactive" &&
        typeof (msg.metadata as Record<string, unknown> | null)?.["interactive"] === "object"
          ? ((msg.metadata as Record<string, unknown>)["interactive"] as Record<string, unknown>)
          : null;

      if (hasTemplateMeta) {
        payload = {
          to: cleanTo,
          type: "template",
          template: {
            name: meta.template_name,
            language: meta.template_language,
            components: meta.template_components,
          },
        };
      } else if (interactivePayload) {
        payload = { to: cleanTo, type: "interactive", interactive: interactivePayload };
      } else {

        const waText = msg.body?.trim() ? msg.body : null;
        const { resolveWhatsAppMedia } = await import(
          "@/lib/messaging/whatsapp-media-support"
        );
        const mediaName = ((msg.metadata ?? {}) as Record<string, unknown>)["media_name"];
        const waMedia = msg.media_url
          ? {
              ...resolveWhatsAppMedia({
                mimeType: msg.media_type,
                filename: typeof mediaName === "string" ? mediaName : null,
              }),
              url: msg.media_url,
            }
          : null;
        if (!waText && !waMedia) return markFailed("Message is empty.");
        payload = {
          to: cleanTo,
          type: waMedia ? waMedia.kind : "text",
          ...(waMedia
            ? {
                media: {
                  kind: waMedia.kind,
                  url: waMedia.url,
                  mimeType: waMedia.mimeType,
                  filename: waMedia.filename,
                  caption: waText ?? undefined,
                },
              }
            : { text: { body: waText! } }),
        };
      }


      const res = await impl.send(payload as never, {
        account,
        credentials,
        correlationId: `inbox-${msg.id}`,
        log: async () => {},
      } as never);
      await admin
        .from("messages")
        .update({
          status: "sent",
          provider_message_id: res.externalMessageId,
          // Delivery receipts arrive keyed by the provider id; store it in
          // both columns so webhook status events match this row.
          external_message_id: res.externalMessageId,
          to_address: to,
          failed_reason: null,
        })
        .eq("id", msg.id);

      return { delivered: true, status: "sent", providerMessageId: res.externalMessageId };
    } catch (err) {
      const rawReason = (err as Error)?.message ?? "WhatsApp delivery failed";
      const { explainWhatsAppDeliveryFailure } = await import(
        "@/lib/messaging/whatsapp-delivery-errors"
      );
      const failure = explainWhatsAppDeliveryFailure(rawReason);
      const reason = failure.action
        ? `${failure.summary}. ${failure.action}`
        : failure.summary;
      return markFailed(reason);
    }
  }

  const channel = conv.channel as DeliverableChannel;
  if (!DELIVERABLE_CHANNELS.includes(channel)) {
    // No outbound implementation for this channel — keep the local ack.
    await admin.from("messages").update({ status: "sent" }).eq("id", msg.id);
    return { delivered: false, status: "skipped" };
  }

  const accountId = ((conv.metadata ?? {}) as Record<string, unknown>)[
    "account_id"
  ];

  const fail = async (reason: string): Promise<DeliverResult> => {
    await admin
      .from("messages")
      .update({ status: "failed", failed_reason: reason.slice(0, 500) })
      .eq("id", msg.id);
    return { delivered: false, status: "failed", error: reason };
  };

  if (typeof accountId !== "string" || !accountId) {
    return fail("This conversation is not linked to a connected account.");
  }

  // Recipient: chat id / thread id from the conversation, else channel identity.
  let recipient = resolveRecipient(conv);
  if (!recipient && conv.contact_id) {
    const { data: identRaw } = await admin
      .from("channel_identities")
      .select("external_id")
      .eq("contact_id", conv.contact_id)
      .eq("channel", channel)
      .maybeSingle();
    recipient = (identRaw as { external_id?: string } | null)?.external_id ?? null;
  }
  if (!recipient) return fail("Could not resolve the recipient for this thread.");

  const media = msg.media_url
    ? { url: msg.media_url, kind: mediaKind(msg.media_type) }
    : null;
  const text = msg.body?.trim() ? msg.body : null;
  if (!text && !media) return fail("Message is empty.");

  try {
    let providerMessageId = "";

    if (channel === "telegram") {
      const { data: accRaw } = await admin
        .from("telegram_accounts")
        .select("bot_token_ciphertext, status, status_reason, workspace_id")
        .eq("id", accountId)
        .maybeSingle();
      const acc = accRaw as {
        bot_token_ciphertext?: string;
        status?: string;
        status_reason?: string | null;
        workspace_id?: string;
      } | null;
      if (!acc || acc.workspace_id !== conv.workspace_id) {
        return fail("Telegram bot for this thread was not found.");
      }
      if (!acc.bot_token_ciphertext) return fail("Telegram bot token is missing.");
      if (acc.status && acc.status !== "connected") {
        return fail(
          `Telegram bot is ${acc.status}${acc.status_reason ? ` — ${acc.status_reason}` : ""}.`,
        );
      }
      const { sendTelegramMessage } = await import("@/lib/telegram/send.server");
      const res = await sendTelegramMessage({
        botTokenCipher: acc.bot_token_ciphertext,
        chatId: recipient,
        text,
        media: media
          ? {
              url: media.url,
              kind:
                media.kind === "image"
                  ? "photo"
                  : media.kind === "video"
                    ? "video"
                    : media.kind === "audio"
                      ? "audio"
                      : "document",
            }
          : null,
      });
      providerMessageId = res.messageId;
    } else if (channel === "messenger") {
      const { data: accRaw } = await admin
        .from("messenger_accounts")
        .select("page_id, access_token_ciphertext, status, status_reason, workspace_id")
        .eq("id", accountId)
        .maybeSingle();
      const acc = accRaw as {
        page_id?: string;
        access_token_ciphertext?: string;
        status?: string;
        status_reason?: string | null;
        workspace_id?: string;
      } | null;
      if (!acc || acc.workspace_id !== conv.workspace_id) {
        return fail("Facebook Page for this thread was not found.");
      }
      if (!acc.page_id || !acc.access_token_ciphertext) {
        return fail("Facebook Page access token is missing. Reconnect the page.");
      }
      if (acc.status && acc.status !== "connected") {
        return fail(
          `Facebook Page is ${acc.status}${acc.status_reason ? ` — ${acc.status_reason}` : ""}.`,
        );
      }
      const { sendMessengerMessage } = await import("@/lib/messenger/send.server");
      const res = await sendMessengerMessage({
        pageId: acc.page_id,
        accessTokenCipher: acc.access_token_ciphertext,
        recipientPsid: recipient,
        text,
        attachment: media
          ? {
              type: media.kind === "document" ? "file" : media.kind,
              url: media.url,
            }
          : null,
        messagingType: "RESPONSE",
      });
      providerMessageId = res.messageId;
    } else {
      const { data: accRaw } = await admin
        .from("instagram_accounts")
        .select(
          "page_id, ig_user_id, access_token_ciphertext, status, status_reason, workspace_id",
        )
        .eq("id", accountId)
        .maybeSingle();
      const acc = accRaw as {
        page_id?: string;
        ig_user_id?: string;
        access_token_ciphertext?: string;
        status?: string;
        status_reason?: string | null;
        workspace_id?: string;
      } | null;
      if (!acc || acc.workspace_id !== conv.workspace_id) {
        return fail("Instagram account for this thread was not found.");
      }
      if (!acc.access_token_ciphertext || !(acc.page_id || acc.ig_user_id)) {
        return fail("Instagram access token is missing. Reconnect the account.");
      }
      if (acc.status && acc.status !== "connected") {
        return fail(
          `Instagram account is ${acc.status}${acc.status_reason ? ` — ${acc.status_reason}` : ""}.`,
        );
      }
      const { sendInstagramMessage } = await import("@/lib/instagram/send.server");
      const res = await sendInstagramMessage({
        senderId: acc.page_id ?? acc.ig_user_id!,
        accessTokenCipher: acc.access_token_ciphertext,
        recipientId: recipient,
        text,
        media,
      });
      providerMessageId = res.messageId;
    }

    await admin
      .from("messages")
      .update({
        status: "sent",
        provider_message_id: providerMessageId || null,
        external_message_id: providerMessageId || null,
        to_address: recipient,
        failed_reason: null,
      })
      .eq("id", msg.id);


    return { delivered: true, status: "sent", providerMessageId };
  } catch (err) {
    return fail((err as Error).message ?? "Delivery failed");
  }
}

/**
 * Deliver every still-queued outbound message in a conversation.
 *
 * The composer delivers inline, but a dropped network call can leave a row
 * stuck at `queued` forever. This lets the client resume those safely — each
 * message is re-checked server-side and only delivered while still queued.
 */
export async function deliverQueuedMessages(args: {
  conversationId: string;
  userId: string;
  limit?: number;
}): Promise<{ attempted: number; sent: number; failed: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as {
    from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };

  const { data: rows } = await admin
    .from("messages")
    .select("id")
    .eq("conversation_id", args.conversationId)
    .eq("direction", "outbound")
    .eq("status", "queued")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(args.limit ?? 20);

  const ids = ((rows ?? []) as { id: string }[]).map((r) => r.id);
  let sent = 0;
  let failed = 0;
  for (const id of ids) {
    const result = await deliverInboxMessage({ messageId: id, userId: args.userId });
    if (result.status === "sent") sent += 1;
    else if (result.status === "failed") failed += 1;
  }
  return { attempted: ids.length, sent, failed };
}
