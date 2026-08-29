import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppTopbar } from "@/components/app/app-topbar";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace, useWorkspaceRole } from "@/hooks/use-workspace";
import { WorkspaceGatewaysPanel } from "@/components/app/billing/workspace-gateways-panel";
import { PlanCheckoutPanel } from "@/components/app/billing/plan-checkout-panel";
import { GatewayHealthWidget } from "@/components/app/billing/gateway-health-widget";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/settings/billing")({
  component: BillingSettings,
  head: () => ({
    meta: [
      { title: "Billing — Workspace Settings" },
      { name: "description", content: "Review your current plan, subscription status, and past invoices." },
    ],
  }),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = (t: string) => supabase.from(t as any) as any;

function fmtMoney(cents?: number | null, currency = "USD") {
  if (cents == null) return "—";
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100); }
  catch { return `$${(cents / 100).toFixed(2)}`; }
}

function BillingSettings() {
  const { data: ws } = useCurrentWorkspace();
  const { data: myRole } = useWorkspaceRole(ws?.id);
  const canManageGateways = myRole === "owner" || myRole === "admin";
  const orgId = ws?.organization_id ?? null;

  const sub = useQuery({
    queryKey: ["subscription", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await anyFrom("subscriptions").select("*, plan:plan_id(id, name, code, price_cents, currency, interval, tier)").eq("organization_id", orgId).maybeSingle();
      return data as null | {
        status: string; seats: number; current_period_start: string | null; current_period_end: string | null;
        trial_ends_at: string | null; cancel_at: string | null; provider: string | null;
        plan: { name: string; code: string; price_cents: number; currency: string; interval: string; tier: string } | null;
      };
    },
  });

  // Invoices are billed per organization — `billing_invoices` has no
  // workspace_id column, so scope by the workspace's organization.
  const invoices = useQuery({
    queryKey: ["billing_invoices", "org", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await anyFrom("billing_invoices")
        .select("id, number, status, total_cents, currency, issued_at, due_at, paid_at, pdf_url")
        .eq("organization_id", orgId)
        .order("issued_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; number: string | null; status: string; total_cents: number; currency: string; issued_at: string | null; due_at: string | null; paid_at: string | null; pdf_url: string | null }>;
    },
  });

  // Subscription history: lifecycle events recorded from gateway webhooks
  // and in-app plan changes, scoped to the workspace's organization.
  const history = useQuery({
    queryKey: ["billing_events", "org", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await anyFrom("billing_events")
        .select("id, event_type, provider, created_at, processed_at, error")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; event_type: string; provider: string | null; created_at: string; processed_at: string | null; error: string | null }>;
    },
  });




  return (
    <>
      <AppTopbar title="Billing" subtitle="Plan and invoices" />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Current plan</CardTitle>
            <CardDescription>Your active subscription. Change plans below.</CardDescription>
          </CardHeader>
          <CardContent>
            {!orgId ? (
              <p className="text-sm text-muted-foreground">This workspace is not attached to an organization.</p>
            ) : sub.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading subscription…</p>
            ) : !sub.data ? (
              <p className="text-sm text-muted-foreground">No active subscription. Workspace is on the <span className="capitalize font-medium text-foreground">{ws?.plan}</span> plan.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Row label="Plan" value={<span className="font-medium">{sub.data.plan?.name ?? "—"}</span>} />
                <Row label="Status" value={<Badge variant={sub.data.status === "active" ? "default" : "outline"} className="capitalize">{sub.data.status}</Badge>} />
                <Row label="Price" value={sub.data.plan ? `${fmtMoney(sub.data.plan.price_cents, sub.data.plan.currency)} / ${sub.data.plan.interval}` : "—"} />
                <Row label="Seats" value={String(sub.data.seats)} />
                <Row label="Current period" value={sub.data.current_period_end ? `Until ${new Date(sub.data.current_period_end).toLocaleDateString()}` : "—"} />
                {sub.data.trial_ends_at && <Row label="Trial ends" value={new Date(sub.data.trial_ends_at).toLocaleDateString()} />}
                {sub.data.cancel_at && <Row label="Cancels at" value={new Date(sub.data.cancel_at).toLocaleDateString()} />}
                <Row label="Provider" value={sub.data.provider ?? "—"} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
          <CardContent>
            {invoices.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
             (invoices.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No invoices yet.</p> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.data!.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-mono text-xs">{i.number ?? i.id.slice(0, 8)}</TableCell>
                      <TableCell className="text-xs">{i.issued_at ? new Date(i.issued_at).toLocaleDateString() : "—"}</TableCell>
                      <TableCell><Badge variant={i.status === "paid" ? "default" : "outline"} className="capitalize">{i.status}</Badge></TableCell>
                      <TableCell className="text-right">{fmtMoney(i.total_cents, i.currency)}</TableCell>
                      <TableCell className="text-right">
                        {i.pdf_url && <a href={i.pdf_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">PDF</a>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subscription history</CardTitle>
            <CardDescription>Plan changes, renewals, and payment events for this workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            {!orgId ? (
              <p className="text-sm text-muted-foreground">This workspace is not attached to an organization.</p>
            ) : history.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (history.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No subscription events yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.data!.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm">{e.event_type.replace(/[._]/g, " ")}</TableCell>
                      <TableCell className="text-xs capitalize text-muted-foreground">{e.provider ?? "system"}</TableCell>
                      <TableCell className="text-xs">{new Date(e.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={e.error ? "destructive" : e.processed_at ? "default" : "outline"}>
                          {e.error ? "Failed" : e.processed_at ? "Processed" : "Pending"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>


        {orgId && (
          <PlanCheckoutPanel
            organizationId={orgId}
            workspaceId={ws?.id ?? null}
            currentPlanCode={sub.data?.plan?.code ?? null}
            canManage={canManageGateways}
          />
        )}

        {ws?.id && <GatewayHealthWidget workspaceId={ws.id} />}

        {ws?.id && (
          <WorkspaceGatewaysPanel workspaceId={ws.id} canManage={canManageGateways} />
        )}

      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm mt-1">{value}</div>
    </div>
  );
}
