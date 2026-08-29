import { createFileRoute } from "@tanstack/react-router";
import { Receipt } from "lucide-react";
import { AdminPageShell, AdminEmptyState } from "@/components/admin/admin-page-shell";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/billing")({
  head: () => ({ meta: [{ title: "Super Admin — Billing" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminPageShell title="Billing Management" description="Invoices, payments, refunds, credits, tax rates, and dunning across every tenant.">
      <AdminEmptyState icon={Receipt} title="Platform billing ledger" description="Reconcile every gateway, monitor failed payments, issue credits, and audit tax records." />
    </AdminPageShell>
  ),
});
