/**
 * Facebook Messenger Send API helper.
 *
 * Server-only. Uses the encrypted Page access token stored on
 * `messenger_accounts` to call Meta Graph `/messages`. Supports text and
 * a single attachment (image | video | audio | file) delivered by public URL.
 */
import { decryptToken } from "@/lib/instagram/token-crypto.server";

const GRAPH = "https://graph.facebook.com/v21.0";

export type MessengerAttachmentType = "image" | "video" | "audio" | "file";

export interface MessengerSendInput {
  pageId: string;
  accessTokenCipher: string;
  recipientPsid: string;
  text?: string | null;
  attachment?: {
    type: MessengerAttachmentType;
    url: string;
  } | null;
  messagingType?: "RESPONSE" | "UPDATE" | "MESSAGE_TAG";
  tag?: string | null;
}

export interface MessengerSendResult {
  messageId: string;
  recipientId: string;
}

export async function sendMessengerMessage(
  input: MessengerSendInput,
): Promise<MessengerSendResult> {
  const token = decryptToken(input.accessTokenCipher);

  const message: Record<string, unknown> = {};
  if (input.attachment) {
    message.attachment = {
      type: input.attachment.type,
      payload: { url: input.attachment.url, is_reusable: true },
    };
  } else if (input.text && input.text.trim()) {
    message.text = input.text.trim();
  } else {
    throw new Error("Message must have text or an attachment");
  }

  const body: Record<string, unknown> = {
    recipient: { id: input.recipientPsid },
    message,
    messaging_type: input.messagingType ?? "RESPONSE",
  };
  if (input.tag) body.tag = input.tag;

  const url = `${GRAPH}/${encodeURIComponent(input.pageId)}/messages?access_token=${encodeURIComponent(token)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await resp.json().catch(() => ({}))) as {
    message_id?: string;
    recipient_id?: string;
    error?: { message?: string; code?: number; error_subcode?: number; type?: string };
  };
  if (!resp.ok || json.error) {
    const msg = json.error?.message ?? `Messenger send failed (${resp.status})`;
    const err = new Error(msg) as Error & {
      metaCode?: number;
      metaSubcode?: number;
      metaType?: string;
      isAuthError?: boolean;
    };
    err.metaCode = json.error?.code;
    err.metaSubcode = json.error?.error_subcode;
    err.metaType = json.error?.type;
    err.isAuthError = isMetaAuthError(json.error?.code, json.error?.error_subcode);
    throw err;
  }
  return {
    messageId: json.message_id ?? "",
    recipientId: json.recipient_id ?? input.recipientPsid,
  };
}

/**
 * Meta OAuth error codes/subcodes indicating the Page access token is
 * invalid, expired, or the user revoked authorization.
 * https://developers.facebook.com/docs/graph-api/guides/error-handling/
 */
export function isMetaAuthError(code?: number, subcode?: number): boolean {
  if (code === 190) return true; // OAuthException — invalid/expired token
  if (code === 102 || code === 10 || code === 200) return true; // session/permission
  if (subcode && [458, 459, 460, 463, 464, 467, 492].includes(subcode)) return true;
  return false;
}
