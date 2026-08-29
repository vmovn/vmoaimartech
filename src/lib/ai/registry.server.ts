/**
 * Provider Manager — the single map from kind → adapter implementation.
 * Adding a new provider means adding an entry here.
 */

import type { AIProvider, AIProviderKind, AIProviderRecord, ProviderCredentials } from "./types";
import { createOpenAICompatProvider } from "./providers/openai-compat.server";
import { anthropicProvider } from "./providers/anthropic.server";
import { geminiProvider } from "./providers/gemini.server";
import { AIError } from "./errors";

const openai = createOpenAICompatProvider({
  kind: "openai", defaultBaseUrl: "https://api.openai.com/v1", supportsEmbeddings: true,
});
const lovable = createOpenAICompatProvider({
  kind: "lovable", defaultBaseUrl: "https://ai.gateway.lovable.dev/v1", supportsEmbeddings: true,
});
const deepseek = createOpenAICompatProvider({
  kind: "deepseek", defaultBaseUrl: "https://api.deepseek.com/v1",
});
const grok = createOpenAICompatProvider({
  kind: "grok", defaultBaseUrl: "https://api.x.ai/v1",
});
const openrouter = createOpenAICompatProvider({
  kind: "openrouter", defaultBaseUrl: "https://openrouter.ai/api/v1",
});
const ollama = createOpenAICompatProvider({
  kind: "ollama", defaultBaseUrl: "http://localhost:11434/v1", supportsEmbeddings: true,
});
const lmstudio = createOpenAICompatProvider({
  kind: "lmstudio", defaultBaseUrl: "http://localhost:1234/v1",
});
const customOpenai = createOpenAICompatProvider({
  kind: "custom_openai", defaultBaseUrl: "", supportsEmbeddings: true,
});

const REGISTRY: Record<AIProviderKind, AIProvider> = {
  lovable,
  openai,
  gemini: geminiProvider,
  anthropic: anthropicProvider,
  deepseek,
  grok,
  openrouter,
  ollama,
  lmstudio,
  custom_openai: customOpenai,
};

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
  // For the built-in Lovable AI Gateway, fall back to the auto-provisioned
  // LOVABLE_API_KEY when the workspace hasn't wired a custom secret.
  const explicitKey = record.apiKeySecretName ? process.env[record.apiKeySecretName] : undefined;
  const apiKey = explicitKey ?? (record.kind === "lovable" ? process.env.LOVABLE_API_KEY : undefined);
  const requiresKey = record.kind !== "ollama" && record.kind !== "lmstudio";
  if (requiresKey && !apiKey) {
    throw new AIError("auth", `Missing API key for provider "${record.name}" (${record.kind}). Configure the secret named ${record.apiKeySecretName ?? "<none>"} in workspace settings.`);
  }
  return {
    apiKey,
    baseUrl: record.baseUrl ?? undefined,
    organizationId: record.organizationId ?? undefined,
    config: record.config,
    extraHeaders: (record.config?.extra_headers as Record<string, string>) ?? undefined,
  };
}
