// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Node.js deploy: set DEPLOY_TARGET=node (or NITRO_PRESET=node-middleware) before `vite build`
// to emit a Node handler at .output/server/index.mjs which app.js boots for cPanel.
const nodeDeploy =
  process.env.DEPLOY_TARGET === "node" ||
  process.env.NITRO_PRESET === "node-middleware" ||
  process.env.NITRO_PRESET === "node-server" ||
  process.env.NITRO_PRESET === "node";

// Public base URL for generated asset/script URLs. Must match the path the app is
// mounted at on the production domain. Swiffer is served from the domain root
// (https://swiffer.wrapcoders.com/), so base is "/". Override with PUBLIC_BASE_URL
// if the app is ever mounted under a sub-path (e.g. "/app/").
const publicBase = process.env.PUBLIC_BASE_URL || "/";

export default defineConfig({
  vite: {
    base: publicBase,
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: {
      entry: "server",
      ...(nodeDeploy ? { preset: "node-middleware" as const } : {}),
    },
  },
});
