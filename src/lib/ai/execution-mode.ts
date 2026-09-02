/**
 * Execution mode is derived from the selected provider's credential ownership.
 * Vendor kind alone does not decide who pays.
 *
 * platform-managed Ollama / keyless utility → platform_local
 * platform/operator ENV premium provider → premium_credits
 * workspace encrypted credential → workspace_byok
 * customer-owned keyless (LM Studio / unmanaged Ollama) → workspace_byok (customer compute, no credits)
 */
import type { AIProviderRecord } from "./types";
import { AIError } from "./errors";
import { decideCredentialSource } from "./provider-credentials.server";
import { isPlatformManagedOllama } from "./platform-ollama";
import { isActiveAiProviderKind } from "./registry.server";
import type { AiTaskPolicy, ExecutionMode } from "./task-policy";
import { getTaskPolicy } from "./task-policy";

export type CostOwner = "platform_compute" | "premium_credits" | "workspace_api";

export function decideExecutionMode(record: AIProviderRecord): ExecutionMode {
  if (isPlatformManagedOllama(record)) return "platform_local";
  const source = decideCredentialSource(record);
  if (source === "workspace_encrypted") return "workspace_byok";
  if (source === "platform_env") return "premium_credits";
  return "workspace_byok";
}

export function costOwnerFor(mode: ExecutionMode): CostOwner {
  if (mode === "platform_local") return "platform_compute";
  if (mode === "premium_credits") return "premium_credits";
  return "workspace_api";
}

/**
 * Conceptual credit units for a future Credit Engine.
 * 0 = do not debit Premium Credits.
 * null = meter later (premium_credits). P5 does not debit a ledger.
 */
export function conceptualCreditsToCharge(mode: ExecutionMode): 0 | null {
  if (mode === "workspace_byok" || mode === "platform_local") return 0;
  return null;
}

export function providerAllowedForTask(record: AIProviderRecord, policy: AiTaskPolicy): boolean {
  if (!isActiveAiProviderKind(record.kind)) return false;
  return policy.allowedExecutionModes.includes(decideExecutionMode(record));
}

/**
 * Default provider selection for a task.
 * Premium/hybrid never silently pick Platform Local AI.
 * Utility never silently pick a premium/BYOK provider.
 */
export function pickProviderForTask(
  candidates: AIProviderRecord[],
  policy: AiTaskPolicy,
): AIProviderRecord | null {
  const allowed = candidates.filter((p) => p.enabled && providerAllowedForTask(p, policy));
  if (allowed.length === 0) return null;

  if (policy.taskClass === "utility") {
    return allowed.find((p) => decideExecutionMode(p) === "platform_local") ?? allowed[0];
  }

  const preferred = allowed.filter((p) => decideExecutionMode(p) === policy.defaultExecutionMode);
  if (preferred.length > 0) return preferred[0];

  const nonLocal = allowed.filter((p) => decideExecutionMode(p) !== "platform_local");
  return nonLocal[0] ?? null;
}

export function missingProviderForTaskError(policy: AiTaskPolicy): AIError {
  if (policy.taskClass === "utility") {
    return new AIError("validation", "This AI utility task requires Platform Local AI.");
  }
  return new AIError(
    "validation",
    "This AI feature requires a premium provider (PM.ai.vn Premium Credits or workspace BYOK). Platform Local AI cannot run it.",
  );
}

export function buildAiAccountingMetadata(
  record: AIProviderRecord,
  feature: string | null | undefined,
): Record<string, unknown> {
  const mode = decideExecutionMode(record);
  const policy = getTaskPolicy(feature);
  return {
    executionMode: mode,
    costOwner: costOwnerFor(mode),
    creditsToCharge: conceptualCreditsToCharge(mode),
    credentialSource: decideCredentialSource(record),
    taskClass: policy.taskClass,
    defaultExecutionMode: policy.defaultExecutionMode,
  };
}
