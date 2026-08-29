import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

/**
 * Marketing server functions — queue-based fanout.
 *
 * The dispatcher worker (`/api/public/hooks/campaign-dispatch`) drains the
 * `campaign_dispatch_queue` table with row-level locking. Enqueue simply
 * materializes recipients + queue rows; the worker handles rate limiting,
 * retries, and provider I/O.
 */

const enqueueSchema = z.object({
  campaignId: z.string().uuid(),
  runAt: z.string().datetime().optional(),
});

export const enqueueCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => enqueueSchema.parse(v))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Any;
    const userId = context.userId;

    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status === "completed") {
      throw new Error("Cannot enqueue a completed campaign — duplicate it to send again");
    }
    if (campaign.status === "archived" || campaign.status === "cancelled") {
      throw new Error(`Cannot enqueue a ${campaign.status} campaign`);
    }
    // Running / scheduled campaigns may be re-enqueued to append newly
    // eligible recipients or reschedule pending queue rows. We dedupe
    // against existing campaign_recipients below so the same contact is
    // never queued twice.
    const isAppend = campaign.status === "running" || campaign.status === "scheduled";

    // Strict template variable validation — block enqueue when required
    // `{{tokens}}` are missing or malformed. Meta rejects the entire
    // template message when a positional placeholder is empty, so it's
    // cheaper to fail here than to burn recipients on guaranteed errors.
    if (campaign.template_id) {
      const { data: tpl } = await supabase
        .from("wa_templates")
        .select("components")
        .eq("id", campaign.template_id)
        .maybeSingle();
      if (tpl?.components) {
        const { validateTemplateVariables } = await import("./variable-validation");
        const { issues } = validateTemplateVariables(
          tpl.components,
          (campaign.template_variables ?? {}) as Record<string, string>,
        );
        if (issues.length > 0) {
          throw new Error(
            `Template variables invalid — ${issues[0].message}. Fix all ${issues.length} issue${issues.length === 1 ? "" : "s"} before sending.`,
          );
        }
      }
    }

    const wsId: string = campaign.workspace_id;
    let contactIds: string[] = [];

    if (campaign.segment_id) {
      const { data: rows, error } = await supabase
        .from("segment_members")
        .select("contact_id")
        .eq("segment_id", campaign.segment_id);
      if (error) throw error;
      contactIds = (rows ?? []).map((r: Any) => r.contact_id).filter(Boolean);
    } else {
      const { data: rows, error } = await supabase
        .from("contacts")
        .select("id")
        .eq("workspace_id", wsId)
        .limit(50000);
      if (error) throw error;
      contactIds = (rows ?? []).map((r: Any) => r.id);
    }
    if (contactIds.length === 0) return { ok: true, enqueued: 0 };

    const { data: consentRows } = await supabase
      .from("consent_records")
      .select("contact_id,status")
      .eq("workspace_id", wsId)
      .in("contact_id", contactIds);
    const optedOut = new Set(
      (consentRows ?? [])
        .filter((r: Any) => r.status === "opted_out" || r.status === "unsubscribed")
        .map((r: Any) => r.contact_id as string),
    );
    let targetIds = campaign.respect_opt_out
      ? contactIds.filter((id) => !optedOut.has(id))
      : contactIds;

    // Skip contacts already enqueued for this campaign — prevents duplicate
    // sends when re-enqueuing a running/scheduled campaign.
    if (isAppend && targetIds.length > 0) {
      const { data: existing } = await supabase
        .from("campaign_recipients")
        .select("contact_id")
        .eq("campaign_id", campaign.id)
        .in("contact_id", targetIds);
      const seen = new Set(((existing ?? []) as Any[]).map((r) => r.contact_id as string));
      targetIds = targetIds.filter((id) => !seen.has(id));
    }
    if (targetIds.length === 0) return { ok: true, enqueued: 0 };

    const { data: contacts, error: contactsErr } = await supabase
      .from("contacts")
      .select("id, phone, whatsapp, first_name, last_name")
      .in("id", targetIds);
    if (contactsErr) throw contactsErr;
    const contactList: Array<{ id: string; phone: string | null; whatsapp: string | null }> =
      (contacts ?? []) as Any;

    const { data: variants } = await supabase
      .from("campaign_ab_variants")
      .select("*")
      .eq("campaign_id", campaign.id);

    const runAtIso = data.runAt ?? campaign.scheduled_at ?? new Date().toISOString();

    const CHUNK = 500;
    let enqueued = 0;
    for (let i = 0; i < contactList.length; i += CHUNK) {
      const slice = contactList.slice(i, i + CHUNK);
      const recipientRows = slice.map((c) => ({
        campaign_id: campaign.id,
        contact_id: c.id,
        status: "queued",
      }));
      const { data: insertedRecipients, error: rErr } = await supabase
        .from("campaign_recipients")
        .insert(recipientRows as Any)
        .select("id, contact_id");
      if (rErr) throw rErr;

      const phoneById = new Map(slice.map((c) => [c.id, c.whatsapp || c.phone || null]));

      const queueRows = ((insertedRecipients ?? []) as Any[]).map((r) => {
        const variant = pickVariant((variants ?? []) as Any[]);
        return {
          workspace_id: wsId,
          campaign_id: campaign.id,
          recipient_id: r.id,
          variant_id: variant?.id ?? null,
          contact_id: r.contact_id,
          phone_number: phoneById.get(r.contact_id) ?? null,
          message_body: variant?.message_body ?? campaign.message_body,
          media_url: variant?.media_url ?? campaign.media_url,
          template_id: variant?.template_id ?? campaign.template_id,
          template_variables: variant?.template_variables ?? campaign.template_variables ?? {},
          priority: 5,
          run_at: runAtIso,
          status: "pending",
        };
      });
      if (queueRows.length > 0) {
        const { error: qErr } = await supabase
          .from("campaign_dispatch_queue")
          .insert(queueRows as Any);
        if (qErr) throw qErr;
        enqueued += queueRows.length;
      }
    }

    const nextStatus = new Date(runAtIso).getTime() > Date.now() ? "scheduled" : "running";
    const updatePayload: Any = isAppend
      ? {
          // Preserve started_at and total_recipients on append; increment total.
          status: nextStatus,
          total_recipients: (campaign.total_recipients ?? 0) + enqueued,
          scheduled_at: runAtIso,
        }
      : {
          status: nextStatus,
          total_recipients: enqueued,
          started_at: nextStatus === "running" ? new Date().toISOString() : null,
          scheduled_at: runAtIso,
        };
    await supabase.from("campaigns").update(updatePayload).eq("id", campaign.id);

    await supabase.from("campaign_events").insert({
      workspace_id: wsId,
      campaign_id: campaign.id,
      event_type: "enqueued",
      payload: { enqueued, actor: userId },
    } as Any);

    return { ok: true, enqueued };
  });

function pickVariant<T extends { weight: number }>(variants: T[]): T | null {
  if (variants.length === 0) return null;
  const total = variants.reduce((s, v) => s + Number(v.weight || 0), 0) || 1;
  const r = Math.random() * total;
  let acc = 0;
  for (const v of variants) {
    acc += Number(v.weight || 0);
    if (r <= acc) return v;
  }
  return variants[variants.length - 1];
}

const FAILED_STATUSES = ["failed", "error", "rejected", "undelivered"];

export const retryFailedRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) =>
    z
      .object({
        campaignId: z.string().uuid(),
        recipientIds: z.array(z.string().uuid()).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Any;
    const userId = context.userId;

    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!campaign) throw new Error("Campaign not found");

    let recQ = supabase
      .from("campaign_recipients")
      .select("id, contact_id, status")
      .eq("campaign_id", data.campaignId);
    if (data.recipientIds && data.recipientIds.length > 0) {
      recQ = recQ.in("id", data.recipientIds);
    } else {
      recQ = recQ.in("status", FAILED_STATUSES);
    }
    const { data: failed, error: fErr } = await recQ.limit(50000);
    if (fErr) throw fErr;

    const failedList = ((failed ?? []) as Any[]).filter((r) =>
      FAILED_STATUSES.includes(String(r.status ?? "").toLowerCase()),
    );
    if (failedList.length === 0) return { ok: true, retried: 0 };

    const contactIds = failedList.map((r) => r.contact_id).filter(Boolean);
    const { data: contacts, error: contactsErr } = await supabase
      .from("contacts")
      .select("id, phone, whatsapp")
      .in("id", contactIds);
    if (contactsErr) throw contactsErr;
    const phoneById = new Map(
      ((contacts ?? []) as Any[]).map((c) => [c.id, c.whatsapp || c.phone || null]),
    );

    const nowIso = new Date().toISOString();
    const wsId: string = campaign.workspace_id;

    // Reset recipient rows so the panel reflects the retry immediately.
    const failedIds = failedList.map((r) => r.id);
    const chunk = 500;
    for (let i = 0; i < failedIds.length; i += chunk) {
      const slice = failedIds.slice(i, i + chunk);
      await supabase
        .from("campaign_recipients")
        .update({
          status: "queued",
          error_code: null,
          error_message: null,
          failed_at: null,
        } as Any)
        .in("id", slice);
    }

    const queueRows = failedList.map((r) => ({
      workspace_id: wsId,
      campaign_id: campaign.id,
      recipient_id: r.id,
      contact_id: r.contact_id,
      phone_number: phoneById.get(r.contact_id) ?? null,
      message_body: campaign.message_body,
      media_url: campaign.media_url,
      template_id: campaign.template_id,
      template_variables: campaign.template_variables ?? {},
      priority: 3,
      run_at: nowIso,
      status: "pending",
    }));

    let enqueued = 0;
    for (let i = 0; i < queueRows.length; i += chunk) {
      const slice = queueRows.slice(i, i + chunk);
      const { error: qErr } = await supabase
        .from("campaign_dispatch_queue")
        .insert(slice as Any);
      if (qErr) throw qErr;
      enqueued += slice.length;
    }

    // Reopen the campaign so the dispatcher picks up the requeued rows.
    if (campaign.status === "completed" || campaign.status === "paused") {
      await supabase
        .from("campaigns")
        .update({ status: "running", completed_at: null } as Any)
        .eq("id", campaign.id);
    }

    await supabase.from("campaign_events").insert({
      workspace_id: wsId,
      campaign_id: campaign.id,
      event_type: "retry_failed",
      payload: { retried: enqueued, actor: userId },
    } as Any);

    return { ok: true, retried: enqueued };
  });

export const cancelCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ campaignId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Any;
    await supabase
      .from("campaign_dispatch_queue")
      .update({ status: "cancelled" } as Any)
      .eq("campaign_id", data.campaignId)
      .eq("status", "pending");
    await supabase
      .from("campaigns")
      .update({ status: "paused", completed_at: new Date().toISOString() } as Any)
      .eq("id", data.campaignId);
    return { ok: true };
  });

export const pauseCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ campaignId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await (context.supabase as Any)
      .from("campaigns")
      .update({ status: "paused" } as Any)
      .eq("id", data.campaignId);
    return { ok: true };
  });

export const resumeCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ campaignId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await (context.supabase as Any)
      .from("campaigns")
      .update({ status: "running" } as Any)
      .eq("id", data.campaignId);
    return { ok: true };
  });

export const duplicateCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ campaignId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Any;
    const { data: c, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (error) throw error;
    if (!c) throw new Error("Campaign not found");
    const strip = [
      "id",
      "created_at",
      "updated_at",
      "started_at",
      "completed_at",
      "total_recipients",
      "sent_count",
      "delivered_count",
      "read_count",
      "replied_count",
      "clicked_count",
      "failed_count",
      "opted_out_count",
    ];
    const rest: Any = { ...c };
    for (const k of strip) delete rest[k];
    const { data: dup, error: dupErr } = await supabase
      .from("campaigns")
      .insert({ ...rest, name: `${c.name} (copy)`, status: "draft" } as Any)
      .select()
      .single();
    if (dupErr) throw dupErr;
    return dup;
  });

export const recomputeSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ segmentId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Any;
    const { data: seg, error } = await supabase
      .from("customer_segments")
      .select("*")
      .eq("id", data.segmentId)
      .maybeSingle();
    if (error) throw error;
    if (!seg) throw new Error("Segment not found");

    let q = supabase.from("contacts").select("id").eq("workspace_id", seg.workspace_id);
    const filter = (seg.filter_definition ?? {}) as {
      conditions?: Array<{ field?: string; op?: string; value?: unknown }>;
    };
    for (const cond of filter.conditions ?? []) {
      if (cond.field === "tags" && cond.op === "contains" && Array.isArray(cond.value)) {
        q = q.contains("tags", cond.value as Any);
      }
    }
    const { data: rows, error: qErr } = await q.limit(100000);
    if (qErr) throw qErr;
    const ids = (rows ?? []).map((r: Any) => r.id as string);

    await supabase.from("segment_members").delete().eq("segment_id", seg.id);
    if (ids.length > 0) {
      const chunkSize = 1000;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize).map((cid: string) => ({
          segment_id: seg.id,
          contact_id: cid,
        }));
        await supabase.from("segment_members").insert(chunk as Any);
      }
    }
    await supabase
      .from("customer_segments")
      .update({ member_count: ids.length, last_computed_at: new Date().toISOString() } as Any)
      .eq("id", seg.id);

    return { ok: true, count: ids.length };
  });
