/** Removes the retired app-shell worker while home-screen support remains. */
type UpdateHandler = (registration: ServiceWorkerRegistration) => void;

function isRefusedContext(): boolean {
  if (typeof window === "undefined") return true;
  if (!("serviceWorker" in navigator)) return true;
  if (!import.meta.env.PROD) return true;
  if (window.self !== window.top) return true;
  const host = window.location.hostname;
  if (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  ) {
    return true;
  }
  if (new URLSearchParams(window.location.search).has("sw")) {
    if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  }
  return false;
}

async function unregisterOwned(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => {
          const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
          return url.endsWith("/sw.js") || url.endsWith("/service-worker.js");
        })
        .map((r) => r.unregister().catch(() => false))
    );

    // Unregistering does not remove responses left by the retired app-shell
    // worker. Clear only its Workbox buckets so an obsolete index/chunk cannot
    // keep running after the registration itself has gone away.
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      const appShellCaches = names.filter((name) =>
        /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/.test(name),
      );
      await Promise.allSettled(appShellCaches.map((name) => caches.delete(name)));
    }

    const controllerUrl = navigator.serviceWorker.controller?.scriptURL ?? "";
    const controlledByRetiredWorker =
      controllerUrl.endsWith("/sw.js") || controllerUrl.endsWith("/service-worker.js");
    const reloadKey = "swiffer.retired-worker-reload";
    if (controlledByRetiredWorker && !window.sessionStorage.getItem(reloadKey)) {
      window.sessionStorage.setItem(reloadKey, "1");
      window.location.reload();
    } else if (!controlledByRetiredWorker) {
      window.sessionStorage.removeItem(reloadKey);
    }
  } catch {
    /* noop */
  }
}

export async function registerPwa(onUpdateAvailable?: UpdateHandler): Promise<void> {
  if (isRefusedContext()) {
    await unregisterOwned();
    return;
  }
  try {
    let refreshed = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshed) return;
      refreshed = true;
      window.location.reload();
    });

    const reg = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    await reg.update().catch(() => null);
    if (reg.waiting) {
      onUpdateAvailable?.(reg);
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  } catch (err) {
    console.warn("[pwa] cleanup worker registration failed", err);
  }
}

export function activateWaitingWorker(reg: ServiceWorkerRegistration): void {
  reg.waiting?.postMessage({ type: "SKIP_WAITING" });
}
