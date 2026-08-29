/**
 * Lovable managed email event webhook.
 *
 * Path is a platform contract: hooks are registered at publish time only when
 * this exact file exists. Signature verification (`X-Lovable-Signature`, signed
 * with the project's LOVABLE_API_KEY) is performed by the SDK handler — never
 * hand-roll it and never place auth middleware in front of this route.
 *
 * Every delivery is additionally claimed in `inbound_webhook_deliveries` on the
 * event id so redeliveries (up to 5 retries with backoff) are ignored.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createEmailWebhookHandler } from "@lovable.dev/email-js";

type EmailEvent = {
  event_id?: string;
  data: { event?: string; recipient?: string; message_id?: string };
};

/** Claim + log the event once; returns false when it is a redelivery. */
async function claimEmailEvent(kind: string, event: EmailEvent): Promise<boolean> {
  const { claimWebhookDelivery, completeWebhookDelivery } = await import(
    "@/lib/webhooks/idempotency.server"
  );
  const key =
    event.event_id ??
    `${kind}:${event.data?.message_id ?? ""}:${event.data?.recipient ?? ""}`;
  const claim = await claimWebhookDelivery({
    provider: "email",
    deliveryKey: key,
    payload: { kind, ...event.data },
  });
  if (!claim.fresh) return false;
  await completeWebhookDelivery(claim.id, "processed");
  return true;
}

type WebhookHandler = (request: Request) => Promise<Response> | Response;

let cachedHandler: WebhookHandler | undefined;

/**
 * Built lazily: `createEmailWebhookHandler` throws when LOVABLE_API_KEY is
 * absent (self-hosted deployments), and at module scope that throw takes down
 * the whole SSR entry with a catastrophic 500 on every route.
 */
function getHandler(): WebhookHandler | undefined {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return undefined;
  if (cachedHandler) return cachedHandler;
  cachedHandler = createEmailWebhookHandler({
    apiKey,
    on: {
    "email.bounced": async (event) => {
      await claimEmailEvent("email.bounced", event as EmailEvent);
    },
    "email.complaint": async (event) => {
      await claimEmailEvent("email.complaint", event as EmailEvent);
    },
    "email.unsubscribed": async (event) => {
      await claimEmailEvent("email.unsubscribed", event as EmailEvent);
    },
    "email.resubscribed": async (event) => {
      await claimEmailEvent("email.resubscribed", event as EmailEvent);
    },
    },
  });
  return cachedHandler;
}

export const Route = createFileRoute("/lovable/email/events")({
  server: {
    handlers: {
      POST: ({ request }) => {
        const handler = getHandler();
        if (!handler) {
          return new Response("Email webhooks are not configured", { status: 503 });
        }
        return handler(request);
      },
    },
  },
});
