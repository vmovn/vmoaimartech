import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { analyticsSeries } from "@/lib/mock-data";
import { AreaChart, Area, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  return (
    <>
      <AppTopbar title="Analytics" subtitle="Delivery, engagement, and team performance" />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { l: "Delivery rate", v: "98.4%" },
            { l: "Read rate", v: "74.1%" },
            { l: "Avg. response", v: "3m 12s" },
            { l: "CSAT", v: "4.7 / 5" },
          ].map((s) => (
            <div key={s.l} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="text-xs text-muted-foreground">{s.l}</div>
              <div className="text-2xl font-display font-semibold mt-1">{s.v}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <h3 className="font-display font-semibold">Volume trend</h3>
            <p className="text-xs text-muted-foreground mb-4">Messages sent (last 14 days)</p>
            <div className="h-64">
              <ResponsiveContainer>
                <AreaChart data={analyticsSeries}>
                  <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                  <Tooltip contentStyle={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="sent" stroke="var(--color-accent)" strokeWidth={2} fill="url(#g)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <h3 className="font-display font-semibold">Delivery vs read</h3>
            <p className="text-xs text-muted-foreground mb-4">Comparison over time</p>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={analyticsSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                  <Tooltip contentStyle={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="delivered" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="read" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
