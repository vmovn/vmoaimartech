import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Bot, Workflow, Variable, Activity, Store } from "lucide-react";
import { AiAutomationsPanel } from "@/components/app/automations/ai-automations-panel";
import { WorkflowsList } from "@/components/app/automations/workflows-list";
import { VariableManager } from "@/components/app/automations/variable-manager";
import { WorkflowMonitoring } from "@/components/app/automations/workflow-monitoring";
import { TemplateMarketplace } from "@/components/app/automations/template-marketplace";

export const Route = createFileRoute("/_authenticated/automations/")({
  head: () => ({
    meta: [
      { title: "Automations" },
      {
        name: "description",
        content:
          "Build no-code workflows, AI automations and shared variables for WhatsApp, CRM and integrations.",
      },
      { property: "og:title", content: "Automations" },
      {
        property: "og:description",
        content:
          "Build no-code workflows, AI automations and shared variables for WhatsApp, CRM and integrations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AutomationsPage,
});

type Tab = "ai" | "workflows" | "marketplace" | "variables" | "monitoring";

function AutomationsPage() {
  const [tab, setTab] = React.useState<Tab>("workflows");
  return (
    <>
      <AppTopbar title="Automations" subtitle="AI actions, workflows, and shared variables" />
      <div className="px-4 lg:px-6 pt-4">
        <div className="inline-flex items-center rounded-lg border border-border bg-surface p-1 gap-1 flex-wrap">
          <TabBtn active={tab === "workflows"} onClick={() => setTab("workflows")} icon={<Workflow className="w-3.5 h-3.5" />}>
            Workflows
          </TabBtn>
          <TabBtn active={tab === "marketplace"} onClick={() => setTab("marketplace")} icon={<Store className="w-3.5 h-3.5" />}>
            Marketplace
          </TabBtn>
          <TabBtn active={tab === "monitoring"} onClick={() => setTab("monitoring")} icon={<Activity className="w-3.5 h-3.5" />}>
            Monitoring
          </TabBtn>
          <TabBtn active={tab === "ai"} onClick={() => setTab("ai")} icon={<Bot className="w-3.5 h-3.5" />}>
            AI Automations
          </TabBtn>
          <TabBtn active={tab === "variables"} onClick={() => setTab("variables")} icon={<Variable className="w-3.5 h-3.5" />}>
            Variables
          </TabBtn>
        </div>
      </div>
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {tab === "ai" && <AiAutomationsPanel />}
        {tab === "workflows" && <WorkflowsList />}
        {tab === "marketplace" && <TemplateMarketplace />}
        {tab === "variables" && <VariableManager />}
        {tab === "monitoring" && <WorkflowMonitoring />}
      </main>
    </>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
