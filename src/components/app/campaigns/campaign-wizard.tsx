import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Sparkles,
  Target,
  Users,
  FileText,
  Eye,
  CalendarClock,
  Send,
  Check,
  ChevronRight,
  ChevronLeft,
  Upload,
  Repeat,
  ShieldCheck,
  Image as ImageIcon,
  X,
  Rocket,
  Loader2,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useUpsertCampaign, useSegments, type CampaignRow } from "@/hooks/use-marketing";
import { useContactLists, useCampaignTemplates } from "@/hooks/use-marketing-extras";
import { enqueueCampaign } from "@/lib/marketing/marketing.functions";
import { cn } from "@/lib/utils";
import { DateTimePicker, fromLocalDateTimeString, toLocalDateTimeString } from "@/shared/components";

/* eslint-disable @typescript-eslint/no-explicit-any */

const STEPS = [
  { id: "basics", label: "Basics", icon: Sparkles },
  { id: "audience", label: "Audience", icon: Users },
  { id: "message", label: "Message", icon: FileText },
  { id: "preview", label: "Preview", icon: Eye },
  { id: "schedule", label: "Schedule", icon: CalendarClock },
  { id: "review", label: "Review", icon: Rocket },
] as const;

const GOALS = [
  { id: "awareness", label: "Awareness", desc: "Announce news or product updates", icon: "📣" },
  { id: "engagement", label: "Engagement", desc: "Drive replies and conversations", icon: "💬" },
  { id: "conversion", label: "Conversion", desc: "Turn contacts into customers", icon: "🛒" },
  { id: "retention", label: "Retention", desc: "Re-engage inactive customers", icon: "❤️" },
  { id: "transactional", label: "Transactional", desc: "Order, delivery, or booking updates", icon: "📦" },
] as const;

type FormState = {
  name: string;
  description: string;
  goal: string;
  segment_id: string;
  contact_list_id: string;
  template_id: string;
  message_body: string;
  media_url: string;
  variables: Record<string, string>;
  send_mode: "now" | "schedule";
  scheduled_at: string;
  is_recurring: boolean;
  recurrence_freq: "daily" | "weekly" | "monthly";
  recurrence_interval: number;
  throttle_per_minute: number;
  requires_approval: boolean;
  respect_opt_out: boolean;
};

const EMPTY: FormState = {
  name: "",
  description: "",
  goal: "",
  segment_id: "",
  contact_list_id: "",
  template_id: "",
  message_body: "",
  media_url: "",
  variables: {},
  send_mode: "now",
  scheduled_at: "",
  is_recurring: false,
  recurrence_freq: "weekly",
  recurrence_interval: 1,
  throttle_per_minute: 60,
  requires_approval: false,
  respect_opt_out: true,
};

export function CampaignWizard({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Partial<CampaignRow>;
}) {
  const { active } = useCurrentWorkspace();
  const upsert = useUpsertCampaign();
  const enqueue = useServerFn(enqueueCampaign);
  const { data: segments } = useSegments();
  const { data: lists } = useContactLists();
  const { data: templates } = useCampaignTemplates();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState<"draft" | "launch" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    if (open) {
      setStep(0);
      setForm({
        ...EMPTY,
        name: initial?.name ?? "",
        description: (initial as any)?.description ?? "",
        goal: (initial as any)?.goal ?? "",
        segment_id: (initial as any)?.segment_id ?? "",
        contact_list_id: (initial as any)?.contact_list_id ?? "",
        template_id: (initial as any)?.template_id ?? "",
        message_body: initial?.message_body ?? "",
        media_url: (initial as any)?.media_url ?? "",
        variables: ((initial as any)?.template_variables as Record<string, string>) ?? {},
        throttle_per_minute: (initial as any)?.throttle_per_minute ?? 60,
        respect_opt_out: (initial as any)?.respect_opt_out ?? true,
        is_recurring: (initial as any)?.is_recurring ?? false,
      });
    }
  }, [open, initial]);

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  const detectedVars = useMemo(() => {
    const set = new Set<string>();
    const re = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
    let m;
    while ((m = re.exec(form.message_body)) !== null) set.add(m[1]);
    return Array.from(set);
  }, [form.message_body]);

  const audienceLabel = useMemo(() => {
    if (form.contact_list_id) {
      const l = lists?.find((x) => x.id === form.contact_list_id);
      return l ? `List · ${l.name} (${l.member_count})` : "List";
    }
    if (form.segment_id) {
      const s = segments?.find((x) => x.id === form.segment_id);
      return s ? `Segment · ${s.name} (${s.member_count})` : "Segment";
    }
    return "All contacts in workspace";
  }, [form.contact_list_id, form.segment_id, lists, segments]);

  const canNext = (() => {
    if (step === 0) return form.name.trim().length > 1 && !!form.goal;
    if (step === 2) return form.message_body.trim().length > 0;
    if (step === 4)
      return form.send_mode === "now" || (form.send_mode === "schedule" && !!form.scheduled_at);
    return true;
  })();

  const buildPayload = (status: "draft" | "scheduled" | "running"): Partial<CampaignRow> => {
    const scheduled_at =
      form.send_mode === "schedule" && form.scheduled_at
        ? new Date(form.scheduled_at).toISOString()
        : null;
    return {
      name: form.name.trim(),
      description: form.description.trim() || null,
      message_body: form.message_body,
      segment_id: form.segment_id || null,
      template_id: form.template_id || null,
      template_variables: form.variables as any,
      media_url: form.media_url || null,
      scheduled_at,
      throttle_per_minute: form.throttle_per_minute,
      respect_opt_out: form.respect_opt_out,
      status,
      type: "broadcast",
      channel: "whatsapp",
      // custom fields
      goal: form.goal,
      contact_list_id: form.contact_list_id || null,
      is_recurring: form.is_recurring,
      recurrence_rule: form.is_recurring
        ? { freq: form.recurrence_freq, interval: form.recurrence_interval }
        : null,
      approval_status: form.requires_approval ? "pending" : "not_required",
    } as any;
  };

  async function handleUpload(file: File) {
    if (!active) return;
    setUploading(true);
    try {
      const key = `${active.id}/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from("campaign-media").upload(key, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const { data: signed } = await supabase.storage
        .from("campaign-media")
        .createSignedUrl(key, 60 * 60 * 24 * 7);
      patch({ media_url: signed?.signedUrl ?? "" });
      toast.success("Media uploaded");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function saveDraft() {
    setSaving("draft");
    try {
      await upsert.mutateAsync({ id: (initial as any)?.id, ...buildPayload("draft") });
      toast.success("Saved as draft");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(null);
    }
  }

  async function launch() {
    setSaving("launch");
    try {
      const status = form.requires_approval
        ? "draft"
        : form.send_mode === "now"
          ? "running"
          : "scheduled";
      const saved = await upsert.mutateAsync({
        id: (initial as any)?.id,
        ...buildPayload(status),
      });
      if (!form.requires_approval && form.send_mode === "now") {
        await enqueue({ data: { campaignId: saved.id } });
        toast.success("Campaign launched — dispatching now");
      } else if (form.requires_approval) {
        toast.success("Submitted for approval");
      } else {
        toast.success("Campaign scheduled");
      }
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to launch");
    } finally {
      setSaving(null);
    }
  }

  const rendered = useMemo(() => {
    let out = form.message_body;
    for (const [k, v] of Object.entries(form.variables))
      out = out.replaceAll(`{{${k}}}`, v || `{{${k}}}`);
    return out || "Your message will appear here…";
  }, [form.message_body, form.variables]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl p-0 gap-0 overflow-hidden bg-background">
        <div className="grid md:grid-cols-[240px_1fr] min-h-[620px]">
          {/* Rail */}
          <aside className="hidden md:flex flex-col gap-1 p-5 border-r border-border bg-gradient-to-br from-primary/5 via-accent/5 to-transparent">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary grid place-items-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold">New Campaign</div>
                <div className="text-[11px] text-muted-foreground">Broadcast wizard</div>
              </div>
            </div>
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = i < step;
              const active = i === step;
              return (
                <button
                  key={s.id}
                  onClick={() => (i <= step ? setStep(i) : null)}
                  disabled={i > step}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-left transition-all",
                    active && "bg-primary text-primary-foreground shadow-sm",
                    !active && done && "text-foreground hover:bg-muted",
                    !active && !done && "text-muted-foreground",
                  )}
                >
                  <div
                    className={cn(
                      "w-7 h-7 rounded-md grid place-items-center transition",
                      active && "bg-primary-foreground/20",
                      !active && done && "bg-success/15 text-success",
                      !active && !done && "bg-muted",
                    )}
                  >
                    {done ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  </div>
                  <span className="font-medium">{s.label}</span>
                </button>
              );
            })}
            <div className="mt-auto pt-6 text-[11px] text-muted-foreground leading-relaxed">
              Drafts autosave. You can go back at any time before launching.
            </div>
          </aside>

          {/* Body */}
          <div className="flex flex-col">
            <header className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Step {step + 1} of {STEPS.length}
                </div>
                <div className="text-lg font-semibold">{STEPS[step].label}</div>
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="p-2 rounded-md hover:bg-muted text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-6 animate-in fade-in slide-in-from-bottom-2 duration-300" key={step}>
              {step === 0 && (
                <div className="space-y-5 max-w-2xl">
                  <Field label="Campaign name" required>
                    <input
                      className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                      placeholder="e.g. Black Friday · Early Access"
                      value={form.name}
                      onChange={(e) => patch({ name: e.target.value })}
                      autoFocus
                    />
                  </Field>
                  <Field label="Description" hint="Optional — visible only to your team">
                    <textarea
                      className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm min-h-[80px] focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                      placeholder="What is this campaign about?"
                      value={form.description}
                      onChange={(e) => patch({ description: e.target.value })}
                    />
                  </Field>
                  <Field label="Campaign goal" required>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {GOALS.map((g) => (
                        <button
                          key={g.id}
                          onClick={() => patch({ goal: g.id })}
                          className={cn(
                            "text-left p-3 rounded-xl border transition-all flex items-start gap-3",
                            form.goal === g.id
                              ? "border-primary bg-primary/5 shadow-sm ring-2 ring-primary/20"
                              : "border-border hover:border-primary/40 hover:bg-muted/40",
                          )}
                        >
                          <div className="text-2xl leading-none">{g.icon}</div>
                          <div>
                            <div className="text-sm font-medium flex items-center gap-1.5">
                              {g.label}
                              {form.goal === g.id && <Check className="w-3.5 h-3.5 text-primary" />}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">{g.desc}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4 max-w-2xl">
                  <div className="rounded-xl border border-border p-4 bg-surface flex items-start gap-3">
                    <Target className="w-4 h-4 text-primary mt-0.5" />
                    <div className="text-sm">
                      <div className="font-medium">Reach</div>
                      <div className="text-muted-foreground">
                        {audienceLabel}. Contacts who opted out will be skipped automatically.
                      </div>
                    </div>
                  </div>

                  <Field label="Contact List">
                    <select
                      className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm"
                      value={form.contact_list_id}
                      onChange={(e) => patch({ contact_list_id: e.target.value, segment_id: "" })}
                    >
                      <option value="">— None —</option>
                      {(lists ?? []).map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} · {l.member_count.toLocaleString()} members
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Segment" hint="Dynamic audience by tag, status, geography, etc.">
                    <select
                      className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm"
                      value={form.segment_id}
                      onChange={(e) => patch({ segment_id: e.target.value, contact_list_id: "" })}
                    >
                      <option value="">— None —</option>
                      {(segments ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} · {s.member_count.toLocaleString()} members
                        </option>
                      ))}
                    </select>
                  </Field>

                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={form.respect_opt_out}
                      onChange={(e) => patch({ respect_opt_out: e.target.checked })}
                    />
                    Respect opt-outs (recommended)
                  </label>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4 max-w-2xl">
                  <Field label="Start from template" hint="Optional — pre-fill message and variables">
                    <select
                      className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm"
                      value={form.template_id}
                      onChange={(e) => {
                        const t = templates?.find((x) => x.id === e.target.value);
                        patch({
                          template_id: e.target.value,
                          message_body: t?.message_body ?? form.message_body,
                          media_url: t?.media_url ?? form.media_url,
                        });
                      }}
                    >
                      <option value="">— Blank —</option>
                      {(templates ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} {t.category ? `· ${t.category}` : ""}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Message body" required hint="Use {{first_name}}, {{company}}, … for personalization">
                    <textarea
                      className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm min-h-[160px] font-mono focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                      placeholder="Hi {{first_name}}, we thought you'd love our new collection…"
                      value={form.message_body}
                      onChange={(e) => patch({ message_body: e.target.value })}
                    />
                    <div className="flex items-center justify-between mt-1">
                      <div className="text-[11px] text-muted-foreground">
                        {form.message_body.length} chars
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {["first_name", "last_name", "company", "email"].map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() =>
                              patch({ message_body: form.message_body + ` {{${v}}}` })
                            }
                            className="text-[11px] px-2 py-0.5 rounded-sm bg-muted hover:bg-muted/70"
                          >
                            {`{{${v}}}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </Field>

                  {detectedVars.length > 0 && (
                    <Field label="Variable defaults" hint="Used if a contact has no value">
                      <div className="grid grid-cols-2 gap-2">
                        {detectedVars.map((v) => (
                          <div key={v} className="flex items-center gap-2">
                            <code className="text-[11px] px-2 py-1 rounded bg-muted whitespace-nowrap">
                              {`{{${v}}}`}
                            </code>
                            <input
                              className="flex-1 px-2 py-1.5 rounded-md border border-border bg-background text-sm"
                              placeholder="Default value"
                              value={form.variables[v] ?? ""}
                              onChange={(e) =>
                                patch({
                                  variables: { ...form.variables, [v]: e.target.value },
                                })
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </Field>
                  )}

                  <Field label="Media" hint="Optional image, video, or document">
                    <div className="flex gap-2 items-center">
                      <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background text-sm cursor-pointer hover:bg-muted">
                        {uploading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        Upload
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*,video/*,application/pdf"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUpload(f);
                          }}
                        />
                      </label>
                      <input
                        className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                        placeholder="…or paste a URL"
                        value={form.media_url}
                        onChange={(e) => patch({ media_url: e.target.value })}
                      />
                      {form.media_url && (
                        <button
                          onClick={() => patch({ media_url: "" })}
                          className="p-2 rounded-md hover:bg-muted text-muted-foreground"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </Field>
                </div>
              )}

              {step === 3 && (
                <div className="grid md:grid-cols-2 gap-6 max-w-3xl">
                  <div>
                    <div className="text-sm font-medium mb-3">Live preview</div>
                    <div className="rounded-2xl bg-[#e5ddd5] dark:bg-muted p-4 shadow-inner min-h-[320px] relative overflow-hidden">
                      <div className="absolute inset-0 opacity-30 pointer-events-none bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.15)_1px,transparent_0)] [background-size:14px_14px]" />
                      <div className="relative max-w-[85%] ml-auto animate-in slide-in-from-bottom-2 duration-300">
                        <div className="bg-[#d9fdd3] dark:bg-primary/20 rounded-2xl rounded-tr-sm px-3 py-2 shadow-sm">
                          {form.media_url && (
                            <div className="mb-2 rounded-lg overflow-hidden bg-black/5">
                              {/\.(mp4|mov|webm)$/i.test(form.media_url) ? (
                                <video src={form.media_url} className="w-full h-40 object-cover" />
                              ) : (
                                <img
                                  src={form.media_url}
                                  alt="preview"
                                  className="w-full h-40 object-cover"
                                  onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                                />
                              )}
                            </div>
                          )}
                          <div className="text-sm whitespace-pre-wrap break-words text-foreground">
                            {rendered}
                          </div>
                          <div className="text-[11px] text-muted-foreground text-right mt-1">
                            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ✓✓
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="text-sm font-medium">Summary</div>
                    <SummaryRow icon={<Target className="w-4 h-4" />} label="Goal" value={GOALS.find((g) => g.id === form.goal)?.label ?? "—"} />
                    <SummaryRow icon={<Users className="w-4 h-4" />} label="Audience" value={audienceLabel} />
                    <SummaryRow
                      icon={<ImageIcon className="w-4 h-4" />}
                      label="Media"
                      value={form.media_url ? "Attached" : "None"}
                    />
                    <SummaryRow
                      icon={<FileText className="w-4 h-4" />}
                      label="Variables"
                      value={detectedVars.length ? detectedVars.join(", ") : "None"}
                    />
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-5 max-w-2xl">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <ChoiceCard
                      icon={<Send className="w-4 h-4" />}
                      active={form.send_mode === "now"}
                      onClick={() => patch({ send_mode: "now" })}
                      title="Send immediately"
                      desc="Dispatch as soon as you launch"
                    />
                    <ChoiceCard
                      icon={<CalendarClock className="w-4 h-4" />}
                      active={form.send_mode === "schedule"}
                      onClick={() => patch({ send_mode: "schedule" })}
                      title="Schedule for later"
                      desc="Pick a date and time"
                    />
                  </div>

                  {form.send_mode === "schedule" && (
                    <Field label="Send at" required>
                      <DateTimePicker
                        value={fromLocalDateTimeString(form.scheduled_at)}
                        onChange={(d) => patch({ scheduled_at: toLocalDateTimeString(d) })}
                      />
                    </Field>
                  )}

                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Repeat className="w-4 h-4 text-primary" />
                        <div>
                          <div className="text-sm font-medium">Recurring campaign</div>
                          <div className="text-xs text-muted-foreground">
                            Automatically re-run on a schedule
                          </div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={form.is_recurring}
                        onChange={(e) => patch({ is_recurring: e.target.checked })}
                        className="h-4 w-4"
                      />
                    </label>
                    {form.is_recurring && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-sm text-muted-foreground">Every</span>
                        <input
                          type="number"
                          min={1}
                          className="w-20 px-2 py-1.5 rounded-md border border-border bg-background text-sm"
                          value={form.recurrence_interval}
                          onChange={(e) => patch({ recurrence_interval: Number(e.target.value) })}
                        />
                        <select
                          className="px-2 py-1.5 rounded-md border border-border bg-background text-sm"
                          value={form.recurrence_freq}
                          onChange={(e) => patch({ recurrence_freq: e.target.value as any })}
                        >
                          <option value="daily">day(s)</option>
                          <option value="weekly">week(s)</option>
                          <option value="monthly">month(s)</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <Field label="Throttle" hint="Messages per minute — keeps deliverability healthy">
                    <input
                      type="number"
                      min={1}
                      max={600}
                      className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm"
                      value={form.throttle_per_minute}
                      onChange={(e) => patch({ throttle_per_minute: Number(e.target.value) })}
                    />
                  </Field>

                  <label className="flex items-center gap-3 rounded-xl border border-border p-4 cursor-pointer">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">Require approval before sending</div>
                      <div className="text-xs text-muted-foreground">
                        A teammate must approve this campaign before dispatch
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={form.requires_approval}
                      onChange={(e) => patch({ requires_approval: e.target.checked })}
                      className="h-4 w-4"
                    />
                  </label>
                </div>
              )}

              {step === 5 && (
                <div className="max-w-2xl space-y-4">
                  <div className="rounded-2xl border border-border overflow-hidden">
                    <div className="p-5 bg-gradient-to-br from-primary/10 to-accent/5">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">
                        Ready to launch
                      </div>
                      <div className="text-xl font-semibold mt-1">{form.name || "Untitled campaign"}</div>
                      {form.description && (
                        <div className="text-sm text-muted-foreground mt-1">{form.description}</div>
                      )}
                    </div>
                    <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      <ReviewRow k="Goal" v={GOALS.find((g) => g.id === form.goal)?.label ?? "—"} />
                      <ReviewRow k="Audience" v={audienceLabel} />
                      <ReviewRow
                        k="Send"
                        v={form.send_mode === "now" ? "Immediately" : new Date(form.scheduled_at).toLocaleString()}
                      />
                      <ReviewRow
                        k="Recurring"
                        v={
                          form.is_recurring
                            ? `Every ${form.recurrence_interval} ${form.recurrence_freq}`
                            : "No"
                        }
                      />
                      <ReviewRow k="Throttle" v={`${form.throttle_per_minute}/min`} />
                      <ReviewRow k="Approval" v={form.requires_approval ? "Required" : "Not required"} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <footer className="flex items-center justify-between px-6 py-4 border-t border-border bg-surface/50">
              <button
                onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted"
              >
                <ChevronLeft className="w-4 h-4" />
                {step === 0 ? "Cancel" : "Back"}
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={saveDraft}
                  disabled={!form.name || saving !== null}
                  className="px-3 py-2 rounded-md text-sm border border-border hover:bg-muted disabled:opacity-50"
                >
                  {saving === "draft" ? "Saving…" : "Save draft"}
                </button>
                {step < STEPS.length - 1 ? (
                  <button
                    onClick={() => setStep(step + 1)}
                    disabled={!canNext}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shadow-sm"
                  >
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={launch}
                    disabled={saving !== null}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shadow-sm"
                  >
                    {saving === "launch" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Rocket className="w-4 h-4" />
                    )}
                    {form.requires_approval
                      ? "Submit for approval"
                      : form.send_mode === "now"
                        ? "Launch now"
                        : "Schedule campaign"}
                  </button>
                )}
              </div>
            </footer>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium">
          {label} {required && <span className="text-destructive">*</span>}
        </label>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
      <div className="w-8 h-8 rounded-md bg-primary/10 text-primary grid place-items-center">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-sm truncate">{value}</div>
      </div>
    </div>
  );
}

function ChoiceCard({
  active,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-4 rounded-xl border text-left transition-all",
        active
          ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm"
          : "border-border hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="w-7 h-7 rounded-md bg-primary/10 text-primary grid place-items-center">
          {icon}
        </span>
        {title}
      </div>
      <div className="text-xs text-muted-foreground mt-2">{desc}</div>
    </button>
  );
}

function ReviewRow({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className="text-sm font-medium mt-0.5">{v}</div>
    </div>
  );
}
