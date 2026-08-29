/**
 * Public embed page for a named Chat Widget (embedded systems).
 *
 * Fetches the resolved config from /api/public/widget/config/:widgetId,
 * applies routing (which may swap the underlying chatbot or hide the
 * widget entirely for the current URL), then renders LiveChatWidget.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LiveChatWidget } from "@/components/app/widget/live-chat-widget";

interface ResolvedWidget {
  id: string;
  name: string;
  chatbotId: string | null;
  hide: boolean;
  config: { brandColor?: string; launcherPosition?: string; agentName?: string } & Record<string, unknown>;
}

export const Route = createFileRoute("/embed/w/$widgetId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Chat" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
  }),
  component: WidgetEmbed,
});

function WidgetEmbed() {
  const { widgetId } = Route.useParams();
  const [state, setState] = useState<{ status: "loading" | "ready" | "error" | "hidden"; data?: ResolvedWidget; error?: string }>({ status: "loading" });

  useEffect(() => {
    const url = new URLSearchParams(window.location.search).get("url") || "";
    fetch(`/api/public/widget/config/${widgetId}?url=${encodeURIComponent(url)}&lang=${navigator.language.slice(0, 5)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "failed");
        return r.json();
      })
      .then((data: ResolvedWidget) => {
        if (data.hide || !data.chatbotId) return setState({ status: "hidden" });
        setState({ status: "ready", data });
        // beacon 'open' when the iframe loads
        try {
          const beacon = new Blob([JSON.stringify({ widgetId, event: "open", url })], { type: "application/json" });
          navigator.sendBeacon?.("/api/public/widget/beacon", beacon);
        } catch { /* noop */ }
      })
      .catch((e) => setState({ status: "error", error: String(e?.message ?? e) }));
  }, [widgetId]);

  if (state.status === "loading") {
    return <div className="fixed inset-0 grid place-items-center bg-transparent text-sm text-muted-foreground">Loading…</div>;
  }
  if (state.status === "hidden") return null;
  if (state.status === "error") {
    return <div className="fixed inset-0 grid place-items-center bg-background p-4 text-sm text-destructive">{state.error}</div>;
  }
  const cfg = state.data!.config;
  return (
    <div className="fixed inset-0 flex flex-col bg-transparent">
      <LiveChatWidget
        chatbotId={state.data!.chatbotId!}
        accent={typeof cfg.brandColor === "string" ? cfg.brandColor : "#A4161A"}
        compact
      />
    </div>
  );
}
