import { AIError } from "./errors";

export type ProviderTenantDecision = "use" | "skip" | "reject";

/**
 * Cross-workspace provider IDs must never execute.
 * Explicit caller-supplied IDs fail closed (reject).
 * Feature-config / default chain IDs are skipped so a poisoned config
 * cannot pull another tenant's credentials.
 */
export function decideProviderTenant(opts: {
  providerWorkspaceId: string;
  executionWorkspaceId: string;
  explicit: boolean;
}): ProviderTenantDecision {
  if (opts.providerWorkspaceId === opts.executionWorkspaceId) return "use";
  return opts.explicit ? "reject" : "skip";
}

export function assertProviderTenant(opts: {
  providerWorkspaceId: string;
  executionWorkspaceId: string;
  explicit: boolean;
}): boolean {
  const decision = decideProviderTenant(opts);
  if (decision === "use") return true;
  if (decision === "reject") {
    throw new AIError("auth", "AI provider does not belong to this workspace");
  }
  return false;
}

export function modelBelongsToProvider(modelProviderId: string, providerId: string): boolean {
  return modelProviderId === providerId;
}
