import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2 } from "lucide-react";
import { listMyQuotes } from "@/lib/client-portal/portal.functions";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/client/billing/quotes")({
  component: QuotesPage,
});

const money = (v: number, ccy = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: ccy || "USD" }).format(v ?? 0);

function QuotesPage() {
  const fn = useServerFn(listMyQuotes);
  const q = useQuery({ queryKey: ["portal-quotes"], queryFn: () => fn() });
  const rows = q.data ?? [];
  if (q.isLoading) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  if (rows.length === 0) return (
    <div className="rounded-xl border border-border bg-surface p-10 text-center">
      <FileText className="w-8 h-8 mx-auto text-muted-foreground/50" />
      <p className="mt-3 text-sm text-muted-foreground">No quotes yet.</p>
    </div>
  );
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-background/60 text-xs text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium">Quote</th>
            <th className="text-left px-4 py-2.5 font-medium">Title</th>
            <th className="text-left px-4 py-2.5 font-medium">Sent</th>
            <th className="text-left px-4 py-2.5 font-medium">Valid until</th>
            <th className="text-right px-4 py-2.5 font-medium">Total</th>
            <th className="text-left px-4 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((qt) => (
            <tr key={qt.id} className="border-t border-border">
              <td className="px-4 py-3">
                <Link to="/client/billing/quote/$id" params={{ id: qt.id }} className="font-mono text-xs hover:text-accent">{qt.quote_number}</Link>
              </td>
              <td className="px-4 py-3">{qt.title}</td>
              <td className="px-4 py-3">{qt.sent_at ? new Date(qt.sent_at).toLocaleDateString() : "—"}</td>
              <td className="px-4 py-3">{qt.valid_until ? new Date(qt.valid_until).toLocaleDateString() : "—"}</td>
              <td className="px-4 py-3 text-right font-medium">{money(qt.total, qt.currency)}</td>
              <td className="px-4 py-3">
                <Badge variant={qt.status === "accepted" ? "default" : qt.status === "rejected" ? "destructive" : "outline"} className="capitalize">{qt.status}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
