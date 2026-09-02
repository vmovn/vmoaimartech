import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Node.js deploy: set DEPLOY_TARGET=node (or NITRO_PRESET=node-middleware) before `vite build`
// to emit a Node handler at .output/server/index.mjs which app.js boots for cPanel.
const nodeDeploy =
  process.env.DEPLOY_TARGET === "node" ||
  process.env.NITRO_PRESET === "node-middleware" ||
  process.env.NITRO_PRESET === "node-server" ||
  process.env.NITRO_PRESET === "node";

// Public base URL for generated asset/script URLs. Must match the path the app is
// mounted at on the production domain. PM.ai.vn is served from the domain root
// (https://pm.ai.vn/), so base is "/". Override with PUBLIC_BASE_URL
// if the app is ever mounted under a sub-path (e.g. "/app/").
const publicBase = process.env.PUBLIC_BASE_URL || "/";

export default defineConfig(async ({ command }) => {
  const [
    { default: tailwindcss },
    { tanstackStart },
    { default: react },
    { nitro },
    { default: tsconfigPaths },
  ] = await Promise.all([
    import("@tailwindcss/vite"),
    import("@tanstack/react-start/plugin/vite"),
    import("@vitejs/plugin-react"),
    import("nitro/vite"),
    import("vite-tsconfig-paths"),
  ]);

  return {
    base: publicBase,
    plugins: [
      tailwindcss(),
      tsconfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        importProtection: {
          behavior: "error",
          client: {
            files: ["**/server/**"],
            specifiers: ["server-only"],
          },
        },
        // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
        server: {
          entry: "server",
          ...(nodeDeploy ? { preset: "node-middleware" as const } : {}),
        },
      }),
      ...(command === "build" ? nitro({ defaultPreset: "cloudflare-module" }) : []),
      react(),
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
      ignoreOutdatedRequests: true,
    },
    server: {
      port: 8080,
      // pg_net runs inside the local Supabase container and reaches the host
      // application through Docker Desktop's stable internal DNS name.
      allowedHosts: ["host.docker.internal"],
      watch: {
        awaitWriteFinish: {
          stabilityThreshold: 1_000,
          pollInterval: 100,
        },
      },
    },
  };
});
