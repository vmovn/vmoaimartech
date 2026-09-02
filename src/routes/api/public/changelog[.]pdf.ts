import { createFileRoute } from "@tanstack/react-router";

import { APP_VERSION } from "@/lib/app-version";
import { BRAND_NAME } from "@/lib/branding/brand";
import { CURRENT_RELEASE_NOTES, releaseNotesToPdfBlocks } from "@/lib/docs/release-notes";
import { buildPdf } from "@/lib/docs/simple-pdf";

/**
 * Downloadable release notes for the current version.
 *
 * Public on purpose — the changelog is already public documentation, and a
 * stable URL lets both the docs site and the in-app About card link to it.
 */
export const Route = createFileRoute("/api/public/changelog.pdf")({
  server: {
    handlers: {
      GET: async () => {
        const pdf = buildPdf(releaseNotesToPdfBlocks(CURRENT_RELEASE_NOTES), {
          title: `${BRAND_NAME} v${APP_VERSION} release notes`,
          author: BRAND_NAME,
        });

        return new Response(pdf as unknown as BodyInit, {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": `attachment; filename="pm-ai-vn-v${APP_VERSION}-release-notes.pdf"`,
            "cache-control": "public, max-age=3600",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
