/** Product first-run bootstrap. All privileged functions require both an
 * uncompleted platform and a valid server-signed setup session cookie. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

const SETUP_FLAG_KEY = "setup_complete";
const MIN_SETUP_SECRET_LENGTH = 24;

export type SetupCheck = {
  id: string;
  label: string;
  status: "ready" | "missing" | "error" | "optional";
  detail: string;
  required: boolean;
};

export type SetupEnvironmentReport = {
  ready: boolean;
  required: SetupCheck[];
  optional: SetupCheck[];
  checked_at: string;
};

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
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
    superAdminExists: (roleRows?.length ?? 0) > 0,
    setupComplete: value?.complete === true,
    completedAt: value?.completed_at ?? setting?.updated_at ?? null,
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
  const { getConfiguredSetupSecret, hasValidSetupSession } = await import("./setup-security.server");
  const secret = getConfiguredSetupSecret();
  if (!secret) throw httpError("SETUP_SECRET is missing or too short on the server.", 503);
  if (!hasValidSetupSession(secret)) throw httpError("Setup authorization is required.", 401);
  return state;
}

export const getSetupStatus = createServerFn({ method: "GET" }).handler(async () => {
  const state = await readSetupStatus();
  const { getConfiguredSetupSecret, hasValidSetupSession } = await import("./setup-security.server");
  const secret = getConfiguredSetupSecret();
  return {
    ...state,
    setupSecretConfigured: secret !== null,
    authorized: !state.setupComplete && secret !== null && hasValidSetupSession(secret),
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

    const admin = await adminClient();
    const keyHash = security.setupRequestFingerprint();
    const { data: retry, error: retryError } = await (admin.rpc as any)("setup_rate_limit_status", {
      _key_hash: keyHash,
    });
    if (retryError) throw httpError("Setup security storage is unavailable.", 503);
    if (Number(retry ?? 0) > 0) {
      throw httpError(`Too many failed attempts. Try again in ${Number(retry)} seconds.`, 429);
    }

    if (!security.matchesSetupSecret(data.secret, expected)) {
      const { data: lockedFor } = await (admin.rpc as any)("record_setup_secret_failure", {
        _key_hash: keyHash,
      });
      const suffix = Number(lockedFor ?? 0) > 0 ? " Too many attempts; access is temporarily locked." : "";
      throw httpError(`Setup Secret is incorrect.${suffix}`, 401);
    }

    await (admin.rpc as any)("clear_setup_secret_failures", { _key_hash: keyHash });
    security.issueSetupSession(expected);
    return { ok: true };
  });

function envCheck(name: string, label: string, required: boolean): SetupCheck {
  const configured = Boolean(process.env[name]?.trim());
  return {
    id: `env.${name}`,
    label,
    status: configured ? "ready" : required ? "missing" : "optional",
    detail: configured ? "Configured" : required ? `${name} is required` : "Not configured — optional",
    required,
  };
}

async function operationalCheck(id: string, label: string, run: () => Promise<void>): Promise<SetupCheck> {
  try {
    await run();
    return { id, label, status: "ready", detail: "Ready", required: true };
  } catch (error) {
    return { id, label, status: "error", detail: (error as Error).message, required: true };
  }
}

async function buildEnvironmentReport(): Promise<SetupEnvironmentReport> {
  const required = [
    envCheck("DATABASE_URL", "Database connection", true),
    envCheck("SUPABASE_URL", "Backend URL", true),
    envCheck("SUPABASE_PUBLISHABLE_KEY", "Backend publishable key", true),
    envCheck("SUPABASE_SERVICE_ROLE_KEY", "Server database credential", true),
    envCheck("VITE_SUPABASE_URL", "Public backend URL", true),
    envCheck("VITE_SUPABASE_PUBLISHABLE_KEY", "Public backend key", true),
    envCheck("APP_ORIGIN", "Application origin", true),
    envCheck("SESSION_SECRET", "Application session secret", true),
    {
      id: "env.SETUP_SECRET",
      label: "First setup secret",
      status: (process.env.SETUP_SECRET?.trim().length ?? 0) >= MIN_SETUP_SECRET_LENGTH ? "ready" : "missing",
      detail:
        (process.env.SETUP_SECRET?.trim().length ?? 0) >= MIN_SETUP_SECRET_LENGTH
          ? "Configured"
          : `SETUP_SECRET must contain at least ${MIN_SETUP_SECRET_LENGTH} characters`,
      required: true,
    } satisfies SetupCheck,
  ];

  const admin = await adminClient();
  const coreTables = ["settings", "user_roles", "profiles", "organizations", "workspaces", "workspace_members"];
  required.push(
    await operationalCheck("service.database", "Core database schema", async () => {
      for (const table of coreTables) {
        const { error } = await (admin as any).from(table).select("*", { head: true, count: "exact" }).limit(1);
        if (error) throw new Error(`${table}: ${error.message}`);
      }
    }),
    await operationalCheck("service.auth", "Authentication service", async () => {
      const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (error) throw error;
    }),
    await operationalCheck("service.storage", "Storage service", async () => {
      const { error } = await admin.storage.listBuckets();
      if (error) throw error;
    }),
  );

  const optional = [
    envCheck("LOVABLE_API_KEY", "Lovable AI Gateway", false),
    envCheck("OPENAI_API_KEY", "OpenAI", false),
    envCheck("ANTHROPIC_API_KEY", "Anthropic", false),
    envCheck("GEMINI_API_KEY", "Google Gemini", false),
    envCheck("WHATSAPP_ACCESS_TOKEN", "WhatsApp access token", false),
    envCheck("WHATSAPP_VERIFY_TOKEN", "WhatsApp verify token", false),
    envCheck("STRIPE_SECRET_KEY", "Stripe", false),
    envCheck("SMTP_HOST", "SMTP", false),
    envCheck("ZALO_OA_ACCESS_TOKEN", "Zalo OA", false),
  ];

  return {
    ready: required.every((check) => check.status === "ready"),
    required,
    optional,
    checked_at: new Date().toISOString(),
  };
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
  return ["LOVABLE_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"].some(
    (name) => Boolean(process.env[name]?.trim()),
  );
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
    if (createError || !created.user) throw new Error(createError?.message ?? "Unable to create administrator.");

    const { data: claimed, error: claimError } = await (admin.rpc as any)("claim_product_setup_superadmin", {
      _user_id: created.user.id,
    });
    if (claimError || claimed !== true) {
      await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
      throw httpError(claimError?.message ?? "Another setup session already created the Super Admin.", 409);
    }

    if (!hasConfiguredAISecret()) {
      const { data: memberships } = await admin
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", created.user.id);
      const workspaceIds = (memberships ?? []).map((row) => row.workspace_id);
      if (workspaceIds.length > 0) {
        await admin.from("ai_providers").update({ enabled: false }).in("workspace_id", workspaceIds);
      }
    }

    return { ok: true, user_id: created.user.id };
  });

async function setPlatformSetting(key: string, value: Record<string, unknown>) {
  const admin = await adminClient();
  const { error } = await (admin.rpc as any)("set_product_setup_setting", {
    _key: key,
    _value: value as Json,
  });
  if (error) throw new Error(error.message);
}

const identitySchema = z.object({
  app_name: z.string().trim().min(1).max(80),
  tagline: z.string().trim().max(200).nullable().optional(),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/u).nullable().optional(),
  logo_url: z.string().url().max(2048).nullable().optional(),
  favicon_url: z.string().url().max(2048).nullable().optional(),
});

export const saveSetupIdentity = createServerFn({ method: "POST" })
  .validator((input: unknown) => identitySchema.parse(input))
  .handler(async ({ data }) => {
    await assertSetupAuthorized();
    await setPlatformSetting("branding", {
      app_name: data.app_name,
      tagline: data.tagline ?? null,
      primary_color: data.primary_color ?? null,
      logo_url: data.logo_url ?? null,
      favicon_url: data.favicon_url ?? null,
    });
    return { ok: true };
  });

const defaultsSchema = z.object({
  language: z.string().trim().min(2).max(10),
  timezone: z.string().trim().min(1).max(80),
  currency: z.string().trim().length(3),
  date_format: z.enum(["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"]),
});

export const saveSetupDefaults = createServerFn({ method: "POST" })
  .validator((input: unknown) => defaultsSchema.parse(input))
  .handler(async ({ data }) => {
    await assertSetupAuthorized();
    await setPlatformSetting("localization", data);
    return { ok: true };
  });

const platformSchema = z.object({
  saas_enabled: z.boolean(),
  registration_enabled: z.boolean(),
  multi_tenant: z.boolean(),
  subscriptions_enabled: z.boolean(),
  default_plan: z.string().trim().max(40).nullable().optional(),
});

export const saveSetupPlatform = createServerFn({ method: "POST" })
  .validator((input: unknown) => platformSchema.parse(input))
  .handler(async ({ data }) => {
    await assertSetupAuthorized();
    await setPlatformSetting("authentication", { allow_signups: data.registration_enabled });
    await setPlatformSetting("billing", {
      saas_enabled: data.saas_enabled,
      subscriptions_enabled: data.subscriptions_enabled,
      default_plan: data.default_plan ?? null,
      multi_tenant: data.multi_tenant,
    });
    return { ok: true };
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
  const admin = await adminClient();
  const { data: completed, error } = await (admin.rpc as any)("complete_product_setup", {
    _completed_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  if (completed !== true) throw httpError("Product setup is already complete.", 423);
  const { clearSetupSession } = await import("./setup-security.server");
  clearSetupSession();
  return { ok: true };
});
