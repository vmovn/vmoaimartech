import { createFileRoute } from "@tanstack/react-router";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { WhatsAppIntegrationStatus } from "@/components/app/whatsapp/whatsapp-integration-status";
import { WhatsAppHealthChecks } from "@/components/app/whatsapp/whatsapp-health-checks";

import { WhatsAppSecretsChecklist } from "@/components/app/whatsapp/whatsapp-secrets-checklist";
import { WhatsAppWebhookPanel } from "@/components/app/whatsapp/whatsapp-webhook-panel";
import { WhatsAppWebhookDeliveries } from "@/components/app/whatsapp/whatsapp-webhook-deliveries";
import { WhatsAppDeadLetterQueue } from "@/components/app/whatsapp/whatsapp-dead-letter-queue";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/whatsapp-status")({
  head: () => ({
    meta: [
      { title: "WhatsApp Status — Webhooks & Deliveries" },
      {
        name: "description",
        content:
          "Live WhatsApp webhook configuration, subscribed fields, verify tokens, and the most recent webhook delivery results.",
      },
      { property: "og:title", content: "WhatsApp Status — Webhooks & Deliveries" },
      {
        property: "og:description",
        content: "Callback URL, subscription fields, and recent inbound webhook envelopes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminPageShell
      title="WhatsApp Status"
      description="Webhook configuration, subscription fields, and the latest delivery results for connected WhatsApp Cloud accounts."
    >
      <div className="space-y-8">
        <WhatsAppIntegrationStatus />
        <WhatsAppHealthChecks />

        <WhatsAppSecretsChecklist />
        <WhatsAppWebhookPanel />
        <WhatsAppWebhookDeliveries limit={25} />
        <WhatsAppDeadLetterQueue limit={50} />
      </div>
    </AdminPageShell>
  ),
});
