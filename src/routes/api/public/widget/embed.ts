/**
 * GET /api/public/widget/embed?w=<widgetId>
 *
 * Serves the loader JavaScript customers paste into their site. Injects a
 * launcher iframe pointing at /embed/w/<widgetId>. Deliberately minimal — the
 * widget UI itself lives in the iframe, so we can update it without asking
 * customers to re-paste the snippet.
 */
import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=300",
} as const;

function loader(widgetId: string, origin: string): string {
  return `/* PM.ai.vn chat widget loader */
(function(){
  if (window.__pmaiWidget && window.__pmaiWidget.loaded) return;
  window.__pmaiWidget = { loaded: true, widgetId: ${JSON.stringify(widgetId)} };
  var origin = ${JSON.stringify(origin)};
  var wid = ${JSON.stringify(widgetId)};
  var src = origin + "/embed/w/" + wid + "?url=" + encodeURIComponent(location.href) + "&ref=" + encodeURIComponent(document.referrer||"");
  var wrap = document.createElement("div");
  wrap.id = "pmai-widget-root";
  wrap.style.cssText = "position:fixed;inset:auto 0 0 auto;z-index:2147483000;pointer-events:none;";
  var iframe = document.createElement("iframe");
  iframe.title = "Chat widget";
  iframe.src = src;
  iframe.allow = "clipboard-write; microphone; autoplay";
  iframe.style.cssText = "border:0;width:100vw;height:100vh;max-width:420px;max-height:720px;background:transparent;pointer-events:auto;";
  wrap.appendChild(iframe);
  function mount(){ document.body.appendChild(wrap); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
  // beacon: page load
  try {
    var beacon = new Blob([JSON.stringify({ widgetId: wid, event: "load", url: location.href, referrer: document.referrer })], { type: "application/json" });
    (navigator.sendBeacon && navigator.sendBeacon(origin + "/api/public/widget/beacon", beacon));
  } catch(e){}
})();`;
}

export const Route = createFileRoute("/api/public/widget/embed")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const wid = url.searchParams.get("w") ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(wid)) {
          return new Response("// invalid widget id", { status: 400, headers: { "Content-Type": "application/javascript", ...CORS } });
        }
        const origin = `${url.protocol}//${url.host}`;
        return new Response(loader(wid, origin), {
          status: 200,
          headers: { "Content-Type": "application/javascript; charset=utf-8", ...CORS },
        });
      },
    },
  },
});
