import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  component: NotificationSettings,
  head: () => ({
    meta: [
      { title: "Notifications — Account Settings" },
      { name: "description", content: "Choose which product and workspace events send you a notification." },
      { property: "og:title", content: "Notifications — Account Settings" },
      { property: "og:description", content: "Choose which product and workspace events send you a notification." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function NotificationSettings() {
  return (
    <>
      <AppTopbar title="Notifications" subtitle="Choose which events notify you" />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="rounded-xl border border-border bg-surface shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-2xl">Notifications</h2>
          {["New inbound message", "Automation errors", "Weekly performance digest"].map((n) => (
            <label key={n} className="flex items-center justify-between rounded-md border border-border p-4">
              <span className="text-sm">{n}</span>
              <input type="checkbox" defaultChecked className="w-4 h-4 accent-accent" />
            </label>
          ))}
        </div>
      </main>
    </>
  );
}
