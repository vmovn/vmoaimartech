/**
 * Telegram Bot API send helpers — server-only.
 *
 * Uses the encrypted bot token stored on `telegram_accounts`. Telegram is
 * called directly (api.telegram.org); no gateway hop is required because the
 * workspace brings its own bot token from BotFather.
 */
import { decryptToken } from "@/lib/instagram/token-crypto.server";

const API = "https://api.telegram.org";

export interface TelegramSendInput {
  botTokenCipher: string;
  chatId: string;
  text?: string | null;
  /** Public URL of a media file to deliver instead of / alongside text. */
  media?: { url: string; kind: "photo" | "video" | "audio" | "document" } | null;
  replyToMessageId?: number | null;
}

export interface TelegramSendResult {
  messageId: string;
  chatId: string;
}

export class TelegramApiError extends Error {
  readonly status: number;
  readonly isAuthError: boolean;
  constructor(message: string, status: number) {
    super(message);
    this.name = "TelegramApiError";
    this.status = status;
    this.isAuthError = status === 401 || status === 403;
  }
}

export async function callTelegram<T = Record<string, unknown>>(
  botTokenCipher: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const token = decryptToken(botTokenCipher);
  return callTelegramRaw<T>(token, method, body);
}

export async function callTelegramRaw<T = Record<string, unknown>>(
  botToken: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const resp = await fetch(`${API}/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await resp.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: T;
    description?: string;
    error_code?: number;
  };
  if (!resp.ok || json.ok !== true) {
    throw new TelegramApiError(
      json.description ?? `Telegram ${method} failed with HTTP ${resp.status}`,
      json.error_code ?? resp.status,
    );
  }
  return json.result as T;
}

export async function sendTelegramMessage(input: TelegramSendInput): Promise<TelegramSendResult> {
  const base: Record<string, unknown> = { chat_id: input.chatId };
  if (input.replyToMessageId) base.reply_to_message_id = input.replyToMessageId;

  let method = "sendMessage";
  const body: Record<string, unknown> = { ...base };

  if (input.media) {
    const map = {
      photo: ["sendPhoto", "photo"],
      video: ["sendVideo", "video"],
      audio: ["sendAudio", "audio"],
      document: ["sendDocument", "document"],
    } as const;
    const [m, field] = map[input.media.kind];
    method = m;
    body[field] = input.media.url;
    if (input.text?.trim()) body.caption = input.text.trim();
  } else {
    if (!input.text?.trim()) throw new Error("Message must have text or media");
    body.text = input.text.trim();
  }

  const result = await callTelegram<{ message_id: number; chat: { id: number } }>(
    input.botTokenCipher,
    method,
    body,
  );
  return { messageId: String(result.message_id), chatId: String(result.chat?.id ?? input.chatId) };
}

export async function sendTelegramTyping(botTokenCipher: string, chatId: string): Promise<void> {
  try {
    await callTelegram(botTokenCipher, "sendChatAction", { chat_id: chatId, action: "typing" });
  } catch {
    /* typing indicators are best-effort */
  }
}
