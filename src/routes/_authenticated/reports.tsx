import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { analyticsSeries } from "@/lib/mock-data";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/reports")({
  staticData: { breadcrumb: "Reports" },
  head: () => ({ meta: [{ title: "Reports" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <>
      <AppTopbar title="Reports" subtitle="Delivery, response times, and team performance" />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="font-display font-semibold">Volume — last 14 days</h3>
          <div className="h-72 mt-4">
            <ResponsiveContainer>
              <BarChart data={analyticsSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="sent" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="delivered" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="read" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </main>
    </>
  );
}
