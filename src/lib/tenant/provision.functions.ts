import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logger } from "@/shared/lib/logger";

/** Repairs and returns the signed-in user's first usable organization. */
export const ensureMyOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userResult, error: userError } = await supabaseAdmin.auth.admin.getUserById(
      context.userId,
    );
    if (userError) throw new Error(userError.message);

    const { data: organizationId, error } = await supabaseAdmin.rpc(
      "ensure_personal_organization",
      { _user_id: context.userId, _email: userResult.user?.email ?? undefined },
    );
    if (error) throw new Error(error.message);
    if (!organizationId) throw new Error("Could not prepare your organization");

    try {
      const { ensurePlatformOllamaForUserWorkspaces } = await import(
        "@/lib/ai/platform-ollama.functions"
      );
      await ensurePlatformOllamaForUserWorkspaces(supabaseAdmin, context.userId);
    } catch (provisionError) {
      logger.warn("ai.platform_ollama.provision_failed", {
        userId: context.userId,
        reason: provisionError instanceof Error ? provisionError.message : "unknown",
      });
    }

    return { organizationId };
  });
