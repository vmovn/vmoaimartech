import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Users, Target, Building2, Heart, DollarSign, Activity, Clock, Handshake, MessagesSquare,
  Sparkles, Plus, ArrowRight, TrendingUp, AlertTriangle, CheckCircle2, Calendar, Zap, Flame,
} from "lucide-react";
import { useDashboardData } from "@/hooks/use-dashboard";
const leadDisplayName = (l: { first_name: string | null; last_name: string | null; email: string | null; company_name: string | null }) =>
  [l.first_name, l.last_name].filter(Boolean).join(" ").trim() || l.email || l.company_name || "Unnamed lead";
import { contactDisplayName, contactInitials } from "@/hooks/use-contacts";
import { companyInitials } from "@/hooks/use-companies";
import { customerInitials } from "@/hooks/use-customers";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [
    { title: "CRM Dashboard — Live Overview" },
    { name: "description", content: "Real-time overview of leads, customers, deals, tasks and conversations." },
  ]}),
  component: DashboardPage,
});

function DashboardPage() {
  const nav = useNavigate();
  const d = useDashboardData();

  const newLeadsCount = d.newLeads.data?.length ?? 0;
  const cust = d.activeCustomers.data;
  const upcoming = d.upcomingTasks.data ?? [];
  const overdue = upcoming.filter((t) => t.due_at && new Date(t.due_at) < new Date()).length;
  const openDeals = d.pipeline.data?.deals ?? [];
  const pipelineValue = openDeals.reduce((s, x) => s + Number(x.amount || 0), 0);
  const weighted = openDeals.reduce((s, x) => s + Number(x.amount || 0) * (Number(x.probability || 0) / 100), 0);

  return (
    <>
      <AppTopbar title="Dashboard" subtitle="Your CRM at a glance — live" />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2">
          <QuickAction icon={Target} label="New Lead" onClick={() => nav({ to: "/leads" })} />
          <QuickAction icon={Users} label="New Contact" onClick={() => nav({ to: "/contacts" })} />
          <QuickAction icon={Building2} label="New Company" onClick={() => nav({ to: "/companies" })} />
          <QuickAction icon={Handshake} label="New Deal" onClick={() => nav({ to: "/deals" })} />
          <QuickAction icon={Calendar} label="New Task" onClick={() => nav({ to: "/dashboard" })} />
          <QuickAction icon={MessagesSquare} label="Open Inbox" onClick={() => nav({ to: "/inbox" })} />
          <QuickAction icon={Sparkles} label="AI Studio" onClick={() => nav({ to: "/ai-studio" })} />
        </div>

        {/* Top stat row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Target} tone="accent" label="New Leads · 7d"
            value={String(newLeadsCount)}
            hint={`${d.assignedLeads.data?.length ?? 0} assigned to you`}
            to="/leads"
          />
          <StatCard
            icon={Heart} tone="rose" label="Active Customers"
            value={String(cust?.active ?? 0)}
            hint={`${cust?.total ?? 0} total · ${cust?.atRisk ?? 0} at risk`}
            to="/customers"
          />
          <StatCard
            icon={DollarSign} tone="green" label="Open Pipeline"
            value={`$${Math.round(pipelineValue).toLocaleString()}`}
            hint={`Weighted $${Math.round(weighted).toLocaleString()}`}
            to="/deals"
          />
          <StatCard
            icon={Calendar} tone="amber" label="Upcoming Tasks"
            value={String(upcoming.length)}
            hint={overdue ? `${overdue} overdue` : "All on track"}
            to="/dashboard"
          />
        </div>

        {/* Row: pipeline + AI insights */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <PipelineSummary
              stages={d.pipeline.data?.stages ?? []}
              deals={openDeals}
            />
          </div>
          <AIInsights
            newLeads={newLeadsCount}
            atRisk={cust?.atRisk ?? 0}
            overdue={overdue}
            pipelineValue={pipelineValue}
            weighted={weighted}
          />
        </div>

        {/* Row: New Leads + Assigned Leads */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Widget title="New Leads" subtitle="Captured in the last 7 days" icon={Target} to="/leads">
            {d.newLeads.data?.length ? (
              <ul className="divide-y divide-border/60">
                {d.newLeads.data.slice(0, 6).map((l) => (
                  <li key={l.id}>
                    <Link to="/leads/$leadId" params={{ leadId: l.id }} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition">
                      <div className="w-9 h-9 rounded-full bg-accent/10 grid place-items-center text-xs font-semibold text-accent shrink-0">
                        {(leadDisplayName(l).match(/\b\w/g) || []).slice(0, 2).join("").toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{leadDisplayName(l)}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {l.company_name || l.email || "—"}{l.source ? ` · ${l.source}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {l.rating === "hot" && <Flame className="w-3.5 h-3.5 text-orange-500" />}
                        {typeof l.score === "number" && <Badge variant="outline" className="text-[11px]">{l.score}</Badge>}
                        <LeadStatusBadge status={l.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <Empty text="No new leads this week." />}
          </Widget>

          <Widget title="Assigned to me" subtitle="Your open leads" icon={Zap} to="/leads">
            {d.assignedLeads.data?.length ? (
              <ul className="divide-y divide-border/60">
                {d.assignedLeads.data.slice(0, 6).map((l) => (
                  <li key={l.id}>
                    <Link to="/leads/$leadId" params={{ leadId: l.id }} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition">
                      <div className="w-9 h-9 rounded-full bg-primary/10 grid place-items-center text-xs font-semibold text-primary shrink-0">
                        {(leadDisplayName(l).match(/\b\w/g) || []).slice(0, 2).join("").toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{leadDisplayName(l)}</div>
                        <div className="text-xs text-muted-foreground truncate">{l.company_name || l.email || "—"}</div>
                      </div>
                      <LeadStatusBadge status={l.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <Empty text="Nothing assigned to you." />}
          </Widget>
        </div>

        {/* Row: Recent Contacts + Recent Companies */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Widget title="Recently Added Contacts" subtitle="Fresh people in your CRM" icon={Users} to="/contacts">
            {d.recentContacts.data?.length ? (
              <ul className="divide-y divide-border/60">
                {d.recentContacts.data.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <Link to="/contacts/$contactId" params={{ contactId: c.id }} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition">
                      <Avatar className="w-9 h-9 shrink-0">
                        {c.avatar_url ? <AvatarImage src={c.avatar_url} /> : null}
                        <AvatarFallback className="text-xs bg-accent/10 text-accent">{contactInitials(c)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{contactDisplayName(c)}</div>
                        <div className="text-xs text-muted-foreground truncate">{c.job_title || c.email || "—"}</div>
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo(c.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <Empty text="No recent contacts." />}
          </Widget>

          <Widget title="Recent Companies" subtitle="Newest accounts" icon={Building2} to="/companies">
            {d.recentCompanies.data?.length ? (
              <ul className="divide-y divide-border/60">
                {d.recentCompanies.data.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <Link to="/companies/$companyId" params={{ companyId: c.id }} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition">
                      <div className="w-9 h-9 bg-muted grid place-items-center overflow-hidden shrink-0">
                        {c.logo_url ? <img src={c.logo_url} alt="" className="w-full h-full object-cover" /> : <span className="text-xs font-semibold">{companyInitials(c)}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{c.industry || "—"}</div>
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo(c.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <Empty text="No recent companies." />}
          </Widget>
        </div>

        {/* Row: Today's activities + Upcoming tasks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Widget title="Today's Activities" subtitle="Everything that happened today" icon={Activity}>
            {d.todaysActivities.data?.length ? (
              <ol className="p-4 space-y-3 relative before:absolute before:left-[22px] before:top-2 before:bottom-2 before:w-px before:bg-border">
                {d.todaysActivities.data.slice(0, 10).map((a) => (
                  <li key={a.id} className="flex items-start gap-3 relative">
                    <div className="w-3 h-3 rounded-full bg-accent mt-1.5 ring-4 ring-surface z-10 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{a.summary || a.verb.replace(/[._]/g, " ")}</div>
                      <div className="text-xs text-muted-foreground">
                        <span className="capitalize">{a.verb.replace(/[._]/g, " ")}</span>
                        {a.object_type ? ` · ${a.object_type}` : ""} · {new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : <Empty text="No activity yet today." />}
          </Widget>

          <Widget title="Upcoming Tasks" subtitle="Sorted by due date" icon={Calendar}>
            {upcoming.length ? (
              <ul className="divide-y divide-border/60">
                {upcoming.slice(0, 8).map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${t.priority === "high" || t.priority === "urgent" ? "bg-destructive" : t.priority === "medium" ? "bg-amber-500" : "bg-muted-foreground/60"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{t.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.due_at ? new Date(t.due_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "No date"}
                        {t.entity_type ? ` · ${t.entity_type}` : ""}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[11px] capitalize shrink-0">{t.status}</Badge>
                  </li>
                ))}
              </ul>
            ) : <Empty text="No upcoming tasks." />}
          </Widget>
        </div>

        {/* Recent conversations */}
        <Widget title="Recent Conversations" subtitle="Latest inbound activity" icon={MessagesSquare} to="/inbox">
          {d.recentConversations.data?.length ? (
            <ul className="divide-y divide-border/60">
              {d.recentConversations.data.map((c) => {
                const name = c.contact?.display_name || [c.contact?.first_name, c.contact?.last_name].filter(Boolean).join(" ") || "Unknown";
                const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                return (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition">
                    <Avatar className="w-9 h-9 shrink-0">
                      {c.contact?.avatar_url ? <AvatarImage src={c.contact.avatar_url} /> : null}
                      <AvatarFallback className="text-xs bg-emerald-500/10 text-emerald-600">{initials || "??"}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{name}</div>
                      <div className="text-xs text-muted-foreground truncate">{c.ai_summary || `Status: ${c.status}`}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {c.unread_count > 0 && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-accent text-accent-foreground">{c.unread_count}</span>}
                      {c.last_message_at && <span className="text-[11px] text-muted-foreground">{timeAgo(c.last_message_at)}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <Empty text="No conversations yet." />}
        </Widget>
      </main>
    </>
  );
}

/* ---------------- Reusable pieces ---------------- */

function QuickAction({ icon: Icon, label, onClick }: { icon: typeof Plus; label: string; onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} className="gap-1.5">
      <Icon className="w-4 h-4" /> {label}
    </Button>
  );
}

function StatCard({ icon: Icon, tone, label, value, hint, to }: {
  icon: typeof Users; tone: "accent" | "rose" | "green" | "amber"; label: string; value: string; hint?: string; to?: string;
}) {
  const toneClass = {
    accent: "bg-accent/10 text-accent",
    rose: "bg-rose-500/10 text-rose-500",
    green: "bg-emerald-500/10 text-emerald-600",
    amber: "bg-amber-500/10 text-amber-600",
  }[tone];
  const content = (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm hover:shadow-md transition group">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg grid place-items-center ${toneClass}`}><Icon className="w-5 h-5" /></div>
        {to && <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition" />}
      </div>
      <div className="mt-4">
        <div className="text-3xl font-display font-semibold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-2">{hint}</div>}
      </div>
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

function Widget({ title, subtitle, icon: Icon, children, to }: {
  title: string; subtitle?: string; icon: typeof Users; children: React.ReactNode; to?: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
      <header className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-sm truncate">{title}</h3>
            {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
          </div>
        </div>
        {to && (
          <Link to={to} className="text-xs text-accent hover:underline shrink-0 inline-flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="p-8 text-center text-sm text-muted-foreground">{text}</div>;
}

function LeadStatusBadge({ status }: { status: string }) {
  const cls = {
    new: "bg-blue-500/10 text-blue-600",
    contacted: "bg-purple-500/10 text-purple-600",
    working: "bg-amber-500/10 text-amber-600",
    qualified: "bg-emerald-500/10 text-emerald-600",
    nurturing: "bg-cyan-500/10 text-cyan-600",
    converted: "bg-primary/10 text-primary",
    disqualified: "bg-muted text-muted-foreground",
    unqualified: "bg-muted text-muted-foreground",
  }[status] ?? "bg-muted text-muted-foreground";
  return <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded capitalize ${cls}`}>{status}</span>;
}

function PipelineSummary({ stages, deals }: { stages: import("@/hooks/use-dashboard").DashStage[]; deals: import("@/hooks/use-dashboard").DashDeal[] }) {
  const totals = stages.map((s) => {
    const stageDeals = deals.filter((d) => d.stage_id === s.id);
    const value = stageDeals.reduce((sum, d) => sum + Number(d.amount || 0), 0);
    return { ...s, count: stageDeals.length, value };
  });
  const max = Math.max(...totals.map((t) => t.value), 1);

  return (
    <Widget title="Pipeline Summary" subtitle="Open deals by stage" icon={Handshake} to="/deals">
      {totals.length ? (
        <div className="p-4 space-y-3">
          {totals.map((s) => (
            <div key={s.id}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: s.color || "hsl(var(--accent))" }} />
                  {s.name}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {s.count} · ${Math.round(s.value).toLocaleString()}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-accent to-primary transition-all"
                  style={{ width: `${(s.value / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty text="No stages configured. Create a pipeline to get started." />
      )}
    </Widget>
  );
}

function AIInsights({ newLeads, atRisk, overdue, pipelineValue, weighted }: {
  newLeads: number; atRisk: number; overdue: number; pipelineValue: number; weighted: number;
}) {
  const insights: Array<{ icon: typeof Sparkles; tone: string; title: string; body: string }> = [];
  if (newLeads > 0) insights.push({
    icon: TrendingUp, tone: "text-emerald-600 bg-emerald-500/10",
    title: `${newLeads} fresh lead${newLeads === 1 ? "" : "s"} this week`,
    body: "Reach out within 24h to boost conversion by up to 7×.",
  });
  if (atRisk > 0) insights.push({
    icon: AlertTriangle, tone: "text-rose-600 bg-rose-500/10",
    title: `${atRisk} customer${atRisk === 1 ? "" : "s"} at risk`,
    body: "Schedule a check-in call before health scores drop further.",
  });
  if (overdue > 0) insights.push({
    icon: Clock, tone: "text-amber-600 bg-amber-500/10",
    title: `${overdue} overdue task${overdue === 1 ? "" : "s"}`,
    body: "Clearing overdue work first keeps deals moving forward.",
  });
  if (pipelineValue > 0) insights.push({
    icon: DollarSign, tone: "text-primary bg-primary/10",
    title: `Weighted pipeline: $${Math.round(weighted).toLocaleString()}`,
    body: `Out of $${Math.round(pipelineValue).toLocaleString()} open — probability-adjusted.`,
  });
  if (!insights.length) insights.push({
    icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-500/10",
    title: "All caught up",
    body: "No urgent signals right now. Great time to prospect new accounts.",
  });

  return (
    <section className="rounded-xl border border-border bg-gradient-to-br from-surface via-surface to-accent/5 shadow-sm overflow-hidden">
      <header className="px-4 py-3 border-b border-border flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-primary grid place-items-center">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <div>
          <h3 className="font-display font-semibold text-sm">AI Insights</h3>
          <p className="text-[11px] text-muted-foreground">Automatic signals from your workspace</p>
        </div>
      </header>
      <ul className="p-3 space-y-2">
        {insights.map((i, idx) => (
          <li key={idx} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/40 transition">
            <div className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${i.tone}`}>
              <i.icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium">{i.title}</div>
              <div className="text-xs text-muted-foreground">{i.body}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const dd = Math.floor(h / 24); if (dd < 7) return `${dd}d`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

// silence unused-import lint for icons imported for type refs only
void Plus;
void customerInitials;
