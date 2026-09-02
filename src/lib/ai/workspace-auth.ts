/**
 * AI tenant guards — reuses the product's existing workspace context.
 *
 * Active workspace on the wire: `x-swiffer-workspace-id`
 * (set by attachSupabaseAuthFresh from readActiveWorkspaceId).
 *
 * Membership/role: existing RPCs `is_workspace_member` / `is_workspace_admin`
 * on the caller's authenticated client (RLS-backed).
 *
 * This is not a second tenant system. Do not resolve workspace from
 * "first membership row".
 */

import { getRequest } from "@tanstack/react-start/server";
import { AIError } from "./errors";

export type AuthRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export function nonemptyWorkspaceId(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Canonical header written by attachSupabaseAuthFresh / active-tenant. */
export const ACTIVE_WORKSPACE_HEADER = "x-swiffer-workspace-id";

export function readActiveWorkspaceHeader(): string | null {
  try {
    const request = getRequest();
    return request?.headers?.get(ACTIVE_WORKSPACE_HEADER) ?? null;
  } catch {
    return null;
  }
}

export function pickRequestedWorkspaceId(opts: {
  inputWorkspaceId?: string | null;
  headerWorkspaceId?: string | null;
}): string | null {
  return nonemptyWorkspaceId(opts.inputWorkspaceId)
    ?? nonemptyWorkspaceId(opts.headerWorkspaceId)
    ?? null;
}

export async function assertAiWorkspaceMember(
  supabase: AuthRpcClient,
  userId: string,
  workspaceId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("is_workspace_member", {
    _workspace_id: workspaceId,
    _user_id: userId,
  });
  if (error) throw new AIError("auth", "Unable to verify workspace membership");
  if (!data) throw new AIError("auth", "Forbidden: not a member of this workspace");
}

export async function assertAiWorkspaceAdmin(
  supabase: AuthRpcClient,
  userId: string,
  workspaceId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("is_workspace_admin", {
    _workspace_id: workspaceId,
    _user_id: userId,
  });
  if (error) throw new AIError("auth", "Unable to verify workspace role");
  if (!data) throw new AIError("auth", "Forbidden: workspace owners and admins only");
}

/**
 * Resolve the workspace this AI call runs in.
 * 1. explicit input workspaceId (must be a membership)
 * 2. else active workspace header (same membership check)
 * Never the first workspace_members row.
 */
export async function resolveCallerWorkspaceId(opts: {
  supabase: AuthRpcClient;
  userId: string;
  requestedWorkspaceId?: string | null;
  headerWorkspaceId?: string | null;
  requireAdmin?: boolean;
}): Promise<string> {
  const workspaceId = pickRequestedWorkspaceId({
    inputWorkspaceId: opts.requestedWorkspaceId,
    headerWorkspaceId: opts.headerWorkspaceId,
  });
  if (!workspaceId) {
    throw new AIError("auth", "No active workspace. Select a workspace before using AI.");
  }
  await assertAiWorkspaceMember(opts.supabase, opts.userId, workspaceId);
  if (opts.requireAdmin) {
    await assertAiWorkspaceAdmin(opts.supabase, opts.userId, workspaceId);
  }
  return workspaceId;
}
