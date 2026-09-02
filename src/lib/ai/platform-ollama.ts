/**
 * Platform-managed Ollama — shared Coolify utility compute, workspace-scoped rows.
 *
 * Not a second provider table. Each workspace keeps its own ai_providers row
 * (kind=ollama) that may point at the same operator-controlled internal URL.
 * Customer-facing BYOK features are not routed here.
 */

import { AIError } from "./errors";

export const LOCAL_OLLAMA_BASE_URL = "http://localhost:11434/v1";
export const PLATFORM_OLLAMA_PROVIDER_NAME = "Platform Local AI";
export const PLATFORM_MANAGED_BY = "platform";
export const PLATFORM_PURPOSE_UTILITY = "utility";
export const PLATFORM_UTILITY_FEATURE = "conversation_intelligence";
export const PLATFORM_OLLAMA_RATE_LIMIT_PER_MIN = 20;
export const DEFAULT_AI_RATE_LIMIT_PER_MIN = 120;

export type OllamaEnv = {
  NODE_ENV?: string;
  OLLAMA_BASE_URL?: string;
  OLLAMA_UTILITY_MODEL?: string;
};

export function isProductionRuntime(env: OllamaEnv = process.env): boolean {
  return (env.NODE_ENV ?? process.env.NODE_ENV) === "production";
}

export function isLoopbackOllamaUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(raw);
  }
}

export function readOperatorOllamaBaseUrl(env: OllamaEnv = process.env): string | null {
  const value = (env.OLLAMA_BASE_URL ?? process.env.OLLAMA_BASE_URL)?.trim();
  return value || null;
}

export function readOperatorOllamaUtilityModel(env: OllamaEnv = process.env): string | null {
  const value = (env.OLLAMA_UTILITY_MODEL ?? process.env.OLLAMA_UTILITY_MODEL)?.trim();
  return value || null;
}

export function isPlatformManagedProvider(
  config: Record<string, unknown> | null | undefined,
): boolean {
  return config?.managed_by === PLATFORM_MANAGED_BY;
}

export function isPlatformManagedOllama(record: {
  kind: string;
  config?: Record<string, unknown> | null;
}): boolean {
  return record.kind === "ollama" && isPlatformManagedProvider(record.config);
}

export function platformManagedProviderConfig(
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...extra,
    managed_by: PLATFORM_MANAGED_BY,
    purpose: PLATFORM_PURPOSE_UTILITY,
  };
}

export function stripWorkspaceManagedMarker(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...config };
  delete next.managed_by;
  return next;
}

export function preservePlatformManagedConfig(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...existing,
    ...incoming,
    managed_by: PLATFORM_MANAGED_BY,
    purpose: existing.purpose ?? PLATFORM_PURPOSE_UTILITY,
  };
}

/**
 * Execution-time Ollama URL.
 * Platform-managed rows prefer OLLAMA_BASE_URL so the operator can rotate the
 * Coolify hostname without rewriting every workspace row.
 * Unmanaged rows use the stored base_url only (no silent env overlay).
 * Production never falls back to localhost.
 */
export function resolveOllamaBaseUrl(opts: {
  recordBaseUrl?: string | null;
  config?: Record<string, unknown> | null;
  env?: OllamaEnv;
}): string {
  const env = opts.env ?? process.env;
  const production = isProductionRuntime(env);
  const operator = readOperatorOllamaBaseUrl(env);
  const row = opts.recordBaseUrl?.trim() || null;
  const platformManaged = isPlatformManagedProvider(opts.config);

  const candidate = platformManaged
    ? (operator || row || (production ? null : LOCAL_OLLAMA_BASE_URL))
    : (row || (production ? null : LOCAL_OLLAMA_BASE_URL));

  if (!candidate) {
    throw new AIError(
      "validation",
      "Ollama base URL is not configured. Set OLLAMA_BASE_URL to the internal service URL.",
    );
  }
  if (production && isLoopbackOllamaUrl(candidate)) {
    throw new AIError(
      "validation",
      "Production Ollama must not use localhost. Set OLLAMA_BASE_URL to the internal service URL.",
    );
  }
  return candidate.replace(/\/+$/, "");
}

/** Provisioning helper: null when production has no operator URL. */
export function tryResolveOllamaBaseUrlForProvision(env: OllamaEnv = process.env): string | null {
  try {
    return resolveOllamaBaseUrl({
      env,
      config: platformManagedProviderConfig(),
    });
  } catch {
    return null;
  }
}

export function platformOllamaRateLimitPerMin(provider: {
  kind: string;
  config?: Record<string, unknown> | null;
}): number {
  return isPlatformManagedOllama(provider)
    ? PLATFORM_OLLAMA_RATE_LIMIT_PER_MIN
    : DEFAULT_AI_RATE_LIMIT_PER_MIN;
}
