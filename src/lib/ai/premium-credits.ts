/**
 * Premium Credits accounting policy.
 *
 * Credits are an internal accounting unit, not a customer-facing cash-value
 * promise. All USD conversion and conservative reservation estimation lives
 * here so provider execution never scatters economic constants.
 */
import { computeCost } from "./cost";
import { AICreditsError } from "./errors";
import { estimateMessageTokens } from "./tokens";
import type { AIModelRecord, ChatRequest, TokenUsage } from "./types";
import type { ExecutionMode } from "./task-policy";

export const PREMIUM_CREDITS_METER = "ai_premium_credits" as const;
export const PREMIUM_CREDITS_PER_USD = 1_000;
export const PREMIUM_CREDIT_RESERVATION_LEASE_SECONDS = 15 * 60;

const DEFAULT_MAX_OUTPUT_TOKENS = 1_024;
const INPUT_TOKEN_SAFETY_MULTIPLIER = 1.2;
const INPUT_TOKEN_SAFETY_FLOOR = 32;

export function requiresPremiumCredits(mode: ExecutionMode): boolean {
  return mode === "premium_credits";
}

export function creditsFromCostUsd(costUsd: number): number {
  if (!Number.isFinite(costUsd) || costUsd < 0) {
    throw new AICreditsError("configuration", "invalid_model_price", "Premium AI model pricing is invalid. Ask a platform operator to review the model configuration.");
  }
  return Math.max(1, Math.ceil(costUsd * PREMIUM_CREDITS_PER_USD));
}

export function assertPremiumModelPricing(
  model: AIModelRecord | null,
  operation: "chat" | "embed",
): asserts model is AIModelRecord {
  if (!model) {
    throw new AICreditsError("configuration", "premium_model_unresolved", "The platform premium AI model is not registered. Ask a platform operator to configure its pricing.");
  }
  const input = model.inputCostPer1k;
  const output = model.outputCostPer1k;
  const inputUsable = Number.isFinite(input) && input > 0;
  const outputUsable = operation === "embed" || (Number.isFinite(output) && output > 0);
  if (!inputUsable || !outputUsable) {
    throw new AICreditsError("configuration", "premium_model_price_missing", "The platform premium AI model has missing or zero pricing. Ask a platform operator to configure input and output prices.");
  }
}

function safeInputTokens(estimated: number): number {
  return Math.max(1, Math.ceil(estimated * INPUT_TOKEN_SAFETY_MULTIPLIER) + INPUT_TOKEN_SAFETY_FLOOR);
}

export function effectiveMaxOutputTokens(request: ChatRequest, model: AIModelRecord): number {
  const requested = request.max_tokens && request.max_tokens > 0 ? request.max_tokens : null;
  const modelMax = model.maxOutputTokens && model.maxOutputTokens > 0 ? model.maxOutputTokens : null;
  if (requested && modelMax) return Math.min(requested, modelMax);
  return requested ?? modelMax ?? DEFAULT_MAX_OUTPUT_TOKENS;
}

export interface PremiumCreditEstimate {
  inputTokens: number;
  maxOutputTokens: number;
  estimatedCostUsd: number;
  reservedCredits: number;
}

export function estimateChatCreditReservation(
  model: AIModelRecord,
  request: ChatRequest,
): PremiumCreditEstimate {
  assertPremiumModelPricing(model, "chat");
  const inputTokens = safeInputTokens(estimateMessageTokens(request.messages));
  const maxOutputTokens = effectiveMaxOutputTokens(request, model);
  const usage: TokenUsage = {
    prompt_tokens: inputTokens,
    completion_tokens: maxOutputTokens,
    total_tokens: inputTokens + maxOutputTokens,
  };
  const estimatedCostUsd = computeCost(model, usage);
  return {
    inputTokens,
    maxOutputTokens,
    estimatedCostUsd,
    reservedCredits: creditsFromCostUsd(estimatedCostUsd),
  };
}

function estimateTextTokens(input: string | string[]): number {
  const text = Array.isArray(input) ? input.join("\n") : input;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateEmbedCreditReservation(
  model: AIModelRecord,
  input: string | string[],
): PremiumCreditEstimate {
  assertPremiumModelPricing(model, "embed");
  const inputTokens = safeInputTokens(estimateTextTokens(input));
  const usage: TokenUsage = { prompt_tokens: inputTokens, completion_tokens: 0, total_tokens: inputTokens };
  const estimatedCostUsd = computeCost(model, usage);
  return {
    inputTokens,
    maxOutputTokens: 0,
    estimatedCostUsd,
    reservedCredits: creditsFromCostUsd(estimatedCostUsd),
  };
}

export function actualPremiumCredits(model: AIModelRecord, usage: TokenUsage): {
  costUsd: number;
  credits: number;
} {
  const costUsd = computeCost(model, usage);
  return { costUsd, credits: creditsFromCostUsd(costUsd) };
}
