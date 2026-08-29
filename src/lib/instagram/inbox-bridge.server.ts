/**
 * Instagram → unified Inbox bridge (server-only).
 *
 * Instagram DMs used to live only in `instagram_webhook_events` + the chatbot
 * tables, so they never appeared in the omnichannel inbox. This module mirrors
 * every inbound DM (and every bot reply) into `conversations` / `messages`,
 * exactly like the Telegram and Messenger webhooks do.
 *
 * The owning account is stored in `conversations.metadata.account_id`
 * (the `instagram_accounts` row id) because `conversations.channel_account_id`
 * has a FK to `channel_accounts`, which only holds WhatsApp rows.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

import { ensureInboxThread } from "@/lib/inbox/thread-dedup.server";

export interface IgBridgeAccount {
  id: string;
  workspace_id: string;
  ig_user_id: string;
  username: string | null;
}

/** Resolve (or create) the contact behind an Instagram sender id. */
async function resolveContact(
  admin: Admin,
  workspaceId: string,
  igsid: string,
  displayName: string | null,
): Promise<string> {
  const { data: existingRaw } = await admin
    .from("channel_identities")
    .select("id, contact_id")
    .eq("workspace_id", workspaceId)
    .eq("channel", "instagram")
    .eq("external_id", igsid)
    .maybeSingle();
  const existing = existingRaw as { id: string; contact_id: string | null } | null;

  if (existing?.contact_id) {
    await admin
      .from("channel_identities")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", existing.id);
    return existing.contact_id;
  }

  const { data: contactRaw, error } = await admin
    .from("contacts")
    .insert({
      workspace_id: workspaceId,
      name: displayName ?? `Instagram user ${igsid.slice(-6)}`,
      display_name: displayName,
      source: "instagram",
    })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const contactId = (contactRaw as { id: string }).id;

  const identity = {
    workspace_id: workspaceId,
    contact_id: contactId,
    channel: "instagram",
    external_id: igsid,
    display_name: displayName,
    last_seen_at: new Date().toISOString(),
    metadata: {},
  };
  if (existing) await admin.from("channel_identities").update(identity).eq("id", existing.id);
  else await admin.from("channel_identities").insert(identity);
  return contactId;
}

/** Ensure the conversation for an (account, sender) pair exists. */
export async function ensureInstagramConversation(
  admin: Admin,
  account: IgBridgeAccount,
  igsid: string,
  opts: { preview: string; inbound: boolean; displayName?: string | null },
): Promise<string> {
  const externalConversationId = `ig:${account.ig_user_id}:${igsid}`;

  const contactId = await resolveContact(
    admin,
    account.workspace_id,
    igsid,
    opts.displayName ?? null,
  );

  const { conversationId } = await ensureInboxThread(admin, {
    workspaceId: account.workspace_id,
    channel: "instagram",
    externalConversationId,
    accountId: account.id,
    contactId,
    inbound: opts.inbound,
    preview: opts.preview,
    metadata: {
      source: "instagram_webhook",
      ig_user_id: account.ig_user_id,
      igsid,
    },
  });
  return conversationId;
}

/** Mirror one Instagram message into the inbox. Never throws. */
export async function mirrorInstagramMessage(
  admin: Admin,
  account: IgBridgeAccount,
  igsid: string,
  msg: {
    body: string;
    direction: "inbound" | "outbound";
    providerMessageId?: string | null;
    mediaType?: string | null;
    displayName?: string | null;
  },
): Promise<string | null> {
  try {
    const conversationId = await ensureInstagramConversation(admin, account, igsid, {
      preview: msg.body || (msg.mediaType ? `[${msg.mediaType}]` : ""),
      inbound: msg.direction === "inbound",
      displayName: msg.displayName ?? null,
    });

    if (msg.providerMessageId) {
      const { data: dupe } = await admin
        .from("messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("provider_message_id", msg.providerMessageId)
        .maybeSingle();
      if (dupe) return conversationId;
    }

    const { error } = await admin.from("messages").insert({
      workspace_id: account.workspace_id,
      conversation_id: conversationId,
      direction: msg.direction,
      status: msg.direction === "inbound" ? "delivered" : "sent",
      body: msg.body,
      media_type: msg.mediaType ?? null,
      message_type: msg.mediaType ? "media" : "text",
      provider_message_id: msg.providerMessageId ?? null,
      from_address: msg.direction === "inbound" ? igsid : account.ig_user_id,
      to_address: msg.direction === "inbound" ? account.ig_user_id : igsid,
      metadata: { source: "instagram_webhook", account_id: account.id },
    });
    if (error && !String(error.message ?? "").toLowerCase().includes("duplicate")) {
      console.warn("[instagram-bridge] message insert failed:", error.message);
    }
    return conversationId;
  } catch (err) {
    console.error("[instagram-bridge] mirror failed:", err);
    return null;
  }
}
