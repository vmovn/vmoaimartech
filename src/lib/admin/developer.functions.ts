import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["superadmin", "support"])
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export const getDeveloperOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const [keys, secrets, events] = await Promise.all([
      supabase
        .from("api_keys")
        .select("id, name, prefix, organization_id, scopes, last_used_at, expires_at, revoked_at, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("webhook_signing_secrets")
        .select("id, workspace_id, secret_prefix, is_primary, activated_at, retired_at, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("webhook_events")
        .select("id, provider, event_type, signature_valid, processed, attempts, last_error, received_at")
        .order("received_at", { ascending: false })
        .limit(100),
    ]);

    const activeKeys = (keys.data ?? []).filter(
      (k: any) => !k.revoked_at && (!k.expires_at || new Date(k.expires_at) > new Date()),
    ).length;
    const failedWebhooks = (events.data ?? []).filter((e: any) => !e.processed && e.attempts > 0).length;
    const invalidSignatures = (events.data ?? []).filter((e: any) => e.signature_valid === false).length;

    return {
      stats: {
        totalKeys: keys.data?.length ?? 0,
        activeKeys,
        signingSecrets: secrets.data?.length ?? 0,
        recentEvents: events.data?.length ?? 0,
        failedWebhooks,
        invalidSignatures,
      },
      apiKeys: keys.data ?? [],
      signingSecrets: secrets.data ?? [],
      webhookEvents: events.data ?? [],
    };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const retryWebhookEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("webhook_events")
      .update({
        processed: false,
        next_attempt_at: new Date().toISOString(),
        last_error: null,
        locked_at: null,
        locked_by: null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
