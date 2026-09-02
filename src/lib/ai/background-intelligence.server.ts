/**
 * Durable background drain for conversation_intelligence.needs_reanalysis.
 * Claim is an optimistic CAS on the existing flag — no new job table.
 */
import { logger } from "@/shared/lib/logger";
import {
  classifyIntelligenceFailure,
  pickFairIntelligenceJobs,
  type PendingIntelligenceJob,
  runBounded,
} from "./background-intelligence";
import { processConversationIntelligence } from "./intelligence.server";
import {
  readOllamaMaxConcurrency,
  readOllamaWorkspaceMaxConcurrency,
} from "./ollama-fairness";

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

type DrainDb = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export async function fetchPendingConversations(
  workspaceId?: string,
  limit = INTELLIGENCE_PENDING_FETCH_LIMIT,
  db?: DrainDb,
): Promise<PendingIntelligenceJob[]> {
  const admin = db ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  let query = admin
    .from("conversation_intelligence")
    .select("conversation_id, workspace_id, last_message_at")
    .eq("needs_reanalysis", true);
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
): Promise<boolean> {
  const { data, error } = await db
    .from("conversation_intelligence")
    .update({ needs_reanalysis: false })
    .eq("conversation_id", job.conversation_id)
    .eq("workspace_id", job.workspace_id)
    .eq("needs_reanalysis", true)
    .select("conversation_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

export async function restoreIntelligenceJob(
  db: DrainDb,
  job: PendingIntelligenceJob,
): Promise<void> {
  const { error } = await db
    .from("conversation_intelligence")
    .update({ needs_reanalysis: true })
    .eq("conversation_id", job.conversation_id)
    .eq("workspace_id", job.workspace_id);
  if (error) throw new Error(error.message);
}

export async function drainConversationIntelligence(opts: {
  workspaceId?: string;
  limit?: number;
  deadlineMs?: number;
  now?: () => number;
  db?: DrainDb;
  process?: typeof processConversationIntelligence;
} = {}): Promise<IntelligenceDrainStats> {
  const db = opts.db ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  const process = opts.process ?? processConversationIntelligence;
  const now = opts.now ?? Date.now;
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
      const claimed = await claimIntelligenceJob(db, job);
      if (!claimed) {
        stats.skipped += 1;
        return;
      }
      stats.claimed += 1;
      const started = now();
      try {
        await process({
          conversationId: job.conversation_id,
          queuedWorkspaceId: job.workspace_id,
          userId: null,
          db,
        });
        stats.completed += 1;
        logger.info("ai.background_intelligence", {
          workspaceId: job.workspace_id,
          feature: "conversation_intelligence",
          entityType: "conversation",
          entityId: job.conversation_id,
          status: "completed",
          latencyMs: now() - started,
        });
      } catch (err) {
        const kind = classifyIntelligenceFailure(err);
        if (kind === "retryable") {
          await restoreIntelligenceJob(db, job);
          stats.retryable += 1;
        } else {
          stats.terminal += 1;
        }
        logger.warn("ai.background_intelligence", {
          workspaceId: job.workspace_id,
          feature: "conversation_intelligence",
          entityType: "conversation",
          entityId: job.conversation_id,
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
