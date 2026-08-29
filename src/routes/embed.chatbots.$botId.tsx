/**
 * Public embed page for the Live Chat Widget.
 *
 * Loaded inside the launcher iframe (via `/embed/chatbots/:botId`) OR
 * directly for full-page chat. It is deliberately outside `_authenticated`
 * so any website visitor can reach it without a session.
 */
import { createFileRoute } from "@tanstack/react-router";
import { LiveChatWidget } from "@/components/app/widget/live-chat-widget";
import { z } from "zod";

const SearchSchema = z.object({
  color: z.string().optional(),
  pos: z.enum(["br", "bl"]).optional(),
});

export const Route = createFileRoute("/embed/chatbots/$botId")({
  ssr: false,
  validateSearch: (input) => SearchSchema.parse(input),
  head: () => ({
    meta: [
      { title: "Live chat" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
  }),
  component: EmbedPage,
});

function EmbedPage() {
  const { botId } = Route.useParams();
  const { color } = Route.useSearch();
  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      <LiveChatWidget chatbotId={botId} accent={color || "#A4161A"} compact />
    </div>
  );
}
