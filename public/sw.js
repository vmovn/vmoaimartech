/**
 * One-release cleanup worker.
 *
 * Older app-shell workers cached obsolete theme-validation bundles. Replacing
 * the worker at the same URL lets returning browsers remove those caches and
 * unregister the worker. Home-screen metadata remains available separately.
 */
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      try {
        // Cache Storage is shared by every worker on this origin. Remove only
        // the retired app-shell worker's Workbox buckets; messaging workers may
        // own unrelated caches that must remain intact.
        const cacheNames = await caches.keys();
        const appShellCaches = cacheNames.filter((name) =>
          /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/.test(name),
        );
        await Promise.allSettled(appShellCaches.map((name) => caches.delete(name)));

        await self.clients.claim();
        const windowClients = await self.clients.matchAll({ type: "window" });
        await Promise.allSettled(windowClients.map((client) => client.navigate(client.url)));
      } finally {
        await self.registration.unregister();
      }
    })(),
  ),
);
