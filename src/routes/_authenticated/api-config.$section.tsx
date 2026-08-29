import { Brand } from "@/components/brand";
import type React from "react";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { cn } from "@/lib/utils";
import {
  API_CONFIG_SECTIONS, DEFAULT_API_CONFIG_SECTION, getApiConfigSection, isApiConfigSection,
} from "@/components/app/settings/api-config-sections";
import { WhatsAppRestApiPanel } from "@/components/app/whatsapp/whatsapp-rest-api-panel";
import { WhatsAppConversationalApiPanel } from "@/components/app/whatsapp/whatsapp-conversational-api-panel";
import { WhatsAppTemplateApiPanel } from "@/components/app/whatsapp/whatsapp-template-api-panel";
import { WhatsAppApiDashboardPanel } from "@/components/app/whatsapp/whatsapp-api-dashboard-panel";
import { WhatsAppQrPanel } from "@/components/app/whatsapp/whatsapp-qr-panel";
import { WhatsAppDevicesPanel } from "@/components/app/whatsapp/whatsapp-devices-panel";
import { WhatsAppWarmerPanel } from "@/components/app/whatsapp/whatsapp-warmer-panel";
import { WhatsAppAccountsPanel } from "@/components/app/whatsapp/whatsapp-accounts-panel";
import { WhatsAppTemplatesPanel } from "@/components/app/whatsapp/whatsapp-templates-panel";
import { SyncDashboard } from "@/components/app/whatsapp/sync-dashboard";
import { WhatsAppIntegrationHealth } from "@/components/app/whatsapp/integration-health";
import { AiSettingsPanel } from "@/components/app/ai/ai-settings-panel";
import { InstagramAccountsPanel } from "@/components/app/instagram/instagram-accounts-panel";
import { InstagramChatbotsPanel } from "@/components/app/instagram/instagram-chatbots-panel";
import { InstagramCommentAutomationsPanel } from "@/components/app/instagram/instagram-comment-automations-panel";
import { MetaAppSettingsPanel } from "@/components/app/messenger/meta-app-settings-panel";
import { MessengerAccountsPanel } from "@/components/app/messenger/messenger-accounts-panel";
import { MessengerChatbotsPanel } from "@/components/app/messenger/messenger-chatbots-panel";
import { TelegramAccountsPanel } from "@/components/app/telegram/telegram-accounts-panel";
import { EmailAccountsPanel } from "@/components/app/email/email-accounts-panel";
import { SmsAccountsPanel } from "@/components/app/sms/sms-accounts-panel";
import { WhatsAppFormsPanel } from "@/components/app/whatsapp/whatsapp-forms-panel";
import { WhatsAppWebhookPanel } from "@/components/app/whatsapp/whatsapp-webhook-panel";
import { ApiKeysManager } from "@/components/app/developer/api-keys-manager";

export const Route = createFileRoute("/_authenticated/api-config/$section")({
  beforeLoad: ({ params }) => {
    if (!isApiConfigSection(params.section)) {
      throw redirect({ to: "/api-config/$section", params: { section: DEFAULT_API_CONFIG_SECTION } });
    }
  },
  head: ({ params }) => {
    const section = getApiConfigSection(params.section);
    const title = `${section?.label ?? "API Configurations"} — API Configurations`;
    const description = section?.description ?? "Configure channels, providers and API access for your workspace.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: ApiConfigPage,
});

function ProviderRegistryPanel() {
  return (
    <div className="space-y-4">
      <h2 className="font-bold text-2xl">Provider registry</h2>
      <p className="text-sm text-muted-foreground">
        <Brand /> routes every conversation through a provider abstraction. Meta WhatsApp Cloud API ships
        enabled; Twilio and 360dialog slots are reserved.
      </p>
      <div className="grid gap-3">
        {[
          { name: "Meta WhatsApp Cloud API", status: "Enabled", desc: "Official Cloud API — configure accounts in the WhatsApp Accounts tab." },
          { name: "Twilio WhatsApp", status: "Reserved", desc: "Provider slot ready for a future implementation." },
          { name: "360dialog", status: "Reserved", desc: "Provider slot ready for a future implementation." },
          { name: "Mock provider", status: "Testing only", desc: "Simulates delivery for local development." },
        ].map((p) => (
          <div key={p.name} className="flex items-center justify-between rounded-md border border-border p-4">
            <div>
              <div className="font-medium text-sm">{p.name}</div>
              <div className="text-xs text-muted-foreground">{p.desc}</div>
            </div>
            <span className={`text-xs px-2 py-1 rounded-sm ${p.status === "Enabled" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
              {p.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApiKeysPanel() {
  return (
    <div className="space-y-4">
      <h2 className="font-bold text-2xl">API keys</h2>
      <p className="text-sm text-muted-foreground">Generate keys for programmatic access to your workspace.</p>
      <ApiKeysManager />
    </div>
  );
}

/** Panel renderer per section id — keys must match API_CONFIG_SECTIONS. */
const PANELS: Record<string, React.ComponentType> = {
  "ai": AiSettingsPanel,
  "wa-health": WhatsAppIntegrationHealth,
  "whatsapp": WhatsAppAccountsPanel,
  "wa-webhook": WhatsAppWebhookPanel,
  "wa-qr": WhatsAppQrPanel,
  "wa-devices": WhatsAppDevicesPanel,
  "wa-warmer": WhatsAppWarmerPanel,
  "instagram": InstagramAccountsPanel,
  "instagram-bot": InstagramChatbotsPanel,
  "instagram-comments": InstagramCommentAutomationsPanel,
  "meta-app": MetaAppSettingsPanel,
  "messenger": MessengerAccountsPanel,
  "messenger-bot": MessengerChatbotsPanel,
  "telegram": TelegramAccountsPanel,
  "email": EmailAccountsPanel,
  "sms": SmsAccountsPanel,
  "wa-forms": WhatsAppFormsPanel,
  "wa-rest": WhatsAppRestApiPanel,
  "wa-conversational": WhatsAppConversationalApiPanel,
  "wa-template-api": WhatsAppTemplateApiPanel,
  "wa-api-dashboard": WhatsAppApiDashboardPanel,
  "templates": WhatsAppTemplatesPanel,
  "sync": SyncDashboard,
  "provider": ProviderRegistryPanel,
  "api": ApiKeysPanel,
} as unknown as Record<string, React.ComponentType>;

function ApiConfigPage() {
  const { section } = Route.useParams();
  const current = getApiConfigSection(section);
  const Panel = PANELS[section] ?? PANELS[DEFAULT_API_CONFIG_SECTION];

  return (
    <>
      <AppTopbar
        title={current?.label ?? "API Configurations"}
        subtitle={current?.description ?? "Channels, providers and API access"}
      />
      <main className="p-6 max-w-7xl mx-auto w-full flex flex-col md:flex-row gap-6">
        <nav className="md:w-56 space-y-1 shrink-0" aria-label="API configurations">
          <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            API Configurations
          </div>
          {API_CONFIG_SECTIONS.map((s) => (
            <Link
              key={s.id}
              to="/api-config/$section"
              params={{ section: s.id }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-left transition-colors",
                section === s.id ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground/80",
              )}
              aria-current={section === s.id ? "page" : undefined}
            >
              <s.icon className="w-4 h-4 shrink-0" /> {s.label}
            </Link>
          ))}
        </nav>

        <div className="flex-1 min-w-0 rounded-xl border border-border bg-surface shadow-sm p-6">
          <Panel />
        </div>
      </main>
    </>
  );
}
