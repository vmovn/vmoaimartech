import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  Activity, Building2, Users, Sparkles, CreditCard, TrendingUp, ShieldCheck,
  MessageSquare, Shield, Server, ScrollText, Package, Settings2, Flag, Gauge,
  Package2, Receipt, Megaphone, LifeBuoy, Send, BarChart3, Code2, Menu, X, Archive, Eye, Smartphone, Webhook, PlugZap,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

type Item = { to: string; label: string; icon: typeof Activity };
type Group = { label: string; items: Item[] };

const GROUPS: Group[] = [
  {
    label: "Overview",
    items: [
      { to: "/admin", label: "Dashboard", icon: Activity },
      { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/admin/monitoring", label: "System Health", icon: Gauge },
    ],
  },
  {
    label: "Tenants",
    items: [
      { to: "/admin/workspaces", label: "Tenants", icon: Building2 },
      { to: "/admin/users", label: "Users", icon: Users },
    ],
  },
  {
    label: "Revenue",
    items: [
      { to: "/admin/plans", label: "Subscription Plans", icon: Package },
      { to: "/admin/subscriptions", label: "Subscriptions", icon: Package2 },
      { to: "/admin/billing", label: "Billing", icon: Receipt },
      { to: "/admin/gateways", label: "Payment Gateways", icon: CreditCard },
      { to: "/admin/revenue", label: "Revenue Analytics", icon: TrendingUp },
    ],
  },
  {
    label: "Integrations",
    items: [
      { to: "/admin/ai-providers", label: "AI Providers", icon: Sparkles },
      { to: "/admin/whatsapp", label: "WhatsApp", icon: MessageSquare },
      { to: "/admin/whatsapp-status", label: "WhatsApp Status", icon: Webhook },
      { to: "/admin/channel-providers", label: "Channel Providers", icon: PlugZap },
      { to: "/admin/developer", label: "Developer Tools", icon: Code2 },
    ],
  },
  {
    label: "Marketplace",
    items: [
      { to: "/admin/marketplace-ops", label: "Marketplace Ops", icon: Package },
      { to: "/admin/extension-readiness", label: "Extension Readiness", icon: Package },
    ],
  },
  {
    label: "Platform",
    items: [
      { to: "/admin/features", label: "Feature Flags", icon: Flag },
      { to: "/admin/announcements", label: "Announcements", icon: Megaphone },
      { to: "/admin/communications", label: "Communications", icon: Send },
      { to: "/admin/template-preview", label: "Template Preview", icon: Eye },
      { to: "/admin/support", label: "Support Center", icon: LifeBuoy },
      { to: "/admin/security", label: "Security", icon: Shield },
      { to: "/security-center", label: "Security Center", icon: Shield },
      { to: "/compliance-center", label: "Compliance Center", icon: Shield },
      { to: "/backup-management", label: "Backup Management", icon: Archive },
      { to: "/performance-center", label: "Performance Center", icon: Gauge },
      { to: "/monitoring-center", label: "Monitoring Center", icon: Activity },
      { to: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
      { to: "/admin/system", label: "System Ops", icon: Server },
      { to: "/release-readiness", label: "Release Readiness", icon: Shield },
      { to: "/admin/pwa", label: "PWA (Install App)", icon: Smartphone },
      { to: "/admin/settings", label: "Platform Settings", icon: Settings2 },
    ],
  },
];

export function AdminSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = (
    <ScrollArea
      type="always"
      className="flex-1 basis-0 min-h-0 [&>[data-radix-scroll-area-viewport]]:h-full"
    >
      <nav
        className="py-4 px-3 space-y-4"
        aria-label="Super admin navigation"
      >
        {GROUPS.map((g) => (
          <div key={g.label} className="space-y-1">
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
              {g.label}
            </div>
            {g.items.map((it) => {
              const active = pathname === it.to;
              const Icon = it.icon;
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all ${
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  }`}
                >
                  {active && (
                    <span
                      className="absolute left-0 top-1/2 h-5 w-0.5 -translate-x-3 -translate-y-1/2 rounded-r-full bg-accent"
                      aria-hidden
                    />
                  )}
                  <Icon
                    className={`h-4 w-4 shrink-0 ${active ? "text-accent" : ""}`}
                    aria-hidden
                  />
                  <span className="flex-1 truncate">{it.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </ScrollArea>
  );

  const header = (
    <div className="flex shrink-0 items-center h-header gap-2 px-5 border-b border-sidebar-border">
      <div className="grid place-items-center w-9 h-9 bg-destructive/15 text-destructive shrink-0">
        <ShieldCheck className="w-4 h-4" aria-hidden />
      </div>
      <div className="leading-tight">
        <div className="font-display font-semibold text-sidebar-accent-foreground">
          Super Admin
        </div>
        <div className="text-[11px] uppercase tracking-widest text-sidebar-foreground/50">
          Control plane
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile trigger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open admin navigation"
        className="md:hidden fixed top-3 left-3 z-40 h-10 w-10 grid place-items-center rounded-md border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm"
      >
        <Menu className="w-4 h-4" />
      </button>

      {/* Desktop sidebar — fixed on wide screens; the spacer preserves layout
          flow while the fixed panel gives ScrollArea a hard viewport height. */}
      <div className="hidden md:block w-64 shrink-0" aria-hidden="true" />
      <aside className="hidden md:flex fixed left-[var(--sidebar-width-collapsed)] top-0 bottom-0 z-30 h-dvh max-h-dvh w-64 shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        {header}
        {nav}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Admin navigation"
        >
          <div
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-dvh max-h-dvh min-h-0 w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col overflow-hidden animate-in slide-in-from-left duration-200">
            <div className="flex shrink-0 items-center justify-between border-b border-sidebar-border">
              {header}
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close admin navigation"
                className="h-9 w-9 mr-2 grid place-items-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
