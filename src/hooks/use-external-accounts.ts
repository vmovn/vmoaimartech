/**
 * Telegram / Messenger / Instagram / Email / SMS accounts, projected into the
 * shape the omnichannel inbox selector understands.
 *
 * Only WhatsApp lives in `channel_accounts`; every other network has its own
 * provider table. This hook reads those tables and returns `ChannelAccountRow`
 * objects with a synthetic `telegram:<uuid>` / `email:<uuid>` / `sms:<uuid>`
 * id (see `@/lib/inbox/external-account-ids`), so the selector, filters and
 * unread badges treat every channel the same way.
 */

import { useQuery } from "@tanstack/react-query";
import { isKnownProvider } from "@/lib/inbox/channel-capabilities";
import { supabase } from "@/integrations/supabase/client";
import type { ChannelAccountRow } from "@/hooks/use-channel-accounts";
import { externalAccountId } from "@/lib/inbox/external-account-ids";
import type { ExternalAccountChannel } from "@/lib/inbox/external-account-ids";


type Status = ChannelAccountRow["status"];

function toStatus(raw: string | null | undefined): Status {
  switch ((raw ?? "").toLowerCase()) {
    case "connected":
    case "active":
      return "connected";
    case "error":
    case "invalid":
    case "token_invalid":
      return "error";
    case "suspended":
      return "suspended";
    case "pending":
      return "pending";
    default:
      return "disconnected";
  }
}

interface BaseRow {
  id: string;
  workspace_id: string;
  status: string | null;
  status_reason: string | null;
  metadata: Record<string, unknown> | null;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

function shape(
  channel: ExternalAccountChannel,
  provider: string,
  row: BaseRow,
  displayName: string,
  subtitle: string | null,
): ChannelAccountRow {
  return {
    id: externalAccountId(channel, row.id),
    workspace_id: row.workspace_id,
    inbox_id: null,
    provider,
    display_name: displayName,
    phone_number: subtitle,
    phone_number_id: null,
    waba_id: null,
    business_id: null,
    access_token_secret_name: null,
    app_secret_name: null,
    verify_token: null,
    status: toStatus(row.status),
    status_reason: row.status_reason,
    metadata: { ...(row.metadata ?? {}), account_id: row.id },
    is_default: false,
    last_verified_at: row.last_verified_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** All non-WhatsApp provider-table accounts for a workspace. */
export function useExternalChannelAccounts(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["external-channel-accounts", workspaceId],
    enabled: !!workspaceId,
    staleTime: 30_000,
    queryFn: async (): Promise<ChannelAccountRow[]> => {
      const base = "id, workspace_id, status, status_reason, metadata, last_verified_at, created_at, updated_at";
      const [tg, ms, ig, em, sm] = await Promise.all([
        supabase
          .from("telegram_accounts")
          .select(`${base}, bot_name, bot_username, bot_id`)
          .eq("workspace_id", workspaceId!),
        supabase
          .from("messenger_accounts")
          .select(`${base}, page_name, page_id`)
          .eq("workspace_id", workspaceId!),
        supabase
          .from("instagram_accounts")
          .select(`${base}, username, name, ig_user_id`)
          .eq("workspace_id", workspaceId!),
        supabase
          .from("email_accounts")
          .select(`${base}, display_name, from_email, provider`)
          .eq("workspace_id", workspaceId!),
        supabase
          .from("sms_accounts")
          .select(`${base}, display_name, phone_number, provider`)
          .eq("workspace_id", workspaceId!),
      ]);

      const firstError = tg.error ?? ms.error ?? ig.error ?? em.error ?? sm.error;
      if (firstError) throw firstError;

      const out: ChannelAccountRow[] = [];

      // Rows here come from channel-typed tables, so the channel is known even
      // when the vendor string is not in the provider registry (e.g. a new SMS
      // gateway). Fall back to the channel's canonical provider instead of
      // letting the account show up as "unsupported channel type".
      const providerFor = (fallback: string, raw: string | null) => {
        const p = (raw ?? "").trim().toLowerCase();
        return p && isKnownProvider(p) ? p : fallback;
      };

      for (const r of ((tg.data ?? []) as unknown) as (BaseRow & {
        bot_name: string | null;
        bot_username: string | null;
        bot_id: string | null;
      })[]) {
        out.push(
          shape("telegram", "telegram", r, r.bot_name?.trim() || r.bot_username || "Telegram bot",
            r.bot_username ? `@${r.bot_username.replace(/^@/, "")}` : null),
        );
      }

      for (const r of ((ms.data ?? []) as unknown) as (BaseRow & {
        page_name: string | null;
        page_id: string | null;
      })[]) {
        out.push(
          shape("messenger", "meta_messenger", r, r.page_name?.trim() || "Facebook Page", r.page_id),
        );
      }

      for (const r of ((ig.data ?? []) as unknown) as (BaseRow & {
        username: string | null;
        name: string | null;
        ig_user_id: string | null;
      })[]) {
        out.push(
          shape("instagram", "meta_instagram", r, r.name?.trim() || r.username || "Instagram account",
            r.username ? `@${r.username.replace(/^@/, "")}` : null),
        );
      }

      for (const r of ((em.data ?? []) as unknown) as (BaseRow & {
        display_name: string | null;
        from_email: string | null;
        provider: string | null;
      })[]) {
        out.push(
          shape("email", providerFor("email", r.provider), r, r.display_name?.trim() || r.from_email || "Email account",
            r.from_email),
        );
      }

      for (const r of ((sm.data ?? []) as unknown) as (BaseRow & {
        display_name: string | null;
        phone_number: string | null;
        provider: string | null;
      })[]) {
        out.push(
          shape("sms", providerFor("sms", r.provider), r, r.display_name?.trim() || r.phone_number || "SMS number",
            r.phone_number),
        );
      }

      return out;
    },
  });
}
