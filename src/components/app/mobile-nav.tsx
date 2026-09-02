import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { Menu, LogOut, X, ShieldCheck } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useLayout } from "@/shared/contexts/layout-context";
import { OrganizationSwitcherConnected } from "./organization-switcher-connected";
import { useTenantBrand } from "@/hooks/use-tenant-brand";
import pmaiLogo from "@/assets/pmai-logo.png";
import { NAV_ITEMS, NAV_GROUPS, API_CONFIG_CHILDREN, type NavItem } from "./nav-config";
import { usePlatformRuntime } from "@/hooks/use-platform-runtime";
import { isRouteEnabled } from "@/lib/admin/platform-features";
import { NestedNavItem, NestedNavGroup, type NestedNavNode } from "./nested-nav-item";
import { usePlatformRole } from "@/shared/hooks/use-platform-role";
import { usePermissions } from "@/hooks/use-permissions";
import { useConversationCounts } from "@/hooks/use-conversations";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

export function MobileNav() {
  const { mobileNavOpen, setMobileNavOpen, navMode } = useLayout();
  const location = useLocation();
  const navigate = useNavigate();

  // Close drawer on route change.
  useEffect(() => {
    setMobileNavOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);


  const qc = useQueryClient();
  const { role } = usePlatformRole();
  const brand = useTenantBrand();
  const { can, isSuperAdmin, loading: permsLoading } = usePermissions();
  const { config: platform } = usePlatformRuntime();
  const { data: convCounts } = useConversationCounts();
  const liveBadge = (to: string): number | undefined =>
    to === "/inbox" ? convCounts?.badges?.unread ?? convCounts?.unread : undefined;

  const groups = [
    ...NAV_GROUPS,
    ...(role === "superadmin" ? [{ id: "admin" as const, label: "Platform", icon: ShieldCheck }] : []),
  ];

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    setMobileNavOpen(false);
    navigate({ to: "/auth", replace: true });
  }

  return (
    <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
      <SheetTrigger asChild>
        <button
          data-hidden={navMode !== "mobile" || undefined}
          className="data-[hidden]:hidden grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" />
        </button>
      </SheetTrigger>

      <SheetContent side="left" style={{ borderColor: "var(--sidebar-border)" }} className="w-[88vw] max-w-sm sm:w-80 bg-sidebar text-sidebar-foreground border-sidebar-border p-0 flex flex-col">
        <SheetHeader className="border-b border-sidebar-border px-3 h-header flex-row items-center space-y-0 justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="grid place-items-center w-8 h-8 rounded-lg overflow-hidden">
              <img
                src={brand.logoUrl ?? pmaiLogo}
                alt={`${brand.name} logo`}
                className="h-full w-full object-contain"
              />
            </div>
            <SheetTitle className="font-display text-sidebar-accent-foreground truncate">{brand.name}</SheetTitle>
          </div>
          <button
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </SheetHeader>

        <div className="px-3 pt-4">
          <OrganizationSwitcherConnected />
        </div>

        <ScrollAreaPrimitive.Root className="relative flex-1 min-h-0 overflow-hidden">
          <ScrollAreaPrimitive.Viewport className="h-full w-full">
            <nav
              className="px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-1"
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest("a[href]")) setMobileNavOpen(false);
              }}
            >
              <NestedNavGroup>
                {groups.map((group) => {
                  const items = NAV_ITEMS.filter((n) => n.group === group.id)
                    .filter((n) => !n.permission || permsLoading || isSuperAdmin || can(n.permission))
                    .filter((n) => isRouteEnabled(platform.features, n.to));
                  if (!items.length) return null;
                  const toLeaf = (it: NavItem) => ({
                    to: it.to,
                    label: it.label,
                    icon: it.icon,
                    badge: liveBadge(it.to) ?? it.badge,
                    external: it.external,
                    exact: it.exact,
                  });
                  const categories = Array.from(
                    new Set(items.map((it) => it.category).filter(Boolean) as string[]),
                  );
                  const node: NestedNavNode =
                    group.id === "api"
                      ? { label: group.label, icon: group.icon, children: API_CONFIG_CHILDREN }
                      : {
                          label: group.label,
                          icon: group.icon,
                          children: categories.length
                            ? categories.map((category) => ({
                                label: category,
                                children: items.filter((it) => it.category === category).map(toLeaf),
                              }))
                            : items.map(toLeaf),
                        };
                  return <NestedNavItem key={group.id} node={node} itemKey={group.id} touch />;
                })}
              </NestedNavGroup>
            </nav>
          </ScrollAreaPrimitive.Viewport>
          <ScrollAreaPrimitive.Scrollbar
            orientation="vertical"
            className="flex touch-none select-none transition-colors h-full w-2 border-l border-l-transparent p-[1px]"
          >
            <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-sidebar-border hover:bg-sidebar-accent-foreground/40 transition-colors" />
          </ScrollAreaPrimitive.Scrollbar>
          <ScrollAreaPrimitive.Corner />
        </ScrollAreaPrimitive.Root>


        <div className="border-t border-sidebar-border p-3">
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 rounded-md px-3 h-11 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign out</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
