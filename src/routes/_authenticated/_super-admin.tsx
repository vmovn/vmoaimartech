import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { requirePlatformRole } from "@/lib/rbac";
import { useLayout } from "@/shared/contexts/layout-context";
import { useTenantBrand } from "@/hooks/use-tenant-brand";

/**
 * Admin Panel gate.
 *
 * `beforeLoad` runs BEFORE any route in this subtree is loaded, and even
 * before the layout component is instantiated — so route-level RBAC here
 * strictly prevents the admin bundle from rendering for anyone other than a
 * platform superadmin. This is the primary enforcement point; the API layer
 * additionally re-checks role for every mutation (defense in depth).
 */
export const Route = createFileRoute("/_authenticated/_super-admin")({
  beforeLoad: requirePlatformRole("superadmin"),
  component: SuperAdminLayout,
});

function SuperAdminLayout() {
  const brand = useTenantBrand();
  const { platformRole } = Route.useRouteContext();
  const { sidebarCollapsed, setSidebarCollapsed } = useLayout();

  // Auto-collapse the main app sidebar while inside /admin so the AdminSidebar
  // has room to breathe; restore the previous state when leaving.
  useEffect(() => {
    const previous = sidebarCollapsed;
    if (!previous) setSidebarCollapsed(true, { persist: false });
    return () => {
      if (!previous) setSidebarCollapsed(false, { persist: false });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  return (
    <div className="flex-1 flex min-h-0">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-header border-b border-border bg-surface px-6 py-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Platform · role {platformRole}</div>
            <h1 className="font-display font-semibold text-sm">
              {`${brand.name} Super Admin`}
            </h1>

          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-sm bg-emerald-500/10 text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> All systems operational
            </span>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
