/**
 * Pure helpers for background conversation intelligence.
 * Durable work lives on conversation_intelligence.needs_reanalysis
 * (message insert trigger coalesces by conversation PK).
 */
import { AIError } from "./errors";

export type PendingIntelligenceJob = {
  conversation_id: string;
  workspace_id: string;
  last_message_at: string | null;
};

export type IntelligenceFailureKind = "retryable" | "terminal";

export class IntelligenceTenantError extends Error {
  readonly kind = "tenant" as const;
  constructor(message = "Conversation does not belong to the queued workspace") {
    super(message);
    this.name = "IntelligenceTenantError";
  }
}

export class IntelligenceOutputError extends Error {
  readonly kind = "output" as const;
  constructor(message = "AI returned malformed analysis") {
    super(message);
    this.name = "IntelligenceOutputError";
  }
}

export function intelligenceDedupeKey(workspaceId: string, conversationId: string): string {
  return `${workspaceId}:conversation_intelligence:${conversationId}`;
}

/** Latest-wins: one job per conversation. */
export function coalescePendingIntelligence(
  rows: PendingIntelligenceJob[],
): PendingIntelligenceJob[] {
  const latest = new Map<string, PendingIntelligenceJob>();
  for (const row of rows) {
    const prev = latest.get(row.conversation_id);
    if (!prev || (row.last_message_at ?? "") >= (prev.last_message_at ?? "")) {
      latest.set(row.conversation_id, row);
    }
  }
  return [...latest.values()];
}

/**
 * Round-robin workspaces so a noisy tenant cannot occupy the whole tick.
 * Within a workspace, newest last_message_at wins.
 */
export function pickFairIntelligenceJobs(
  pending: PendingIntelligenceJob[],
  opts: { maxJobs: number; perWorkspace: number },
): PendingIntelligenceJob[] {
  const coalesced = coalescePendingIntelligence(pending);
  const byWorkspace = new Map<string, PendingIntelligenceJob[]>();
  for (const row of coalesced) {
    const list = byWorkspace.get(row.workspace_id) ?? [];
    list.push(row);
    byWorkspace.set(row.workspace_id, list);
  }
  for (const list of byWorkspace.values()) {
    list.sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""));
  }

  const workspaces = [...byWorkspace.keys()];
  const used = new Map<string, number>();
  const picked: PendingIntelligenceJob[] = [];
  let cursor = 0;

  while (picked.length < opts.maxJobs && workspaces.length > 0) {
    const i = cursor % workspaces.length;
    const workspaceId = workspaces[i];
    const taken = used.get(workspaceId) ?? 0;
    const queue = byWorkspace.get(workspaceId) ?? [];
    if (taken >= opts.perWorkspace || queue.length === 0) {
      workspaces.splice(i, 1);
      continue;
    }
    const next = queue.shift();
    if (!next) {
      workspaces.splice(i, 1);
      continue;
    }
    picked.push(next);
    used.set(workspaceId, taken + 1);
    cursor += 1;
  }
  return picked;
}

export function classifyIntelligenceFailure(err: unknown): IntelligenceFailureKind {
  if (err instanceof IntelligenceTenantError || err instanceof IntelligenceOutputError) {
    return "terminal";
  }
  if (err instanceof AIError) {
    if (
      err.type === "validation" ||
      err.type === "auth" ||
      err.type === "not_found" ||
      err.type === "context_length"
    ) {
      return "terminal";
    }
    return err.retryable ? "retryable" : "terminal";
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/malformed|invalid json|does not belong|not found|disabled|no messages/i.test(message)) {
    return "terminal";
  }
  return "retryable";
}

export function assertIntelligenceTenant(opts: {
  queuedWorkspaceId: string;
  entityWorkspaceId: string | null | undefined;
}): void {
  if (!opts.entityWorkspaceId || opts.entityWorkspaceId !== opts.queuedWorkspaceId) {
    throw new IntelligenceTenantError();
  }
}

/** Bounded in-flight mapper. Does not grow a promise per incoming event unbounded. */
export async function runBounded<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
  shouldStop?: () => boolean,
): Promise<void> {
  const limit = Math.max(1, concurrency);
  const executing = new Set<Promise<void>>();
  for (const item of items) {
    if (shouldStop?.()) break;
    let p: Promise<void>;
    p = fn(item).finally(() => {
      executing.delete(p);
    });
    executing.add(p);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all([...executing]);
}
