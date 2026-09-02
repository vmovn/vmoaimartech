/**
 * Central credential seam for runChat / runEmbed / health / model sync.
 *
 * Sources (never mixed):
 * 1. workspace_encrypted — ai_provider_secrets ciphertext
 * 2. platform_env — process.env[api_key_secret_name]
 * 3. keyless — Ollama / LM Studio
 */
import type { AIProviderKind, AIProviderRecord, ProviderCredentials } from "./types";
import { AIError } from "./errors";
import { resolveCredentials } from "./registry.server";
import { isPlatformManagedProvider } from "./platform-ollama";
import { credentialLast4, decryptAiCredential, encryptAiCredential } from "./credential-crypto.server";
import { stripCredentialShapes } from "./log-privacy";

export const BYOK_PROVIDER_KINDS: AIProviderKind[] = [
  "gemini", "openai", "anthropic", "deepseek", "openrouter", "custom_openai",
];

export type CredentialSource = "workspace_encrypted" | "platform_env" | "keyless";

export type ProviderSecretMeta = {
  providerId: string;
  last4: string | null;
  updatedAt: string | null;
};

export type CredentialResolverDeps = {
  loadSecret?: (providerId: string) => Promise<{
    workspace_id: string;
    api_key_ciphertext: string;
  } | null>;
  decrypt?: typeof decryptAiCredential;
  env?: NodeJS.ProcessEnv;
};

export function isByokProviderKind(kind: AIProviderKind): boolean {
  return BYOK_PROVIDER_KINDS.includes(kind);
}

export function isKeylessProviderKind(kind: AIProviderKind): boolean {
  return kind === "ollama" || kind === "lmstudio";
}

export function decideCredentialSource(record: AIProviderRecord): CredentialSource {
  if (isKeylessProviderKind(record.kind)) return "keyless";
  const explicit = record.config?.credential_source;
  if (explicit === "workspace_encrypted" || explicit === "platform_env" || explicit === "keyless") {
    return explicit;
  }
  if (isPlatformManagedProvider(record.config)) return "platform_env";
  if (record.apiKeySecretName) return "platform_env";
  return "workspace_encrypted";
}

export function assertCredentialTenant(opts: {
  providerWorkspaceId: string;
  executionWorkspaceId: string;
  secretWorkspaceId?: string | null;
}): void {
  if (opts.providerWorkspaceId !== opts.executionWorkspaceId) {
    throw new AIError("auth", "AI provider does not belong to this workspace");
  }
  if (opts.secretWorkspaceId && opts.secretWorkspaceId !== opts.providerWorkspaceId) {
    throw new AIError("auth", "AI credential does not belong to this provider workspace");
  }
}

async function defaultLoadSecret(providerId: string): Promise<{
  workspace_id: string;
  api_key_ciphertext: string;
} | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("ai_provider_secrets" as never)
    .select("workspace_id, api_key_ciphertext")
    .eq("provider_id", providerId)
    .maybeSingle();
  return (data as { workspace_id: string; api_key_ciphertext: string } | null) ?? null;
}

export async function resolveProviderCredentials(
  record: AIProviderRecord,
  executionWorkspaceId: string,
  deps: CredentialResolverDeps = {},
): Promise<ProviderCredentials> {
  assertCredentialTenant({
    providerWorkspaceId: record.workspaceId,
    executionWorkspaceId,
  });

  const source = decideCredentialSource(record);
  const env = deps.env ?? process.env;

  if (source === "keyless") {
    return resolveCredentials(record);
  }

  if (source === "platform_env") {
    return resolveCredentials(record);
  }

  const loadSecret = deps.loadSecret ?? defaultLoadSecret;
  const secret = await loadSecret(record.id);
  if (!secret?.api_key_ciphertext) {
    throw new AIError("auth", `No API key saved for provider "${record.name}".`);
  }
  assertCredentialTenant({
    providerWorkspaceId: record.workspaceId,
    executionWorkspaceId,
    secretWorkspaceId: secret.workspace_id,
  });
  const decrypt = deps.decrypt ?? decryptAiCredential;
  const apiKey = decrypt(secret.api_key_ciphertext, env);
  return {
    apiKey,
    baseUrl: record.baseUrl ?? undefined,
    organizationId: record.organizationId ?? undefined,
    config: record.config,
    extraHeaders: (record.config?.extra_headers as Record<string, string>) ?? undefined,
  };
}

export function credentialsFromPlaintext(
  record: Pick<AIProviderRecord, "kind" | "name" | "baseUrl" | "organizationId" | "config">,
  apiKey: string,
): ProviderCredentials {
  if (isKeylessProviderKind(record.kind)) {
    return resolveCredentials({
      id: "ephemeral",
      workspaceId: "",
      kind: record.kind,
      name: record.name,
      baseUrl: record.baseUrl,
      apiKeySecretName: null,
      organizationId: record.organizationId,
      enabled: true,
      isDefault: false,
      priority: 100,
      config: record.config ?? {},
    });
  }
  const key = apiKey.trim();
  if (!key) throw new AIError("validation", "API key is required");
  return {
    apiKey: key,
    baseUrl: record.baseUrl ?? undefined,
    organizationId: record.organizationId ?? undefined,
    config: record.config,
    extraHeaders: (record.config?.extra_headers as Record<string, string>) ?? undefined,
  };
}

export async function upsertWorkspaceProviderSecret(opts: {
  providerId: string;
  workspaceId: string;
  plaintext: string;
  updatedBy: string | null;
}): Promise<{ last4: string }> {
  const plaintext = opts.plaintext.trim();
  if (!plaintext) throw new AIError("validation", "API key is required");
  const ciphertext = encryptAiCredential(plaintext);
  const last4 = credentialLast4(plaintext);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("ai_provider_secrets" as never).upsert({
    provider_id: opts.providerId,
    workspace_id: opts.workspaceId,
    api_key_ciphertext: ciphertext,
    api_key_last4: last4,
    updated_at: now,
    updated_by: opts.updatedBy,
  } as never, { onConflict: "provider_id" });
  if (error) throw new AIError("server", "Unable to store provider credential");
  return { last4 };
}

export async function deleteWorkspaceProviderSecret(providerId: string, workspaceId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("ai_provider_secrets" as never)
    .delete()
    .eq("provider_id", providerId)
    .eq("workspace_id", workspaceId);
  if (error) throw new AIError("server", "Unable to remove provider credential");
}

export async function loadProviderSecretMeta(
  providerIds: string[],
): Promise<Map<string, ProviderSecretMeta>> {
  const map = new Map<string, ProviderSecretMeta>();
  if (providerIds.length === 0) return map;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("ai_provider_secrets" as never)
    .select("provider_id, api_key_last4, updated_at")
    .in("provider_id", providerIds);
  for (const row of (data ?? []) as Array<{
    provider_id: string;
    api_key_last4: string | null;
    updated_at: string | null;
  }>) {
    map.set(row.provider_id, {
      providerId: row.provider_id,
      last4: row.api_key_last4,
      updatedAt: row.updated_at,
    });
  }
  return map;
}

export async function writeProviderCredentialAudit(opts: {
  workspaceId: string;
  actorId: string;
  action: "provider.credential_added" | "provider.credential_rotated" | "provider.credential_removed";
  providerId: string;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("ai_audit_logs" as never).insert({
      workspace_id: opts.workspaceId,
      actor_id: opts.actorId,
      action: opts.action,
      target: opts.providerId,
      changes: {},
    } as never);
  } catch {
    // audit must never block credential writes
  }
}

export function safeProviderErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return stripCredentialShapes(raw);
}

export function withWorkspaceEncryptedSource(
  config: Record<string, unknown>,
): Record<string, unknown> {
  return { ...config, credential_source: "workspace_encrypted" };
}
