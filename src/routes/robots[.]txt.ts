import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const DISALLOWED_PATHS = [
  "/ai-studio",
  "/analytics",
  "/api",
  "/auth",
  "/automations",
  "/book/manage",
  "/campaigns",
  "/contacts",
  "/dashboard",
  "/demo-login",
  "/dev",
  "/embed",
  "/forgot-password",
  "/header-height-probe",
  "/inbox",
  "/install",
  "/install-app",
  "/invite",
  "/maintenance",
  "/offline",
  "/overlay-probe",
  "/pay",
  "/reset-password",
  "/s",
  "/settings",
  "/setup",
  "/sidebar-probe",
  "/team",
  "/unsubscribe",
];

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const body = [
          "User-agent: *",
          "Allow: /",
          ...DISALLOWED_PATHS.map((path) => `Disallow: ${path}`),
          "",
          `Sitemap: ${origin}/sitemap.xml`,
          "",
        ].join("\n");

        return new Response(body, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
