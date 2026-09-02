/**
 * Cron endpoint — drains conversations whose intelligence row is flagged
 * `needs_reanalysis`. Called by pg_cron (canonical cron owner migration)
 * or an external scheduler. Public route is safe: it authenticates against a
 * shared secret and never returns user data.
 */

import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/api/request-guards";

export const Route = createFileRoute("/api/public/hooks/analyze-conversations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardCronRequest(request);
        if (denied) return denied;

        let workspaceId: string | undefined;
        let limit: number | undefined;
        try {
          const body = (await request.json()) as {
            workspaceId?: string;
            limit?: number;
          };
          workspaceId = body?.workspaceId;
          if (typeof body?.limit === "number") limit = Math.max(1, Math.min(8, body.limit));
        } catch {
          /* no body is fine */
        }

        try {
          const { drainConversationIntelligence } = await import(
            "@/lib/ai/background-intelligence.server"
          );
          const stats = await drainConversationIntelligence({ workspaceId, limit });

          return new Response(JSON.stringify({ ok: true, ...stats }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          return new Response((err as Error).message, { status: 500 });
        }
      },
    },
  },
});
