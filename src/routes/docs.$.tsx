import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { DOCS_BASE_URL, docsUrl, type DocsPage } from "@/lib/docs/links";

/**
 * Legacy in-app doc pages (/docs/$slug) now map onto the static docs site.
 * Known top-level pages get their own file; everything else deep-links into
 * index.html via the topic hash.
 */
const PAGE_MAP: Record<string, DocsPage> = {
  changelog: "changelog",
  "release-notes": "changelog",
  releases: "changelog",
  status: "status",
  support: "support",
  help: "support",
  index: "index",
};

function targetFor(rest: string): string {
  const slug = rest.replace(/^\/+|\/+$/g, "").split("/")[0]?.replace(/\.(md|html)$/, "") ?? "";
  if (!slug) return docsUrl();
  const mapped = PAGE_MAP[slug];
  if (mapped) return docsUrl(mapped);
  return docsUrl("index", slug);
}

export const Route = createFileRoute("/docs/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!DOCS_BASE_URL) {
          return new Response("Documentation is not configured for this deployment.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
        return new Response(null, {
          status: 301,
          headers: {
            Location: targetFor(String((params as { _splat?: string })._splat ?? "")),
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
