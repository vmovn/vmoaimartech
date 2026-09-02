/**
 * Application-side provisioning for a workspace-scoped platform Ollama row.
 * Does not edit SQL triggers. Fresh workspaces do not auto-seed a vendor AI
 * provider. Platform Local AI is provisioned here as a non-default utility row.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { logger } from "@/shared/lib/logger";
import {
  readActiveWorkspaceHeader,
  resolveCallerWorkspaceId,
  type AuthRpcClient,
} from "./workspace-auth";
import {
  PLATFORM_OLLAMA_PROVIDER_NAME,
  PLATFORM_UTILITY_FEATURES,
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

  const model = readOperatorOllamaUtilityModel();
  for (const feature of PLATFORM_UTILITY_FEATURES) {
    const { data: featureRow } = await supabaseAdmin
      .from("ai_feature_config")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("feature", feature)
      .maybeSingle();

    if (!featureRow) {
      const { error } = await supabaseAdmin
        .from("ai_feature_config")
        .insert({
          workspace_id: workspaceId,
          feature,
          provider_id: providerId,
          fallback_provider_ids: [],
          model,
          enabled: true,
          config: { purpose: "utility", execution_mode: "platform_local" },
        } as never);
      if (error) throw new Error(error.message);
    }
  }

  return { ok: true, providerId };
}

export type EnsurePlatformOllamaForUserResult = {
  attempted: number;
  provisioned: number;
  skipped?: string;
};

/**
 * Best-effort Platform Local AI for every workspace the user already owns.
 * First-login `ensureMyOrganization` creates the workspace in SQL; this is
 * the application-side follow-up. Never throws — signup/login must succeed
 * when Ollama is absent or provision fails.
 */
export async function ensurePlatformOllamaForUserWorkspaces(
  supabaseAdmin: AdminClient,
  userId: string,
): Promise<EnsurePlatformOllamaForUserResult> {
  try {
    const { data: memberships, error } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId);

    if (error) {
      logger.warn("ai.platform_ollama.provision_failed", { userId, reason: error.message });
      return { attempted: 0, provisioned: 0 };
    }

    const workspaceIds = [...new Set(
      ((memberships ?? []) as Array<{ workspace_id: string }>).map((row) => row.workspace_id),
    )];
    let provisioned = 0;
    let skipped: string | undefined;

    for (const workspaceId of workspaceIds) {
      try {
        const result = await ensurePlatformOllamaForWorkspace(supabaseAdmin, workspaceId);
        if (result.ok) provisioned += 1;
        else if (result.skipped) skipped = result.skipped;
      } catch (err) {
        logger.warn("ai.platform_ollama.provision_failed", {
          userId,
          workspaceId,
          reason: err instanceof Error ? err.message : "unknown",
        });
      }
    }

    if (skipped) {
      logger.info("ai.platform_ollama.skipped", { userId, skipped });
    }
    return { attempted: workspaceIds.length, provisioned, skipped };
  } catch (err) {
    logger.warn("ai.platform_ollama.provision_failed", {
      userId,
      reason: err instanceof Error ? err.message : "unknown",
    });
    return { attempted: 0, provisioned: 0 };
  }
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
