import { createFileRoute } from "@tanstack/react-router";
import { Building2, Users, MessagesSquare, DollarSign, TrendingUp, TrendingDown, Activity, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/")({
  staticData: { breadcrumb: "Overview" },
  head: () => ({ meta: [{ title: "Super Admin — Dashboard" }, { name: "robots", content: "noindex" }] }),
  component: AdminOverviewPage,
});

type Kpi = { icon: typeof Building2; label: string; value: string; delta?: string; trend?: "up" | "down" };

const KPIS: Kpi[] = [
  { icon: Building2, label: "Workspaces", value: "1,284", delta: "+42 this week", trend: "up" },
  { icon: Users, label: "Active users (30d)", value: "18,942", delta: "+8.2%", trend: "up" },
  { icon: MessagesSquare, label: "Messages (30d)", value: "12.4M", delta: "+14.7%", trend: "up" },
  { icon: DollarSign, label: "MRR", value: "$142.6k", delta: "+6.1%", trend: "up" },
];

const SIGNALS = [
  { label: "API latency (p95)", value: "184ms", status: "healthy" },
  { label: "Webhook success rate", value: "99.94%", status: "healthy" },
  { label: "Queue backlog", value: "128 jobs", status: "healthy" },
  { label: "Failed payments (24h)", value: "3", status: "warning" },
  { label: "AI provider errors (1h)", value: "0", status: "healthy" },
  { label: "WhatsApp rate-limit hits", value: "12", status: "warning" },
];

function AdminOverviewPage() {
  return (
    <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
      <div>
        <h2 className="font-display text-2xl font-semibold">Platform Overview</h2>
        <p className="text-sm text-muted-foreground">Live metrics across every tenant, integration, and system service.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {KPIS.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-start justify-between">
              <div className="w-9 h-9 bg-accent/10 text-accent grid place-items-center">
                <s.icon className="w-4 h-4" />
              </div>
              {s.delta && (
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${s.trend === "up" ? "text-emerald-600" : "text-red-600"}`}>
                  {s.trend === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {s.delta}
                </span>
              )}
            </div>
            <div className="mt-4 text-2xl font-display font-semibold">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-accent" />
            <h3 className="font-display font-semibold">System signals</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {SIGNALS.map((s) => (
              <div key={s.label} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
                <div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                  <div className="text-sm font-medium mt-0.5">{s.value}</div>
                </div>
                <span
                  className={`w-2 h-2 rounded-full ${
                    s.status === "healthy" ? "bg-emerald-500" : s.status === "warning" ? "bg-amber-500" : "bg-red-500"
                  }`}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3 className="font-display font-semibold">Recent incidents</h3>
          </div>
          <div className="space-y-3 text-sm">
            <div className="border-l-2 border-amber-500 pl-3">
              <div className="font-medium">Elevated WhatsApp latency</div>
              <div className="text-xs text-muted-foreground">Resolved · 2h ago</div>
            </div>
            <div className="border-l-2 border-emerald-500 pl-3">
              <div className="font-medium">Payment retries succeeded</div>
              <div className="text-xs text-muted-foreground">Auto-recovered · 6h ago</div>
            </div>
            <div className="border-l-2 border-muted pl-3">
              <div className="font-medium">Nightly BI aggregation</div>
              <div className="text-xs text-muted-foreground">Completed · 8h ago</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
