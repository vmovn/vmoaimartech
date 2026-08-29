/**
 * Facebook Messenger (Meta Pages) OAuth + account management server functions.
 *
 * Flow mirrors Instagram linking but persists Facebook Pages themselves for
 * Messenger messaging. See src/routes/api/public/messenger/callback.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const META_OAUTH_BASE = "https://www.facebook.com/v21.0/dialog/oauth";
const META_SCOPES = [
  "pages_show_list",
  "pages_messaging",
  "pages_manage_metadata",
  "pages_read_engagement",
  "pages_manage_engagement",
  "business_management",
];

function requireAppId(): string {
  const id = process.env.META_APP_ID;
  if (!id) throw new Error("META_APP_ID not configured. Add it in project secrets to enable Messenger linking.");
  return id;
}

export const startMessengerOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { workspaceId: string; origin: string; returnTo?: string }) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        origin: z.string().url(),
        returnTo: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const appId = requireAppId();
    const state = randomBytes(24).toString("base64url");
    const redirectUri = `${data.origin.replace(/\/$/, "")}/api/public/messenger/callback`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("messenger_oauth_states").insert({
      state,
      workspace_id: data.workspaceId,
      user_id: context.userId,
      redirect_uri: redirectUri,
      return_to: data.returnTo ?? "/api-config/messenger",
    });
    if (error) throw new Error(error.message);

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      state,
      scope: META_SCOPES.join(","),
      response_type: "code",
      display: "popup",
    });
    return { url: `${META_OAUTH_BASE}?${params.toString()}` };
  });

export const listMessengerAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("messenger_accounts")
      .select(
        "id, page_id, page_name, category, profile_picture_url, status, status_reason, scopes, connected_at, last_verified_at, token_expires_at",
      )
      .eq("workspace_id", data.workspaceId)
      .order("connected_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { accounts: rows ?? [], configured: Boolean(process.env.META_APP_ID) };
  });

export const disconnectMessengerAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { accountId: string }) =>
    z.object({ accountId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("messenger_accounts")
      .update({ status: "disconnected", status_reason: "Disconnected by user" })
      .eq("id", data.accountId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMessengerAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { accountId: string }) =>
    z.object({ accountId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("messenger_accounts")
      .delete()
      .eq("id", data.accountId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
