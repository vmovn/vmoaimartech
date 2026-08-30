/** Product first-run bootstrap. All privileged functions require both an
 * uncompleted platform and a valid server-signed setup session cookie. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { ENVIRONMENT_VARIABLES } from "@/lib/environment/environment-catalog";
import type { EnvironmentReadinessReport } from "./environment-readiness.server";

const SETUP_FLAG_KEY = "setup_complete";

export type SetupEnvironmentReport = EnvironmentReadinessReport;

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type SetupRpcResult = { data: unknown; error: { message: string } | null };

async function setupRpc(name: string, args: Record<string, unknown>): Promise<SetupRpcResult> {
  const admin = await adminClient();
  const rpc = admin.rpc as unknown as (
    functionName: string,
    functionArgs: Record<string, unknown>,
  ) => PromiseLike<SetupRpcResult>;
  return rpc(name, args);
}

async function readSetupStatus() {
  const admin = await adminClient();
  const [{ data: roleRows }, { data: settingRows }] = await Promise.all([
    admin.from("user_roles").select("user_id").eq("role", "superadmin").limit(1),
    admin
      .from("settings")
      .select("value, updated_at, created_at")
      .eq("scope", "platform")
      .eq("key", SETUP_FLAG_KEY)
      .order("created_at", { ascending: true })
      .limit(1),
  ]);
  const setting = settingRows?.[0];
  const value = (setting?.value ?? null) as { complete?: boolean; completed_at?: string } | null;
  return {
    superAdminUserId: roleRows?.[0]?.user_id ?? null,
    superAdminExists: (roleRows?.length ?? 0) > 0,
    setupComplete: value?.complete === true,
    completedAt: value?.completed_at ?? setting?.updated_at ?? null,
  };
}

async function readSetupDraft(superAdminUserId: string | null) {
  if (!superAdminUserId) return null;
  const admin = await adminClient();
  const [userResult, profileResult, membershipResult, settingsResult] = await Promise.all([
    admin.auth.admin.getUserById(superAdminUserId),
    admin.from("profiles").select("display_name").eq("id", superAdminUserId).maybeSingle(),
    admin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", superAdminUserId)
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin
      .from("settings")
      .select("key, value")
      .eq("scope", "platform")
      .in("key", ["branding", "localization"]),
  ]);

  const organizationId = membershipResult.data?.organization_id ?? null;
  const [organizationResult, workspaceResult] = organizationId
    ? await Promise.all([
        admin.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
        admin
          .from("workspaces")
          .select("name")
          .eq("organization_id", organizationId)
          .eq("owner_id", superAdminUserId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ])
    : [{ data: null }, { data: null }];
  const setting = new Map(
    (settingsResult.data ?? []).map((row) => [row.key, row.value as Record<string, unknown>]),
  );
  const branding = setting.get("branding") ?? {};
  const localization = setting.get("localization") ?? {};

  return {
    owner: {
      fullName: profileResult.data?.display_name ?? "",
      email: userResult.data.user?.email ?? "",
    },
    business: {
      businessName: organizationResult.data?.name ?? "",
      workspaceName: workspaceResult.data?.name ?? "",
      appName: typeof branding.app_name === "string" ? branding.app_name : "",
      language: typeof localization.language === "string" ? localization.language : "",
      timezone: typeof localization.timezone === "string" ? localization.timezone : "",
      currency: typeof localization.currency === "string" ? localization.currency : "",
      dateFormat: typeof localization.date_format === "string" ? localization.date_format : "",
    },
  };
}

function httpError(message: string, status: number) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

async function assertSetupAuthorized() {
  const state = await readSetupStatus();
  if (state.setupComplete) throw httpError("Product setup is permanently locked.", 423);
  const { getConfiguredSetupSecret, hasValidSetupSession } =
    await import("./setup-security.server");
  const secret = getConfiguredSetupSecret();
  if (!secret) throw httpError("SETUP_SECRET is missing or too short on the server.", 503);
  if (!hasValidSetupSession(secret)) throw httpError("Setup authorization is required.", 401);
  return state;
}

export const getSetupStatus = createServerFn({ method: "GET" }).handler(async () => {
  const state = await readSetupStatus();
  const { getConfiguredSetupSecret, hasValidSetupSession } =
    await import("./setup-security.server");
  const secret = getConfiguredSetupSecret();
  const authorized = !state.setupComplete && secret !== null && hasValidSetupSession(secret);
  return {
    superAdminExists: state.superAdminExists,
    setupComplete: state.setupComplete,
    completedAt: state.completedAt,
    setupSecretConfigured: secret !== null,
    authorized,
    draft: authorized ? await readSetupDraft(state.superAdminUserId) : null,
  };
});

export const authorizeSetup = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ secret: z.string().min(1).max(512) }).parse(input))
  .handler(async ({ data }) => {
    const state = await readSetupStatus();
    if (state.setupComplete) throw httpError("Product setup is permanently locked.", 423);
    const security = await import("./setup-security.server");
    const expected = security.getConfiguredSetupSecret();
    if (!expected) throw httpError("SETUP_SECRET is missing or too short on the server.", 503);

    const keyHash = security.setupRequestFingerprint();
    const { data: retry, error: retryError } = await setupRpc("setup_rate_limit_status", {
      _key_hash: keyHash,
    });
    if (retryError) throw httpError("Setup security storage is unavailable.", 503);
    if (Number(retry ?? 0) > 0) {
      throw httpError(`Too many failed attempts. Try again in ${Number(retry)} seconds.`, 429);
    }

    if (!security.matchesSetupSecret(data.secret, expected)) {
      const { data: lockedFor } = await setupRpc("record_setup_secret_failure", {
        _key_hash: keyHash,
      });
      const suffix =
        Number(lockedFor ?? 0) > 0 ? " Too many attempts; access is temporarily locked." : "";
      throw httpError(`Setup Secret is incorrect.${suffix}`, 401);
    }

    await setupRpc("clear_setup_secret_failures", { _key_hash: keyHash });
    security.issueSetupSession(expected);
    return { ok: true };
  });

async function buildEnvironmentReport(): Promise<SetupEnvironmentReport> {
  const admin = await adminClient();
  const { buildEnvironmentReadiness } = await import("./environment-readiness.server");
  return buildEnvironmentReadiness(admin);
}

export const validateSetupEnvironment = createServerFn({ method: "GET" }).handler(async () => {
  await assertSetupAuthorized();
  return buildEnvironmentReport();
});

const superAdminSchema = z.object({
  full_name: z.string().trim().min(1).max(160),
  email: z.string().email(),
  password: z
    .string()
    .min(12)
    .max(200)
    .regex(/[a-z]/u, "Password must include a lowercase letter.")
    .regex(/[A-Z]/u, "Password must include an uppercase letter.")
    .regex(/[0-9]/u, "Password must include a number.")
    .regex(/[^A-Za-z0-9]/u, "Password must include a symbol."),
});

function hasConfiguredAISecret() {
  return ENVIRONMENT_VARIABLES.filter(
    (item) => item.capability === "ai" && item.secret === "YES",
  ).some((item) => Boolean(process.env[item.key]?.trim()));
}

export const createSetupSuperAdmin = createServerFn({ method: "POST" })
  .validator((input: unknown) => superAdminSchema.parse(input))
  .handler(async ({ data }) => {
    const state = await assertSetupAuthorized();
    if (state.superAdminExists) throw httpError("A Platform Super Admin already exists.", 409);
    const admin = await adminClient();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, product_setup: true },
    });
    if (createError || !created.user)
      throw new Error(createError?.message ?? "Unable to create administrator.");

    const { data: claimed, error: claimError } = await setupRpc("claim_product_setup_superadmin", {
      _user_id: created.user.id,
    });
    if (claimError || claimed !== true) {
      await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
      throw httpError(
        claimError?.message ?? "Another setup session already created the Super Admin.",
        409,
      );
    }

    const { error: provisionError } = await admin.rpc("ensure_personal_organization", {
      _user_id: created.user.id,
      _email: data.email,
    });
    if (provisionError) {
      await admin
        .from("user_roles")
        .delete()
        .eq("user_id", created.user.id)
        .eq("role", "superadmin");
      await admin.rpc("prepare_platform_user_deletion", { _user_id: created.user.id });
      await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
      throw new Error(`Unable to provision the initial organization: ${provisionError.message}`);
    }

    if (!hasConfiguredAISecret()) {
      const { data: memberships } = await admin
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", created.user.id);
      const workspaceIds = (memberships ?? []).map((row) => row.workspace_id);
      if (workspaceIds.length > 0) {
        await admin
          .from("ai_providers")
          .update({ enabled: false })
          .in("workspace_id", workspaceIds);
      }
    }

    return { ok: true, user_id: created.user.id };
  });

async function setPlatformSetting(key: string, value: Record<string, unknown>) {
  const { error } = await setupRpc("set_product_setup_setting", {
    _key: key,
    _value: value as Json,
  });
  if (error) throw new Error(error.message);
}

const businessSchema = z.object({
  business_name: z.string().trim().min(1).max(120),
  workspace_name: z.string().trim().min(1).max(120),
  app_name: z.string().trim().min(1).max(80),
  language: z.string().trim().min(2).max(10),
  timezone: z.string().trim().min(1).max(80),
  currency: z.string().trim().length(3),
  date_format: z.enum(["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"]),
});

export const saveSetupBusiness = createServerFn({ method: "POST" })
  .validator((input: unknown) => businessSchema.parse(input))
  .handler(async ({ data }) => {
    const state = await assertSetupAuthorized();
    if (!state.superAdminUserId)
      throw new Error("Create the Platform Owner before saving business details.");
    const admin = await adminClient();
    const { data: organizationId, error: provisionError } = await admin.rpc(
      "ensure_personal_organization",
      {
        _user_id: state.superAdminUserId,
        _email: undefined,
      },
    );
    if (provisionError || !organizationId) {
      throw new Error(provisionError?.message ?? "Unable to prepare the initial organization.");
    }

    const { error: organizationError } = await admin
      .from("organizations")
      .update({ name: data.business_name })
      .eq("id", organizationId)
      .eq("owner_id", state.superAdminUserId);
    if (organizationError) throw new Error(organizationError.message);

    const { data: workspace, error: workspaceLookupError } = await admin
      .from("workspaces")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("owner_id", state.superAdminUserId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (workspaceLookupError || !workspace) {
      throw new Error(workspaceLookupError?.message ?? "Initial workspace was not provisioned.");
    }
    const { error: workspaceError } = await admin
      .from("workspaces")
      .update({ name: data.workspace_name })
      .eq("id", workspace.id)
      .eq("owner_id", state.superAdminUserId);
    if (workspaceError) throw new Error(workspaceError.message);

    await setPlatformSetting("branding", { app_name: data.app_name });
    await setPlatformSetting("localization", {
      language: data.language,
      timezone: data.timezone,
      currency: data.currency,
      date_format: data.date_format,
    });
    return {
      ok: true,
      businessName: data.business_name,
      workspaceName: data.workspace_name,
      appName: data.app_name,
    };
  });

async function disableUnconfiguredAI() {
  if (hasConfiguredAISecret()) return;
  const admin = await adminClient();
  const { data: rows } = await admin
    .from("settings")
    .select("value")
    .eq("scope", "platform")
    .eq("key", "feature_flags")
    .order("created_at", { ascending: true });
  const merged = (rows ?? []).reduce<Record<string, unknown>>(
    (result, row) => ({ ...result, ...((row.value ?? {}) as Record<string, unknown>) }),
    {},
  );
  await setPlatformSetting("feature_flags", { ...merged, ai_assistant: false, kb_rag: false });
}

export const completeSetup = createServerFn({ method: "POST" }).handler(async () => {
  const state = await assertSetupAuthorized();
  if (!state.superAdminExists) throw new Error("Platform Super Admin is required.");
  const environment = await buildEnvironmentReport();
  if (!environment.ready) throw new Error("Critical environment checks are not ready.");
  await disableUnconfiguredAI();
  const { data: completed, error } = await setupRpc("complete_product_setup", {
    _completed_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  if (completed !== true) throw httpError("Product setup is already complete.", 423);
  const { clearSetupSession } = await import("./setup-security.server");
  clearSetupSession();
  return { ok: true };
});
