import { Brand } from "@/components/brand";
import { createFileRoute } from "@tanstack/react-router";
import { MessagesSquare, Sparkles, Zap, ShieldCheck, BarChart3, Users } from "lucide-react";
import { MarketingShell } from "@/components/app/marketing-shell";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Features" },
      { name: "description", content: "Unified inbox, AI Studio, automations, analytics, multi-tenant workspaces, and enterprise security." },
      { property: "og:title", content: "Features" },
      { property: "og:description", content: "Everything your team needs to run WhatsApp at scale." },
    ],
  }),
  component: FeaturesPage,
});

const features = [
  { icon: MessagesSquare, title: "Unified inbox", desc: "Assign, tag, snooze and resolve WhatsApp conversations from one collaborative inbox." },
  { icon: Sparkles, title: "AI Studio", desc: "Reply suggestions, thread summaries, chatbot builder, and campaign copy — all built in." },
  { icon: Zap, title: "Automations", desc: "Trigger-based workflows: welcome messages, tagging, escalation, off-hours auto-reply." },
  { icon: BarChart3, title: "Analytics", desc: "Delivery, read, response, and CSAT metrics with team-level performance breakdowns." },
  { icon: Users, title: "Multi-tenant", desc: "Isolated workspaces with role-based access. Owner, admin, agent, viewer out of the box." },
  { icon: ShieldCheck, title: "Enterprise security", desc: "Row-level security, audit logs, SSO-ready. Self-host on your own infrastructure." },
];

function FeaturesPage() {
  return (
    <MarketingShell>
      <section className="container-marketing py-20">
        <div className="max-w-2xl">
          <span className="text-xs uppercase tracking-widest text-accent font-medium">Platform</span>
          <h1 className="mt-2 font-display text-4xl lg:text-5xl font-semibold text-balance">Everything you need to run WhatsApp at scale.</h1>
          <p className="mt-4 text-muted-foreground"><Brand /> replaces four tools — helpdesk, CRM, marketing automation, and chatbot — with a single platform tuned specifically for WhatsApp.</p>
        </div>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-surface p-6 shadow-sm hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-lg bg-accent/10 text-accent grid place-items-center"><f.icon className="w-4 h-4" /></div>
              <h3 className="mt-4 font-display font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
