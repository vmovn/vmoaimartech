import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/api/request-guards";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Advance drip enrollments — moves due enrollments to their next step. */
export const Route = createFileRoute("/api/public/hooks/drip-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardCronRequest(request);
        if (denied) return denied;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const admin = supabaseAdmin as any;
          const now = new Date().toISOString();

          const { data: enrollments } = await admin
            .from("drip_enrollments")
            .select("*, drip_sequences(workspace_id)")
            .eq("status", "active")
            .lte("next_run_at", now)
            .limit(500);

          let advanced = 0;
          for (const e of (enrollments ?? []) as any[]) {
            const wsId = e.drip_sequences?.workspace_id ?? null;
            const { data: steps } = await admin
              .from("drip_steps")
              .select("*")
              .eq("sequence_id", e.sequence_id)
              .order("step_order");
            const stepList = (steps ?? []) as any[];
            const currentIdx = Number(e.current_step ?? 0);
            const step = stepList[currentIdx];
            if (!step) {
              await admin
                .from("drip_enrollments")
                .update({ status: "completed", completed_at: now })
                .eq("id", e.id);
              continue;
            }

            if (wsId) {
              await admin.from("campaign_dispatch_queue").insert({
                workspace_id: wsId,
                campaign_id: e.sequence_id, // group by sequence id (reuses column)
                contact_id: e.contact_id,
                message_body: step.message_body,
                media_url: step.media_url,
                template_id: step.template_id,
                template_variables: step.variables ?? {},
                priority: 3,
                run_at: now,
                status: "pending",
              });
            }

            const nextIdx = currentIdx + 1;
            const nextDelay = stepList[nextIdx]?.delay_seconds ?? 0;
            const isDone = nextIdx >= stepList.length;
            await admin
              .from("drip_enrollments")
              .update({
                current_step: nextIdx,
                next_run_at: isDone
                  ? null
                  : new Date(Date.now() + Number(nextDelay) * 1000).toISOString(),
                status: isDone ? "completed" : "active",
                completed_at: isDone ? now : null,
                last_run_at: now,
              })
              .eq("id", e.id);
            advanced++;
          }

          return new Response(JSON.stringify({ ok: true, advanced }), {
            headers: { "content-type": "application/json" },
          });
        } catch (err) {
          return new Response(
            JSON.stringify({ ok: false, error: String((err as Error).message ?? err) }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
