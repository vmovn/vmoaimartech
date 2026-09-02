/**
 * Durable background drain for conversation_intelligence.needs_reanalysis.
 * Claim is an optimistic CAS on analysis_claimed_at — needs_reanalysis stays
 * true until success or a terminal failure. Expired leases are reclaimable
 * without a new message.
 */
import { logger } from "@/shared/lib/logger";
import {
  classifyIntelligenceFailure,
  INTELLIGENCE_LEASE_MS,
  intelligenceLeaseExpiredBefore,
  pickFairIntelligenceJobs,
  type PendingIntelligenceJob,
  runBounded,
} from "./background-intelligence";
import { processConversationIntelligence } from "./intelligence.server";
import {
  readOllamaMaxConcurrency,
  readOllamaWorkspaceMaxConcurrency,
} from "./ollama-fairness";

export { INTELLIGENCE_LEASE_MS };

export const INTELLIGENCE_DRAIN_BUDGET_MS = 45_000;
export const INTELLIGENCE_PENDING_FETCH_LIMIT = 200;
export const INTELLIGENCE_MAX_JOBS_PER_TICK = 8;

export type IntelligenceDrainStats = {
  pending: number;
  claimed: number;
  completed: number;
  retryable: number;
  terminal: number;
  skipped: number;
};

export type IntelligenceClaim = {
  conversation_id: string;
  workspace_id: string;
  last_message_at: string | null;
  analysis_claimed_at: string;
};

type DrainDb = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

type Clock = () => number;

function applySnapshotFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  snapshotLastMessageAt: string | null,
) {
  if (snapshotLastMessageAt == null) {
    return query.is("last_message_at", null);
  }
  return query.eq("last_message_at", snapshotLastMessageAt);
}

export async function fetchPendingConversations(
  workspaceId?: string,
  limit = INTELLIGENCE_PENDING_FETCH_LIMIT,
  db?: DrainDb,
  now: Clock = Date.now,
  leaseMs: number = INTELLIGENCE_LEASE_MS,
): Promise<PendingIntelligenceJob[]> {
  const admin = db ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  const expiredBefore = intelligenceLeaseExpiredBefore(now(), leaseMs);
  let query = admin
    .from("conversation_intelligence")
    .select("conversation_id, workspace_id, last_message_at, analysis_claimed_at")
    .eq("needs_reanalysis", true)
    .or(`analysis_claimed_at.is.null,analysis_claimed_at.lt."${expiredBefore}"`);
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data, error } = await query
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(Math.max(1, Math.min(limit, 500)));
  if (error) throw new Error(error.message);
  return (data ?? []) as PendingIntelligenceJob[];
}

export async function claimIntelligenceJob(
  db: DrainDb,
  job: PendingIntelligenceJob,
  now: Clock = Date.now,
  leaseMs: number = INTELLIGENCE_LEASE_MS,
): Promise<IntelligenceClaim | null> {
  const claimedAt = new Date(now()).toISOString();
  const expiredBefore = intelligenceLeaseExpiredBefore(now(), leaseMs);
  const { data, error } = await db
    .from("conversation_intelligence")
    .update({ analysis_claimed_at: claimedAt })
    .eq("conversation_id", job.conversation_id)
    .eq("workspace_id", job.workspace_id)
    .eq("needs_reanalysis", true)
    .or(`analysis_claimed_at.is.null,analysis_claimed_at.lt."${expiredBefore}"`)
    .select("conversation_id, workspace_id, last_message_at, analysis_claimed_at")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return data as IntelligenceClaim;
}

export async function releaseIntelligenceLease(
  db: DrainDb,
  job: Pick<PendingIntelligenceJob, "conversation_id" | "workspace_id">,
): Promise<void> {
  const { error } = await db
    .from("conversation_intelligence")
    .update({ analysis_claimed_at: null })
    .eq("conversation_id", job.conversation_id)
    .eq("workspace_id", job.workspace_id);
  if (error) throw new Error(error.message);
}

/** Transient failure: drop the lease, keep the job pending. */
export async function restoreIntelligenceJob(
  db: DrainDb,
  job: Pick<PendingIntelligenceJob, "conversation_id" | "workspace_id">,
): Promise<void> {
  const { error } = await db
    .from("conversation_intelligence")
    .update({ needs_reanalysis: true, analysis_claimed_at: null })
    .eq("conversation_id", job.conversation_id)
    .eq("workspace_id", job.workspace_id);
  if (error) throw new Error(error.message);
}

/**
 * Success: clear stale + lease only when last_message_at still matches the
 * snapshot observed at claim/analysis time. A newer message keeps the row pending.
 */
export async function completeIntelligenceJob(
  db: DrainDb,
  job: Pick<PendingIntelligenceJob, "conversation_id" | "workspace_id">,
  snapshotLastMessageAt: string | null,
): Promise<boolean> {
  const { data, error } = await applySnapshotFilter(
    db
      .from("conversation_intelligence")
      .update({ needs_reanalysis: false, analysis_claimed_at: null })
      .eq("conversation_id", job.conversation_id)
      .eq("workspace_id", job.workspace_id),
    snapshotLastMessageAt,
  )
    .select("conversation_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return true;
  await releaseIntelligenceLease(db, job);
  return false;
}

/** Permanent failure: stop retrying this snapshot; do not erase a newer stale flag. */
export async function finalizeTerminalIntelligenceJob(
  db: DrainDb,
  job: Pick<PendingIntelligenceJob, "conversation_id" | "workspace_id">,
  snapshotLastMessageAt: string | null,
): Promise<void> {
  const { data, error } = await applySnapshotFilter(
    db
      .from("conversation_intelligence")
      .update({ needs_reanalysis: false, analysis_claimed_at: null })
      .eq("conversation_id", job.conversation_id)
      .eq("workspace_id", job.workspace_id),
    snapshotLastMessageAt,
  )
    .select("conversation_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) await releaseIntelligenceLease(db, job);
}

export async function drainConversationIntelligence(opts: {
  workspaceId?: string;
  limit?: number;
  deadlineMs?: number;
  now?: Clock;
  leaseMs?: number;
  db?: DrainDb;
  process?: typeof processConversationIntelligence;
} = {}): Promise<IntelligenceDrainStats> {
  const db = opts.db ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  const process = opts.process ?? processConversationIntelligence;
  const now = opts.now ?? Date.now;
  const leaseMs = opts.leaseMs ?? INTELLIGENCE_LEASE_MS;
  const deadline = now() + (opts.deadlineMs ?? INTELLIGENCE_DRAIN_BUDGET_MS);
  const maxJobs = Math.max(
    1,
    Math.min(opts.limit ?? INTELLIGENCE_MAX_JOBS_PER_TICK, INTELLIGENCE_MAX_JOBS_PER_TICK),
  );
  const globalCap = readOllamaMaxConcurrency();
  const perWorkspace = readOllamaWorkspaceMaxConcurrency();

  const pending = await fetchPendingConversations(
    opts.workspaceId,
    INTELLIGENCE_PENDING_FETCH_LIMIT,
    db,
    now,
    leaseMs,
  );
  const picked = pickFairIntelligenceJobs(pending, { maxJobs, perWorkspace });

  const stats: IntelligenceDrainStats = {
    pending: pending.length,
    claimed: 0,
    completed: 0,
    retryable: 0,
    terminal: 0,
    skipped: 0,
  };

  await runBounded(
    picked,
    globalCap,
    async (job) => {
      if (now() >= deadline) {
        stats.skipped += 1;
        return;
      }
      const claimed = await claimIntelligenceJob(db, job, now, leaseMs);
      if (!claimed) {
        stats.skipped += 1;
        return;
      }
      stats.claimed += 1;
      const snapshotLastMessageAt = claimed.last_message_at;
      const started = now();
      try {
        await process({
          conversationId: claimed.conversation_id,
          queuedWorkspaceId: claimed.workspace_id,
          userId: null,
          db,
        });
        await completeIntelligenceJob(db, claimed, snapshotLastMessageAt);
        stats.completed += 1;
        logger.info("ai.background_intelligence", {
          workspaceId: claimed.workspace_id,
          feature: "conversation_intelligence",
          entityType: "conversation",
          entityId: claimed.conversation_id,
          status: "completed",
          latencyMs: now() - started,
        });
      } catch (err) {
        const kind = classifyIntelligenceFailure(err);
        if (kind === "retryable") {
          await restoreIntelligenceJob(db, claimed);
          stats.retryable += 1;
        } else {
          await finalizeTerminalIntelligenceJob(db, claimed, snapshotLastMessageAt);
          stats.terminal += 1;
        }
        logger.warn("ai.background_intelligence", {
          workspaceId: claimed.workspace_id,
          feature: "conversation_intelligence",
          entityType: "conversation",
          entityId: claimed.conversation_id,
          status: kind,
          latencyMs: now() - started,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    () => now() >= deadline,
  );

  return stats;
}
