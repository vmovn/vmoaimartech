import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { AICreditsError } from "./errors";
import {
  PREMIUM_CREDITS_PER_USD,
  actualPremiumCredits,
  assertPremiumModelPricing,
  creditsFromCostUsd,
  estimateChatCreditReservation,
  requiresPremiumCredits,
} from "./premium-credits";
import type { AIModelRecord, ChatRequest } from "./types";

const model: AIModelRecord = {
  id: "model-id",
  providerId: "provider-id",
  modelId: "premium-model",
  displayName: "Premium Model",
  capabilities: { chat: true },
  contextWindow: 128_000,
  maxOutputTokens: 4_096,
  inputCostPer1k: 0.001,
  outputCostPer1k: 0.003,
  enabled: true,
  isDefault: true,
};

const request: ChatRequest = {
  model: model.modelId,
  messages: [{ role: "user", content: "Summarize this customer conversation." }],
  max_tokens: 500,
};

describe("Premium Credits accounting policy", () => {
  it("centralizes the v1 internal credit conversion and successful-call minimum", () => {
    expect(PREMIUM_CREDITS_PER_USD).toBe(1_000);
    expect(creditsFromCostUsd(0.001)).toBe(1);
    expect(creditsFromCostUsd(0.01)).toBe(10);
    expect(creditsFromCostUsd(0.1)).toBe(100);
    expect(creditsFromCostUsd(0)).toBe(1);
  });

  it("debits only premium_credits and never Platform Local or workspace BYOK", () => {
    expect(requiresPremiumCredits("premium_credits")).toBe(true);
    expect(requiresPremiumCredits("platform_local")).toBe(false);
    expect(requiresPremiumCredits("workspace_byok")).toBe(false);
  });

  it("fails closed when a platform premium chat model has missing/zero pricing", () => {
    expect(() => assertPremiumModelPricing(null, "chat")).toThrow(AICreditsError);
    expect(() => assertPremiumModelPricing({ ...model, inputCostPer1k: 0 }, "chat")).toThrow(/missing or zero pricing/i);
    expect(() => assertPremiumModelPricing({ ...model, outputCostPer1k: 0 }, "chat")).toThrow(/missing or zero pricing/i);
  });

  it("permits zero output pricing for input-only embedding models", () => {
    expect(() => assertPremiumModelPricing({ ...model, outputCostPer1k: 0 }, "embed")).not.toThrow();
  });

  it("reserves from guarded input tokens and the effective maximum output", () => {
    const estimate = estimateChatCreditReservation(model, request);
    expect(estimate.inputTokens).toBeGreaterThan(0);
    expect(estimate.maxOutputTokens).toBe(500);
    expect(estimate.reservedCredits).toBeGreaterThanOrEqual(1);
    const actual = actualPremiumCredits(model, {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    });
    expect(actual.credits).toBe(1);
  });
});

describe("Premium Credits canonical SQL contract", () => {
  const billingMigration = readFileSync(
    "supabase/migrations/20260718052607_3e54b9a0-4512-43ae-9e57-d93206ee3c03.sql",
    "utf8",
  );
  const aiSettingsMigration = readFileSync(
    "supabase/migrations/20260717140917_585f56ea-4371-48ec-8f5b-4cb6e6ac93d8.sql",
    "utf8",
  );

  it("uses tenant quotas, usage events, and a transaction-only reservation record", () => {
    expect(billingMigration).toMatch(/'ai_premium_credits','Premium AI Credits'/);
    expect(billingMigration).toMatch(/CREATE TABLE public\.ai_credit_reservations/);
    expect(billingMigration).toMatch(/CREATE OR REPLACE FUNCTION public\.reserve_ai_premium_credits/);
    expect(billingMigration).toMatch(/CREATE OR REPLACE FUNCTION public\.settle_ai_premium_credits/);
    expect(billingMigration).toMatch(/CREATE OR REPLACE FUNCTION public\.release_ai_premium_credits/);
    expect(billingMigration).toMatch(/INSERT INTO public\.usage_events/);
  });

  it("keeps financial mutations service-role only and blocks browser premium events", () => {
    expect(billingMigration).toMatch(/REVOKE ALL ON FUNCTION public\.reserve_ai_premium_credits[\s\S]*FROM public, anon, authenticated/);
    expect(billingMigration).toMatch(/meter_code <> 'ai_premium_credits'/);
    expect(billingMigration).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.reserve_ai_premium_credits[^\n]*TO authenticated/);
  });

  it("stores per-user ceilings with workspace-scoped RLS", () => {
    expect(aiSettingsMigration).toMatch(/CREATE TABLE public\.ai_user_credit_limits/);
    expect(aiSettingsMigration).toMatch(/UNIQUE \(workspace_id, user_id\)/);
    expect(aiSettingsMigration).toMatch(/ai_user_credit_limits admins manage/);
    expect(aiSettingsMigration).toMatch(/is_workspace_member\(workspace_id, user_id\)/);
  });

  it("provides idempotency, expiry recovery, and actual-over-reserve accounting", () => {
    expect(billingMigration).toMatch(/request_id text NOT NULL UNIQUE/);
    expect(billingMigration).toMatch(/release_expired_ai_credit_reservations/);
    expect(billingMigration).toMatch(/'ai-credit:' \|\| p_request_id \|\| ':actual'/);
    expect(billingMigration).toMatch(/p_actual_credits - v_res\.reserved_credits/);
    expect(billingMigration).toMatch(/'idempotent', true/);
  });
});
