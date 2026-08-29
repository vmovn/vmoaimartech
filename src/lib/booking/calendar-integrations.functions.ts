/**
 * Calendar Integrations — server functions
 *
 * Manage calendar_accounts: list, connect, disconnect, choose calendar,
 * trigger sync, view sync log. OAuth authorization for Google/Microsoft
 * happens via the App User Connector popup helper; the resulting lovack_*
 * key is passed to `saveCalendarConnection` and stored encrypted.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY = "https://connector-gateway.lovable.dev";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/calendar",
];

const MICROSOFT_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "Calendars.ReadWrite",
  "User.Read",
];

export const listCalendarAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("calendar_accounts")
      .select("id,provider,account_email,display_name,calendar_id,color,enabled,is_primary,sync_direction,status,last_synced_at,last_sync_error,ics_url,scopes")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listSyncLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { accountId?: string; limit?: number }) => data)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("calendar_sync_log")
      .select("id,account_id,direction,operation,status,message,created_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(200, data.limit ?? 50));
    if (data.accountId) q = q.eq("account_id", data.accountId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Start OAuth for Google or Microsoft. Requires the corresponding
 * App User Connector client to be provisioned (env var set).
 */
export const startCalendarOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { provider: "google" | "microsoft"; targetOrigin: string }) => data)
  .handler(async ({ data, context }) => {
    const connectorId = data.provider === "google" ? "google_calendar" : "microsoft_outlook";
    const envVar = data.provider === "google"
      ? "GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY"
      : "MICROSOFT_OUTLOOK_APP_USER_CONNECTOR_CLIENT_API_KEY";
    const clientAPIKey = process.env[envVar];
    if (!clientAPIKey) {
      throw new Error(
        `Calendar OAuth not configured — a workspace admin must provision the ${connectorId} App User Connector client first.`,
      );
    }
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const scopes = data.provider === "google" ? GOOGLE_SCOPES : MICROSOFT_SCOPES;
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY,
      connectorId,
      appUserId: context.userId,
      clientAPIKey,
      returnUrl: data.targetOrigin + "/booking/calendar-integrations",
      responseMode: "web_message",
      webMessageTargetOrigin: data.targetOrigin,
      credentialsConfiguration: { scopes },
    });
    return { authorizationUrl };
  });

/**
 * Persist the lovack_* key from a successful OAuth flow, encrypted.
 * Auto-detects the primary calendar and stores it as the default target.
 */
export const saveCalendarConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: {
    provider: "google" | "microsoft";
    connectionAPIKey: string;
  }) => data)
  .handler(async ({ data, context }) => {
    const { encryptConnectionKey } = await import("@/lib/booking/providers/crypto.server");
    const { providerForKind, contextFor } = await import("@/lib/booking/providers/index.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: ws } = await supabaseAdmin
      .from("workspace_members").select("workspace_id").eq("user_id", context.userId).limit(1).maybeSingle();
    if (!ws) throw new Error("No workspace found");
    const workspaceId = (ws as { workspace_id: string }).workspace_id;

    const ciphertext = encryptConnectionKey(data.connectionAPIKey);

    // Probe provider for email + primary calendar
    const provider = providerForKind(data.provider);
    let email = `${context.userId}@calendar`;
    let calendarId: string | null = null;
    let calendarName: string | null = null;
    try {
      const tmpCtx = { accountId: "", workspaceId, hostId: context.userId, connectionKey: data.connectionAPIKey };
      const cals = await provider.listCalendars(tmpCtx);
      const primary = cals.find((c) => c.primary) ?? cals[0];
      calendarId = primary?.id ?? null;
      calendarName = primary?.name ?? null;
      if (data.provider === "google") {
        // Google's primary calendar id is the account email
        if (primary?.id?.includes("@")) email = primary.id;
      } else if (data.provider === "microsoft") {
        const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
        const res = await callAsAppUser({
          gatewayBaseUrl: GATEWAY,
          connectionAPIKey: data.connectionAPIKey,
          connectorId: "microsoft_outlook",
          path: "/me?$select=mail,userPrincipalName",
        });
        if (res.ok) {
          const me = await res.json() as { mail?: string; userPrincipalName?: string };
          email = me.mail ?? me.userPrincipalName ?? email;
        }
      }
      // Reference contextFor so it's not tree-shaken in the type graph
      void contextFor;
    } catch { /* keep placeholder */ }

    const { data: existing } = await supabaseAdmin
      .from("calendar_accounts")
      .select("id,is_primary")
      .eq("user_id", context.userId)
      .eq("provider", data.provider)
      .eq("account_email", email)
      .maybeSingle();

    const payload = {
      workspace_id: workspaceId,
      user_id: context.userId,
      provider: data.provider,
      account_email: email,
      display_name: calendarName,
      calendar_id: calendarId,
      connection_key_ciphertext: ciphertext,
      status: "connected",
      enabled: true,
      last_synced_at: new Date().toISOString(),
      last_sync_error: null,
    };

    const row = existing
      ? (await supabaseAdmin.from("calendar_accounts").update(payload).eq("id", (existing as { id: string }).id).select("*").maybeSingle()).data
      : (await supabaseAdmin.from("calendar_accounts").insert({ ...payload, is_primary: true }).select("*").maybeSingle()).data;

    return row;
  });

/** Register an Apple / ICS feed URL — no OAuth involved. */
export const connectIcsFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => z.object({
    account_email: z.string().min(1).max(200),
    display_name: z.string().max(200).optional(),
    ics_url: z.string().url(),
  }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ws } = await supabaseAdmin
      .from("workspace_members").select("workspace_id").eq("user_id", context.userId).limit(1).maybeSingle();
    if (!ws) throw new Error("No workspace found");
    const { data: row, error } = await supabaseAdmin.from("calendar_accounts").insert({
      workspace_id: (ws as { workspace_id: string }).workspace_id,
      user_id: context.userId,
      provider: "apple",
      account_email: data.account_email,
      display_name: data.display_name ?? "Apple Calendar",
      ics_url: data.ics_url,
      sync_direction: "inbound",
      status: "connected",
      enabled: true,
    }).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const setActiveCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { accountId: string; calendarId: string; displayName?: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("calendar_accounts")
      .update({ calendar_id: data.calendarId, display_name: data.displayName ?? null })
      .eq("id", data.accountId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleCalendarAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { accountId: string; enabled?: boolean; sync_direction?: "inbound" | "outbound" | "bidirectional" }) => data)
  .handler(async ({ data, context }) => {
    const update: { enabled?: boolean; sync_direction?: string } = {};
    if (data.enabled !== undefined) update.enabled = data.enabled;
    if (data.sync_direction) update.sync_direction = data.sync_direction;
    const { error } = await context.supabase
      .from("calendar_accounts")
      .update(update)
      .eq("id", data.accountId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listExternalCalendars = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { accountId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { providerForKind, contextFor } = await import("@/lib/booking/providers/index.server");
    const { data: acc } = await supabaseAdmin
      .from("calendar_accounts")
      .select("*")
      .eq("id", data.accountId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!acc) throw new Error("Account not found");
    const provider = providerForKind((acc as { provider: string }).provider);
    return provider.listCalendars(contextFor(acc as Parameters<typeof contextFor>[0]));
  });

export const disconnectCalendarAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { accountId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: acc } = await supabaseAdmin
      .from("calendar_accounts")
      .select("id,provider,connection_key_ciphertext")
      .eq("id", data.accountId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!acc) return { ok: true };
    const row = acc as { id: string; provider: string; connection_key_ciphertext: string | null };
    if (row.connection_key_ciphertext && (row.provider === "google" || row.provider === "microsoft")) {
      try {
        const { decryptConnectionKey } = await import("@/lib/booking/providers/crypto.server");
        const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
        const key = decryptConnectionKey(row.connection_key_ciphertext);
        const cid = row.provider === "google" ? "google_calendar" : "microsoft_outlook";
        await disconnectAppUser(GATEWAY, key, cid);
      } catch { /* best effort */ }
    }
    await supabaseAdmin.from("calendar_accounts").delete().eq("id", row.id);
    return { ok: true };
  });

/** Trigger inbound sync (busy-time fetch) for one host. */
export const syncCalendarAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { horizonDays?: number }) => data)
  .handler(async ({ data, context }) => {
    const { fetchHostBusyBlocks } = await import("@/lib/booking/calendar-sync-engine.server");
    const from = new Date();
    const to = new Date(from.getTime() + (data.horizonDays ?? 60) * 86400_000);
    const blocks = await fetchHostBusyBlocks(context.userId, from.toISOString(), to.toISOString());
    return { count: blocks.length };
  });
