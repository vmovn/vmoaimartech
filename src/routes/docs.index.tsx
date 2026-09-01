import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { DOCS_BASE_URL, docsUrl } from "@/lib/docs/links";

/**
 * Legacy in-app Documentation Center lived at /docs. The docs now live in the
 * static site (docs/*.html), so keep old links working with a permanent redirect.
 */
export const Route = createFileRoute("/docs/")({
  server: {
    handlers: {
      GET: async () => {
        if (!DOCS_BASE_URL) {
          return new Response("Documentation is not configured for this deployment.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
        return new Response(null, {
          status: 301,
          headers: { Location: docsUrl(), "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});
