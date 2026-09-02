/**
 * Feature-config routing policy used by runChat.
 * Not a second router: merges an already-loaded ai_feature_config row
 * (workspace_id + feature) with explicit caller overrides.
 */

import type { AIFeatureConfig, AIMessage, ChatRequest } from "./types";
import { AIError } from "./errors";
import { renderTemplate } from "./prompts";

function nonempty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function hasSystemMessage(messages: AIMessage[]): boolean {
  return messages.some((m) => m.role === "system");
}

export function assertFeatureEnabled(feature: string, cfg: AIFeatureConfig | null): void {
  if (cfg && !cfg.enabled) {
    throw new AIError("validation", `Feature ${feature} disabled`);
  }
}

export function resolveFeatureProviderChain(opts: {
  primaryProviderId?: string | null;
  fallbackProviderIds?: string[];
  featureConfig: AIFeatureConfig | null;
}): { primaryProviderId: string | null; fallbackProviderIds: string[] } {
  const primary =
    nonempty(opts.primaryProviderId) ??
    nonempty(opts.featureConfig?.providerId) ??
    null;

  const fallbacks =
    opts.fallbackProviderIds !== undefined
      ? opts.fallbackProviderIds
      : (opts.featureConfig?.fallbackProviderIds ?? []);

  return {
    primaryProviderId: primary,
    fallbackProviderIds: fallbacks.filter((id) => nonempty(id) && id !== primary),
  };
}

export function applyFeatureRequestPolicy(
  request: ChatRequest,
  featureConfig: AIFeatureConfig | null,
  promptVariables: Record<string, unknown> = {},
): ChatRequest {
  if (!featureConfig) return request;

  const model = nonempty(request.model) ?? featureConfig.model ?? "";
  const temperature = request.temperature ?? featureConfig.temperature ?? undefined;
  const max_tokens = request.max_tokens ?? featureConfig.maxTokens ?? undefined;

  let messages = request.messages;
  if (featureConfig.systemPrompt && !hasSystemMessage(messages)) {
    messages = [
      { role: "system", content: renderTemplate(featureConfig.systemPrompt, promptVariables) },
      ...messages,
    ];
  }

  return {
    ...request,
    model,
    messages,
    ...(temperature !== undefined ? { temperature } : {}),
    ...(max_tokens !== undefined ? { max_tokens } : {}),
  };
}
