/**
 * Email channel account management — list, connect, update, disconnect.
 *
 * An "email account" is the sender identity a workspace uses in the inbox:
 * the from address emails go out as, plus (optionally) the inbound routing
 * address replies arrive on. Conversations link to it through
 * `conversations.metadata.account_id`, exactly like Telegram/Messenger, so
 * the Inbox selector can filter by a real account instead of a placeholder.
 *
 * Sending itself is handled by Lovable's managed email infrastructure; this
 * table only records which identity a workspace uses.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface EmailAccountSummary {
  id: string;
  provider: string;
  display_name: string;
  from_email: string;
  from_name: string | null;
  reply_to: string | null;
  inbound_address: string | null;
  status: string;
  status_reason: string | null;
  connected_at: string;
  last_verified_at: string | null;
}

const SELECT =
  "id, provider, display_name, from_email, from_name, reply_to, inbound_address, status, status_reason, connected_at, last_verified_at";

const emailField = z.string().trim().toLowerCase().email().max(255);

export const listEmailAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("email_accounts" as never)
      .select(SELECT)
      .eq("workspace_id", data.workspaceId)
      .order("connected_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { accounts: (rows ?? []) as unknown as EmailAccountSummary[] };
  });

export const connectEmailAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      workspaceId: string;
      displayName: string;
      fromEmail: string;
      fromName?: string | null;
      replyTo?: string | null;
      inboundAddress?: string | null;
      provider?: "lovable" | "smtp";
    }) =>
      z
        .object({
          workspaceId: z.string().uuid(),
          displayName: z.string().trim().min(1).max(120),
          fromEmail: emailField,
          fromName: z.string().trim().max(120).nullish(),
          replyTo: emailField.nullish(),
          inboundAddress: emailField.nullish(),
          provider: z.enum(["lovable", "smtp"]).default("lovable"),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    // RLS (workspace admin/owner) authorizes the write — no admin client.
    const { data: saved, error } = await context.supabase
      .from("email_accounts" as never)
      .insert({
        workspace_id: data.workspaceId,
        provider: data.provider ?? "lovable",
        display_name: data.displayName,
        from_email: data.fromEmail,
        from_name: data.fromName ?? null,
        reply_to: data.replyTo ?? null,
        inbound_address: data.inboundAddress ?? null,
        status: "connected",
        connected_by: context.userId,
        last_verified_at: new Date().toISOString(),
      } as never)
      .select(SELECT)
      .maybeSingle();

    if (error) {
      if (String(error.message).toLowerCase().includes("duplicate")) {
        throw new Error("That sender address is already connected in this workspace.");
      }
      throw new Error(error.message);
    }
    return { account: saved as unknown as EmailAccountSummary };
  });

export const updateEmailAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      displayName?: string;
      fromName?: string | null;
      replyTo?: string | null;
      inboundAddress?: string | null;
      status?: "connected" | "disconnected";
    }) =>
      z
        .object({
          id: z.string().uuid(),
          displayName: z.string().trim().min(1).max(120).optional(),
          fromName: z.string().trim().max(120).nullish(),
          replyTo: emailField.nullish(),
          inboundAddress: emailField.nullish(),
          status: z.enum(["connected", "disconnected"]).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.displayName !== undefined) patch.display_name = data.displayName;
    if (data.fromName !== undefined) patch.from_name = data.fromName;
    if (data.replyTo !== undefined) patch.reply_to = data.replyTo;
    if (data.inboundAddress !== undefined) patch.inbound_address = data.inboundAddress;
    if (data.status !== undefined) {
      patch.status = data.status;
      patch.status_reason = data.status === "disconnected" ? "Disabled by an administrator" : null;
    }

    const { data: saved, error } = await context.supabase
      .from("email_accounts" as never)
      .update(patch as never)
      .eq("id", data.id)
      .select(SELECT)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!saved) throw new Error("Email account not found, or you cannot manage it.");
    return { account: saved as unknown as EmailAccountSummary };
  });

export const deleteEmailAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("email_accounts" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
