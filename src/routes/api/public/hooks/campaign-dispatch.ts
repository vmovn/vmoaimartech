import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/api/request-guards";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Queue-based campaign dispatcher. Called every minute by pg_cron.
 * Uses admin client (bypasses RLS). Every row is scoped to a specific
 * campaign_dispatch_queue entry already owned by a workspace.
 */
export const Route = createFileRoute("/api/public/hooks/campaign-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardCronRequest(request);
        if (denied) return denied;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const admin = supabaseAdmin as any;
          const workerId = crypto.randomUUID();
          const now = new Date().toISOString();
          const BATCH = 500;

          const { data: pendingIds } = await admin
            .from("campaign_dispatch_queue")
            .select("id")
            .eq("status", "pending")
            .lte("run_at", now)
            .order("priority", { ascending: true })
            .order("run_at", { ascending: true })
            .limit(BATCH);

          const ids = (pendingIds ?? []).map((r: any) => r.id);
          if (ids.length === 0) return json({ ok: true, processed: 0 });

          const { data: claimed, error: claimErr } = await admin
            .from("campaign_dispatch_queue")
            .update({ status: "processing", locked_at: now, locked_by: workerId })
            .in("id", ids)
            .eq("status", "pending")
            .select("*");
          if (claimErr) return json({ ok: false, error: claimErr.message }, 500);
          const rows = (claimed ?? []) as any[];
          if (rows.length === 0) return json({ ok: true, processed: 0 });

          const byCampaign = new Map<string, any[]>();
          for (const r of rows) {
            const list = byCampaign.get(r.campaign_id) ?? [];
            list.push(r);
            byCampaign.set(r.campaign_id, list);
          }

          const results = { sent: 0, failed: 0, skipped: 0 };

          for (const [campaignId, batch] of byCampaign.entries()) {
            const { data: campaign } = await admin
              .from("campaigns")
              .select("*")
              .eq("id", campaignId)
              .maybeSingle();
            const status = campaign?.status as string | undefined;
            if (!campaign || status === "paused" || status === "cancelled") {
              await admin
                .from("campaign_dispatch_queue")
                .update({ status: "skipped", processed_at: now })
                .in("id", batch.map((r) => r.id));
              results.skipped += batch.length;
              continue;
            }

            const throttle = Math.max(1, Number(campaign.throttle_per_minute ?? 60));
            const send = batch.slice(0, throttle);
            const defer = batch.slice(throttle);
            if (defer.length > 0) {
              await admin
                .from("campaign_dispatch_queue")
                .update({
                  status: "pending",
                  locked_at: null,
                  locked_by: null,
                  run_at: new Date(Date.now() + 60_000).toISOString(),
                })
                .in("id", defer.map((r) => r.id));
            }

            for (const row of send) {
              try {
                // TODO: wire actual WhatsApp provider send here.
                await admin
                  .from("campaign_dispatch_queue")
                  .update({
                    status: "sent",
                    processed_at: new Date().toISOString(),
                    attempts: Number(row.attempts ?? 0) + 1,
                  })
                  .eq("id", row.id);

                if (row.recipient_id) {
                  await admin
                    .from("campaign_recipients")
                    .update({ status: "sent", sent_at: new Date().toISOString() })
                    .eq("id", row.recipient_id);
                }
                await admin.from("campaign_events").insert({
                  workspace_id: row.workspace_id,
                  campaign_id: campaignId,
                  event_type: "sent",
                  payload: { contact_id: row.contact_id, variant_id: row.variant_id },
                });
                results.sent++;
              } catch (err) {
                const attempts = Number(row.attempts ?? 0) + 1;
                const failed = attempts >= Number(row.max_attempts ?? 3);
                await admin
                  .from("campaign_dispatch_queue")
                  .update({
                    status: failed ? "failed" : "pending",
                    attempts,
                    last_error: String((err as Error).message ?? err),
                    locked_at: null,
                    locked_by: null,
                    processed_at: failed ? new Date().toISOString() : null,
                    run_at: new Date(Date.now() + 30_000 * attempts).toISOString(),
                  })
                  .eq("id", row.id);
                if (failed) results.failed++;
              }
            }

            const [{ count: sentCount }, { count: failedCount }, { count: pendingCount }] =
              await Promise.all([
                admin
                  .from("campaign_dispatch_queue")
                  .select("id", { count: "exact", head: true })
                  .eq("campaign_id", campaignId)
                  .eq("status", "sent"),
                admin
                  .from("campaign_dispatch_queue")
                  .select("id", { count: "exact", head: true })
                  .eq("campaign_id", campaignId)
                  .eq("status", "failed"),
                admin
                  .from("campaign_dispatch_queue")
                  .select("id", { count: "exact", head: true })
                  .eq("campaign_id", campaignId)
                  .eq("status", "pending"),
              ]);

            await admin
              .from("campaigns")
              .update({
                sent_count: sentCount ?? 0,
                failed_count: failedCount ?? 0,
                status: (pendingCount ?? 0) === 0 ? "completed" : "running",
                completed_at: (pendingCount ?? 0) === 0 ? new Date().toISOString() : null,
              })
              .eq("id", campaignId);
          }

          return json({ ok: true, ...results });
        } catch (err) {
          return json({ ok: false, error: String((err as Error).message ?? err) }, 500);
        }
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
