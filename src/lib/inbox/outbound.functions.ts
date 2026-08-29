/**
 * Client-callable outbound delivery for the Inbox composer.
 * Thin wrapper — all logic lives in `outbound.server.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DeliverSchema = z.object({ messageId: z.string().uuid() });

export const deliverOutboundMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeliverSchema.parse(input))
  .handler(async ({ data, context }) => {
    // RLS check: the caller must be able to see the message in their workspace.
    const { data: visible, error } = await context.supabase
      .from("messages")
      .select("id")
      .eq("id", data.messageId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!visible) throw new Error("Message not found");

    const { deliverInboxMessage } = await import("@/lib/inbox/outbound.server");
    return deliverInboxMessage({ messageId: data.messageId, userId: context.userId });
  });

const ResumeSchema = z.object({ conversationId: z.string().uuid() });

/** Re-deliver messages left stuck at `queued` (e.g. a dropped send request). */
export const resumeQueuedMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ResumeSchema.parse(input))
  .handler(async ({ data, context }) => {
    // RLS check: caller must be able to see the conversation in their workspace.
    const { data: visible, error } = await context.supabase
      .from("conversations")
      .select("id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!visible) throw new Error("Conversation not found");

    const { deliverQueuedMessages } = await import("@/lib/inbox/outbound.server");
    return deliverQueuedMessages({ conversationId: data.conversationId, userId: context.userId });
  });
