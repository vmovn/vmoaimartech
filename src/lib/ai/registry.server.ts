/**
 * Provider Manager — the single map from kind → adapter implementation.
 * Adding a new provider means adding an entry here.
 *
 * `lovable` and `grok` remain inert DB/type compatibility values. They are
 * not executable and must not appear in create-provider catalogs.
 */

import type { AIProvider, AIProviderKind, AIProviderRecord, ProviderCredentials } from "./types";
import { createOpenAICompatProvider } from "./providers/openai-compat.server";
import { anthropicProvider } from "./providers/anthropic.server";
import { geminiProvider } from "./providers/gemini.server";
import { AIError } from "./errors";
import { resolveOllamaBaseUrl } from "./platform-ollama";

const openai = createOpenAICompatProvider({
  kind: "openai", defaultBaseUrl: "https://api.openai.com/v1", supportsEmbeddings: true,
});
const deepseek = createOpenAICompatProvider({
  kind: "deepseek", defaultBaseUrl: "https://api.deepseek.com/v1",
});
const openrouter = createOpenAICompatProvider({
  kind: "openrouter", defaultBaseUrl: "https://openrouter.ai/api/v1",
});
const ollama = createOpenAICompatProvider({
  kind: "ollama", defaultBaseUrl: "", supportsEmbeddings: true,
});
const lmstudio = createOpenAICompatProvider({
  kind: "lmstudio", defaultBaseUrl: "http://localhost:1234/v1",
});
const customOpenai = createOpenAICompatProvider({
  kind: "custom_openai", defaultBaseUrl: "", supportsEmbeddings: true,
});

const REGISTRY: Partial<Record<AIProviderKind, AIProvider>> = {
  openai,
  gemini: geminiProvider,
  anthropic: anthropicProvider,
  deepseek,
  openrouter,
  ollama,
  lmstudio,
  custom_openai: customOpenai,
};

export const RETIRED_AI_PROVIDER_KINDS: readonly AIProviderKind[] = ["lovable", "grok"];

export function isActiveAiProviderKind(kind: string): kind is AIProviderKind {
  return Object.prototype.hasOwnProperty.call(REGISTRY, kind);
}

export function getAIProvider(kind: AIProviderKind): AIProvider {
  const p = REGISTRY[kind];
  if (!p) throw new AIError("not_found", `Provider not implemented: ${kind}`);
  return p;
}

export function listProviderKinds(): AIProviderKind[] {
  return Object.keys(REGISTRY) as AIProviderKind[];
}

/** Resolve stored credentials (secret-name → env var) for a provider row. */
export function resolveCredentials(record: AIProviderRecord): ProviderCredentials {
  const apiKey = record.apiKeySecretName ? process.env[record.apiKeySecretName] : undefined;
  const requiresKey = record.kind !== "ollama" && record.kind !== "lmstudio";
  if (requiresKey && !apiKey) {
    throw new AIError("auth", `Missing API key for provider "${record.name}" (${record.kind}). Configure the secret named ${record.apiKeySecretName ?? "<none>"} in workspace settings.`);
  }
  const baseUrl = record.kind === "ollama"
    ? resolveOllamaBaseUrl({ recordBaseUrl: record.baseUrl, config: record.config })
    : (record.baseUrl ?? undefined);
  return {
    apiKey,
    baseUrl,
    organizationId: record.organizationId ?? undefined,
    config: record.config,
    extraHeaders: (record.config?.extra_headers as Record<string, string>) ?? undefined,
  };
}
