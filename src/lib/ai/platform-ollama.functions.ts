/**
 * Application-side provisioning for a workspace-scoped platform Ollama row.
 * Does not edit SQL triggers. Lovable remains the seeded workspace default.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  readActiveWorkspaceHeader,
  resolveCallerWorkspaceId,
  type AuthRpcClient,
} from "./workspace-auth";
import {
  PLATFORM_OLLAMA_PROVIDER_NAME,
  PLATFORM_UTILITY_FEATURE,
  isPlatformManagedProvider,
  platformManagedProviderConfig,
  readOperatorOllamaUtilityModel,
  tryResolveOllamaBaseUrlForProvision,
} from "./platform-ollama";

export type EnsurePlatformOllamaResult = {
  ok: boolean;
  providerId?: string;
  skipped?: string;
};

type AdminClient = typeof import("@/integrations/supabase/client.server").supabaseAdmin;

export async function ensurePlatformOllamaForWorkspace(
  supabaseAdmin: AdminClient,
  workspaceId: string,
): Promise<EnsurePlatformOllamaResult> {
  const baseUrl = tryResolveOllamaBaseUrlForProvision();
  if (!baseUrl) {
    return { ok: false, skipped: "ollama_url_not_configured" };
  }

  const config = platformManagedProviderConfig();
  const { data: existingRows, error: listError } = await supabaseAdmin
    .from("ai_providers")
    .select("id, config")
    .eq("workspace_id", workspaceId)
    .eq("kind", "ollama");

  if (listError) throw new Error(listError.message);

  const managed = ((existingRows ?? []) as Array<{ id: string; config: Record<string, unknown> | null }>)
    .find((row) => isPlatformManagedProvider(row.config));
  let providerId: string;

  if (managed) {
    const { error } = await supabaseAdmin
      .from("ai_providers")
      .update({
        base_url: baseUrl,
        api_key_secret_name: null,
        enabled: true,
        is_default: false,
        config,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", managed.id);
    if (error) throw new Error(error.message);
    providerId = managed.id;
  } else {
    const { data: inserted, error } = await supabaseAdmin
      .from("ai_providers")
      .insert({
        workspace_id: workspaceId,
        kind: "ollama",
        name: PLATFORM_OLLAMA_PROVIDER_NAME,
        base_url: baseUrl,
        api_key_secret_name: null,
        enabled: true,
        is_default: false,
        priority: 50,
        config,
      } as never)
      .select("id")
      .single();
    if (error || !inserted) {
      throw new Error(error?.message ?? "Unable to create platform Ollama provider");
    }
    providerId = (inserted as { id: string }).id;
  }

  const { data: featureRow } = await supabaseAdmin
    .from("ai_feature_config")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("feature", PLATFORM_UTILITY_FEATURE)
    .maybeSingle();

  if (!featureRow) {
    const model = readOperatorOllamaUtilityModel();
    const { error } = await supabaseAdmin
      .from("ai_feature_config")
      .insert({
        workspace_id: workspaceId,
        feature: PLATFORM_UTILITY_FEATURE,
        provider_id: providerId,
        fallback_provider_ids: [],
        model,
        enabled: true,
        config: { purpose: "utility" },
      } as never);
    if (error) throw new Error(error.message);
  }

  return { ok: true, providerId };
}

export const ensurePlatformOllamaProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<EnsurePlatformOllamaResult> => {
    await resolveCallerWorkspaceId({
      supabase: context.supabase as unknown as AuthRpcClient,
      userId: context.userId,
      requestedWorkspaceId: data.workspaceId,
      headerWorkspaceId: readActiveWorkspaceHeader(),
      requireAdmin: true,
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return ensurePlatformOllamaForWorkspace(supabaseAdmin, data.workspaceId);
  });
