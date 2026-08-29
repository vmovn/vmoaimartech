import { createFileRoute } from "@tanstack/react-router";

/**
 * Dynamic Open Graph / Twitter Card image.
 *
 * Social crawlers require a real raster image at a stable URL, so this route
 * always answers with a PNG:
 *
 *  1. the platform's uploaded social image (Super Admin → Platform Settings →
 *     Branding, `social_image_url`) when one is configured, so white-labelled
 *     deployments share their own card without touching code;
 *  2. otherwise the bundled `/og-image.png` fallback.
 *
 * Keeping the preview behind one endpoint means the tags baked into every
 * route never change when branding does — crawlers just re-fetch this URL.
 */

const FALLBACK = "/og-image.png";

function isPng(type: string | null) {
  return !!type && /^image\/(png|jpeg|webp)$/i.test(type);
}

async function resolveConfiguredImage(): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("settings")
      .select("value")
      .eq("scope", "platform")
      .eq("key", "branding")
      .maybeSingle();
    const raw = (data?.value ?? {}) as Record<string, unknown>;
    const url = typeof raw["social_image_url"] === "string" ? raw["social_image_url"].trim() : "";
    if (!url) return null;
    if (url.startsWith("/") && !url.startsWith("//")) return url;
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/public/og.png")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const configured = await resolveConfiguredImage();
        const candidates = [configured, FALLBACK].filter(Boolean) as string[];

        for (const candidate of candidates) {
          const target = candidate.startsWith("/") ? `${origin}${candidate}` : candidate;
          try {
            const res = await fetch(target);
            if (!res.ok) continue;
            const type = res.headers.get("content-type");
            if (!isPng(type)) continue;
            return new Response(await res.arrayBuffer(), {
              status: 200,
              headers: {
                "content-type": type!,
                // Short TTL so a branding change propagates on the next scrape.
                "cache-control": "public, max-age=600, s-maxage=600",
                "x-content-type-options": "nosniff",
              },
            });
          } catch {
            // try the next candidate
          }
        }

        return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
      },
    },
  },
});
