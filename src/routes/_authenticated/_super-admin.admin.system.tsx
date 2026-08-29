import { createFileRoute } from "@tanstack/react-router";
import { Server } from "lucide-react";
import { AdminPageShell, AdminEmptyState } from "@/components/admin/admin-page-shell";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/system")({
  head: () => ({ meta: [{ title: "Super Admin — System Ops" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminPageShell title="System Operations" description="Background jobs, migrations, cache management, and maintenance windows.">
      <AdminEmptyState icon={Server} title="Ops console" description="Trigger reindexes, purge caches, run diagnostics, and schedule maintenance." />
    </AdminPageShell>
  ),
});
