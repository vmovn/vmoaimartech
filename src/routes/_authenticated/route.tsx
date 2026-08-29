import { createFileRoute, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppFooter } from "@/components/app/app-footer";
import { CommandPalette } from "@/components/app/command-palette";
import { LayoutProvider } from "@/shared/contexts/layout-context";
import { RealtimeMessagingProvider } from "@/hooks/use-realtime-messaging";
import { UnsupportedProviderBanner } from "@/components/app/inbox/unsupported-provider-banner";
import { cn } from "@/lib/utils";
import { ensureMyOrganization } from "@/lib/tenant/provision.functions";
import { readActiveOrgId, writeActiveOrgId } from "@/lib/tenant/active-tenant";


export const Route = createFileRoute("/_authenticated")({
  // The Supabase session lives in localStorage, which the server cannot read.
  // Without this, SSR of a protected route always sees "no session" and
  // bounces signed-in users to /auth on hard refresh / direct link.
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth", search: { next: location.href } });
    
    try {
      // A server-side failure can resolve to `undefined` instead of throwing
      // (e.g. the request middleware turned the error into an HTML response),
      // so never destructure the result blindly.
      const result = (await ensureMyOrganization()) as { organizationId?: string } | undefined;
      const organizationId = result?.organizationId ?? readActiveOrgId();
      if (!organizationId) {
        throw new Error("We could not prepare your workspace. Please try again.");
      }
      writeActiveOrgId(organizationId);
      return { user: data.session.user, organizationId };
    } catch (error) {
      console.error("[auth] Failed to provision organization:", error);
      // Fall back to the last known organization so a transient provisioning
      // failure does not lock the user out of the app.
      const cached = readActiveOrgId();
      if (cached) return { user: data.session.user, organizationId: cached };
      throw error;
    }

  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const location = useLocation();
  const immersiveRoute =
    location.pathname === "/inbox" || location.pathname.startsWith("/admin");

  return (
    <LayoutProvider>
      <RealtimeMessagingProvider>
        <div
          className={cn(
            "flex bg-background text-foreground",
            immersiveRoute ? "h-dvh min-h-0 overflow-hidden" : "min-h-dvh",
          )}
        >
          <AppSidebar />
          <div className={cn("flex-1 min-w-0 flex flex-col", immersiveRoute && "h-dvh min-h-0 overflow-hidden")}>
            <UnsupportedProviderBanner />
            <div className={cn("flex-1 flex flex-col min-w-0", immersiveRoute && "min-h-0 overflow-hidden")}>
              <Outlet />
            </div>

            {!immersiveRoute && <AppFooter />}
          </div>
          <CommandPalette />
        </div>
      </RealtimeMessagingProvider>
    </LayoutProvider>
  );
}
