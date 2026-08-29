import { requireWorkspaceRole } from "@/lib/rbac";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { TimePicker } from "@/shared/components";
import {
  Building2,
  MapPin,
  Globe,
  Clock,
  Palette,
  ScrollText,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  useActiveOrganization,
  useOrgRole,
  useOrgMembers,
  useUpdateOrganization,
  useTransferOwnership,
  useDeleteOrganization,
  useOrgAuditLog,
  type OrganizationRow,
} from "@/hooks/use-organization";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/organization")({
  beforeLoad: requireWorkspaceRole("owner", "admin"),
  component: OrganizationPage,
});

type SectionId = "profile" | "contact" | "locale" | "hours" | "brand" | "activity" | "danger";

const SECTIONS: { id: SectionId; label: string; icon: typeof Building2 }[] = [
  { id: "profile", label: "Profile", icon: Building2 },
  { id: "contact", label: "Contact", icon: MapPin },
  { id: "locale", label: "Locale", icon: Globe },
  { id: "hours", label: "Business hours", icon: Clock },
  { id: "brand", label: "Brand", icon: Palette },
  { id: "activity", label: "Activity log", icon: ScrollText },
  { id: "danger", label: "Danger zone", icon: ShieldAlert },
];

const DAYS = [
  { id: 1, short: "Mon" },
  { id: 2, short: "Tue" },
  { id: 3, short: "Wed" },
  { id: 4, short: "Thu" },
  { id: 5, short: "Fri" },
  { id: 6, short: "Sat" },
  { id: 0, short: "Sun" },
];

function OrganizationPage() {
  const [active, setActive] = useState<SectionId>("profile");
  const {
    active: org,
    activeId,
    isLoading,
    isError,
    error,
    refetch,
    isMissingContext,
  } = useActiveOrganization();

  const { data: role } = useOrgRole(org?.id);
  const canEdit = role === "owner" || role === "admin";

  return (
    <>
      <AppTopbar
        title="Organization"
        subtitle={org ? `${org.name} · ${role ?? "member"}` : "Loading…"}
      />
      <main className="p-6 max-w-7xl w-full mx-auto flex flex-col md:flex-row gap-6">
        <nav className="md:w-56 space-y-1 shrink-0">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-left transition-colors ${
                active === s.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-foreground/80"
              }`}
            >
              <s.icon className="w-4 h-4" /> {s.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 rounded-xl border border-border bg-surface shadow-sm p-6 min-h-[400px]">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading organization…
            </div>
          ) : isError ? (
            <div className="space-y-3" role="alert">
              <p className="text-sm font-medium text-destructive">
                Could not load your organization.
              </p>
              <p className="text-xs text-muted-foreground break-words">
                {(error as Error | null)?.message ?? "Unknown error"}
              </p>
              <button
                onClick={() => void refetch()}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Retry
              </button>
            </div>
          ) : isMissingContext ? (
            <div className="space-y-3" role="alert">
              <p className="text-sm font-medium text-destructive">
                Organization context is missing.
              </p>
              <p className="text-sm text-muted-foreground">
                {activeId
                  ? "The selected organization is no longer available to your account. Pick another one from the organization switcher."
                  : "Your account is not a member of any organization. Ask an owner to invite you, or create one from the organization switcher."}
              </p>
              <button
                onClick={() => void refetch()}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Retry
              </button>
            </div>
          ) : !org ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading organization…
            </div>

          ) : (
            <>
              {active === "profile" && <ProfileSection org={org} canEdit={canEdit} />}
              {active === "contact" && <ContactSection org={org} canEdit={canEdit} />}
              {active === "locale" && <LocaleSection org={org} canEdit={canEdit} />}
              {active === "hours" && <HoursSection org={org} canEdit={canEdit} />}
              {active === "brand" && <BrandSection org={org} canEdit={canEdit} />}
              {active === "activity" && <ActivitySection orgId={org.id} />}
              {active === "danger" && <DangerSection org={org} role={role} />}
            </>
          )}
        </div>
      </main>
    </>
  );
}

/* ------------------------------ Sections ------------------------------ */

function ProfileSection({ org, canEdit }: { org: OrganizationRow; canEdit: boolean }) {
  const [form, setForm] = useState({
    name: org.name,
    industry: org.industry ?? "",
    logo_url: org.logo_url ?? "",
  });
  const mut = useUpdateOrganization(org.id);

  async function save() {
    try {
      await mut.mutateAsync({
        name: form.name.trim(),
        industry: form.industry.trim() || null,
        logo_url: form.logo_url.trim() || null,
      });
      toast.success("Organization updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <div className="space-y-5 max-w-xl">
      <h2 className="font-bold text-2xl">Organization profile</h2>

      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-lg bg-gradient-accent grid place-items-center text-accent-foreground font-display font-bold text-2xl overflow-hidden">
          {form.logo_url ? (
            <img src={form.logo_url} alt={form.name} className="w-full h-full object-cover" />
          ) : (
            form.name.slice(0, 1).toUpperCase()
          )}
        </div>
        <Field
          label="Logo URL"
          value={form.logo_url}
          onChange={(v) => setForm({ ...form, logo_url: v })}
          disabled={!canEdit}
          placeholder="https://…/logo.png"
          className="flex-1"
        />
      </div>

      <Field label="Business name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} disabled={!canEdit} />
      <Field label="Industry" value={form.industry} onChange={(v) => setForm({ ...form, industry: v })} disabled={!canEdit} placeholder="e.g. SaaS, Retail, Healthcare" />
      <Field label="Slug" value={org.slug} disabled readOnly />

      {canEdit && (
        <button
          onClick={save}
          disabled={mut.isPending}
          className="px-4 h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {mut.isPending ? "Saving…" : "Save changes"}
        </button>
      )}
    </div>
  );
}

function ContactSection({ org, canEdit }: { org: OrganizationRow; canEdit: boolean }) {
  const [form, setForm] = useState({
    contact_email: org.contact_email ?? "",
    billing_email: org.billing_email ?? "",
    phone: org.phone ?? "",
    website: org.website ?? "",
    address: org.address ?? "",
  });
  const mut = useUpdateOrganization(org.id);

  async function save() {
    try {
      await mut.mutateAsync({
        contact_email: form.contact_email.trim() || null,
        billing_email: form.billing_email.trim() || null,
        phone: form.phone.trim() || null,
        website: form.website.trim() || null,
        address: form.address.trim() || null,
      });
      toast.success("Contact information updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <div className="space-y-5 max-w-xl">
      <h2 className="font-bold text-2xl">Contact information</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Contact email" value={form.contact_email} onChange={(v) => setForm({ ...form, contact_email: v })} disabled={!canEdit} placeholder="hello@company.com" />
        <Field label="Billing email" value={form.billing_email} onChange={(v) => setForm({ ...form, billing_email: v })} disabled={!canEdit} placeholder="billing@company.com" />
        <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} disabled={!canEdit} placeholder="+1 555 010 0000" />
        <Field label="Website" value={form.website} onChange={(v) => setForm({ ...form, website: v })} disabled={!canEdit} placeholder="https://company.com" />
      </div>
      <TextArea label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} disabled={!canEdit} />

      {canEdit && (
        <button onClick={save} disabled={mut.isPending} className="px-4 h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          {mut.isPending ? "Saving…" : "Save changes"}
        </button>
      )}
    </div>
  );
}

const TIMEZONES = ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Europe/Oslo", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney"];
const CURRENCIES = ["USD", "EUR", "GBP", "NOK", "SEK", "AUD", "CAD", "INR", "SGD", "AED", "JPY"];
const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "no", label: "Norsk" },
  { code: "sv", label: "Svenska" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "ar", label: "العربية" },
];

function LocaleSection({ org, canEdit }: { org: OrganizationRow; canEdit: boolean }) {
  const [form, setForm] = useState({
    timezone: org.timezone,
    currency: org.currency,
    language: org.language,
  });
  const mut = useUpdateOrganization(org.id);

  async function save() {
    try {
      await mut.mutateAsync(form);
      toast.success("Locale updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <div className="space-y-5 max-w-xl">
      <h2 className="font-bold text-2xl">Locale</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <Select
          label="Timezone"
          value={form.timezone}
          onChange={(v) => setForm({ ...form, timezone: v })}
          disabled={!canEdit}
          options={TIMEZONES.map((t) => ({ value: t, label: t }))}
        />
        <Select
          label="Currency"
          value={form.currency}
          onChange={(v) => setForm({ ...form, currency: v })}
          disabled={!canEdit}
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
        />
        <Select
          label="Language"
          value={form.language}
          onChange={(v) => setForm({ ...form, language: v })}
          disabled={!canEdit}
          options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
        />
      </div>
      {canEdit && (
        <button onClick={save} disabled={mut.isPending} className="px-4 h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          {mut.isPending ? "Saving…" : "Save changes"}
        </button>
      )}
    </div>
  );
}

function HoursSection({ org, canEdit }: { org: OrganizationRow; canEdit: boolean }) {
  const [workingDays, setWorkingDays] = useState<number[]>(org.working_days ?? [1, 2, 3, 4, 5]);
  const [hours, setHours] = useState<OrganizationRow["business_hours"]>(() => {
    const base: OrganizationRow["business_hours"] = {};
    DAYS.forEach((d) => {
      base[String(d.id)] = org.business_hours?.[String(d.id)] ?? { open: "09:00", close: "17:00" };
    });
    return base;
  });
  const mut = useUpdateOrganization(org.id);

  function toggleDay(d: number) {
    setWorkingDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  async function save() {
    try {
      await mut.mutateAsync({ working_days: workingDays, business_hours: hours });
      toast.success("Business hours updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="font-bold text-2xl">Working days</h2>
        <p className="text-sm text-muted-foreground">Days when your team is available to respond to customers.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DAYS.map((d) => {
            const on = workingDays.includes(d.id);
            return (
              <button
                key={d.id}
                onClick={() => canEdit && toggleDay(d.id)}
                disabled={!canEdit}
                className={`px-3 h-9 rounded-md text-sm border transition-colors ${
                  on
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-input bg-surface text-foreground/70 hover:bg-muted"
                } disabled:opacity-60`}
              >
                {d.short}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="font-bold text-2xl">Business hours</h2>
        <p className="text-sm text-muted-foreground">Times shown in the organization's timezone ({org.timezone}).</p>
        <div className="mt-3 space-y-2">
          {DAYS.map((d) => {
            const h = hours[String(d.id)] ?? { open: "09:00", close: "17:00" };
            const enabled = workingDays.includes(d.id);
            return (
              <div key={d.id} className={`flex items-center gap-3 rounded-md border border-border p-3 ${!enabled ? "opacity-50" : ""}`}>
                <span className="w-12 text-sm font-medium">{d.short}</span>
                <TimePicker
                  value={h.open}
                  disabled={!canEdit || !enabled}
                  onChange={(v) => setHours({ ...hours, [d.id]: { ...h, open: v ?? "" } })}
                  className="w-32"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <TimePicker
                  value={h.close}
                  disabled={!canEdit || !enabled}
                  onChange={(v) => setHours({ ...hours, [d.id]: { ...h, close: v ?? "" } })}
                  className="w-32"
                />
              </div>
            );
          })}
        </div>
      </div>

      {canEdit && (
        <button onClick={save} disabled={mut.isPending} className="px-4 h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          {mut.isPending ? "Saving…" : "Save changes"}
        </button>
      )}
    </div>
  );
}

function BrandSection({ org, canEdit }: { org: OrganizationRow; canEdit: boolean }) {
  const [brand, setBrand] = useState({
    primary_color: org.brand_settings?.primary_color ?? "#0F172A",
    accent_color: org.brand_settings?.accent_color ?? "#22C55E",
    logo_dark_url: org.brand_settings?.logo_dark_url ?? "",
  });
  const mut = useUpdateOrganization(org.id);

  async function save() {
    try {
      await mut.mutateAsync({ brand_settings: brand });
      toast.success("Brand updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <div className="space-y-5 max-w-xl">
      <h2 className="font-bold text-2xl">Brand</h2>
      <p className="text-sm text-muted-foreground">
        Colors and assets used across customer-facing surfaces (WhatsApp templates, portal, invoices).
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <ColorField label="Primary color" value={brand.primary_color} onChange={(v) => setBrand({ ...brand, primary_color: v })} disabled={!canEdit} />
        <ColorField label="Accent color" value={brand.accent_color} onChange={(v) => setBrand({ ...brand, accent_color: v })} disabled={!canEdit} />
      </div>

      <Field label="Dark-mode logo URL" value={brand.logo_dark_url} onChange={(v) => setBrand({ ...brand, logo_dark_url: v })} disabled={!canEdit} placeholder="https://…/logo-dark.png" />

      <div className="rounded-md border border-border p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-md" style={{ background: brand.primary_color }} />
        <div className="w-12 h-12 rounded-md" style={{ background: brand.accent_color }} />
        <span className="text-xs text-muted-foreground">Preview</span>
      </div>

      {canEdit && (
        <button onClick={save} disabled={mut.isPending} className="px-4 h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          {mut.isPending ? "Saving…" : "Save changes"}
        </button>
      )}
    </div>
  );
}

function ActivitySection({ orgId }: { orgId: string }) {
  const { data, isLoading } = useOrgAuditLog(orgId, 100);
  return (
    <div>
      <h2 className="font-bold text-2xl mb-1">Activity log</h2>
      <p className="text-sm text-muted-foreground mb-4">The last 100 changes made in this organization.</p>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No activity yet.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border overflow-hidden">
          {data.map((row) => (
            <li key={row.id} className="p-3 flex items-start gap-3 text-sm">
              <span className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-sm text-xs font-medium ${badgeForAction(row.action)}`}>
                {row.action}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {row.resource_type} <span className="text-muted-foreground font-normal">·</span>{" "}
                  <span className="text-muted-foreground font-mono text-xs">{row.resource_id}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(row.created_at).toLocaleString()}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function badgeForAction(a: string) {
  switch (a) {
    case "create": return "bg-success/10 text-success";
    case "delete": return "bg-destructive/10 text-destructive";
    case "update": return "bg-primary/10 text-primary";
    case "invite":
    case "login": return "bg-accent/10 text-accent-foreground";
    default: return "bg-muted text-muted-foreground";
  }
}

function DangerSection({ org, role }: { org: OrganizationRow; role: "owner" | "admin" | "member" | null | undefined }) {
  const isOwner = role === "owner";
  const { data: members } = useOrgMembers(org.id);
  const transferable = useMemo(
    () => (members ?? []).filter((m) => m.role !== "owner"),
    [members]
  );

  const [newOwnerId, setNewOwnerId] = useState<string>("");
  const [confirmName, setConfirmName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");
  const [transferStep, setTransferStep] = useState<0 | 1 | 2>(0); // 0=idle, 1=review, 2=type-to-confirm
  const [transferConfirmText, setTransferConfirmText] = useState("");
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0); // 0=idle, 1=warn, 2=type-to-confirm
  const [transferError, setTransferError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const transferMut = useTransferOwnership(org.id);
  const deleteMut = useDeleteOrganization(org.id);
  const navigate = useNavigate();

  const selectedMember = transferable.find((m) => m.user_id === newOwnerId);
  const selectedMemberLabel = selectedMember?.display_name ?? newOwnerId.slice(0, 8);
  const TRANSFER_PHRASE = "transfer ownership";
  const isBusy = transferMut.isPending || deleteMut.isPending;

  function openTransfer() {
    if (!newOwnerId) {
      toast.error("Pick a member to transfer to");
      return;
    }
    setTransferError(null);
    setTransferConfirmText("");
    setTransferStep(1);
  }

  async function confirmTransfer() {
    setTransferError(null);
    try {
      await transferMut.mutateAsync(newOwnerId);
      toast.success(`Ownership transferred to ${selectedMemberLabel}`);
      setNewOwnerId("");
      setTransferConfirmText("");
      setTransferStep(0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transfer failed. Please try again.";
      setTransferError(msg);
      toast.error(msg);
    }
  }

  function openDelete() {
    if (confirmName !== org.name) {
      toast.error("Type the organization name to confirm");
      return;
    }
    setDeleteError(null);
    setConfirmDelete("");
    setDeleteStep(1);
  }

  async function confirmDeleteAction() {
    setDeleteError(null);
    try {
      await deleteMut.mutateAsync();
      toast.success("Organization deleted");
      setDeleteStep(0);
      await supabase.auth.getSession();
      navigate({ to: "/dashboard", replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed. Please try again.";
      setDeleteError(msg);
      toast.error(msg);
    }
  }

  if (!isOwner) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
        Only the organization owner can transfer ownership or delete the organization.
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-xl">
      {/* Transfer ownership */}
      <div className="rounded-md border border-border p-5">
        <h3 className="font-display font-semibold">Transfer ownership</h3>
        <p className="text-sm text-muted-foreground mt-1">
          The new owner gets full control. You'll be demoted to admin and lose the ability to delete this organization.
        </p>
        <div className="mt-4 space-y-3">
          <Select
            label="New owner"
            value={newOwnerId}
            onChange={setNewOwnerId}
            disabled={isBusy}
            options={[
              { value: "", label: "Select a member…" },
              ...transferable.map((m) => ({
                value: m.user_id,
                label: m.display_name ?? m.user_id.slice(0, 8),
              })),
            ]}
          />
          <button
            onClick={openTransfer}
            disabled={isBusy || !newOwnerId}
            className="px-4 h-10 rounded-md border border-input bg-surface text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {transferMut.isPending ? "Transferring…" : "Transfer ownership"}
          </button>
        </div>
      </div>

      {/* Delete organization */}
      <div className="rounded-md border border-destructive/40 p-5 bg-destructive/5">
        <h3 className="font-display font-semibold text-destructive">Delete organization</h3>
        <p className="text-sm text-muted-foreground mt-1">
          This permanently deletes the organization, all workspaces, contacts, deals, conversations, and files. This cannot be undone.
        </p>
        <div className="mt-4 space-y-3">
          <Field
            label={`Type "${org.name}" to enable`}
            value={confirmName}
            onChange={setConfirmName}
            placeholder={org.name}
            disabled={isBusy}
          />
          <button
            onClick={openDelete}
            disabled={isBusy || confirmName !== org.name}
            className="px-4 h-10 rounded-md bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleteMut.isPending ? "Deleting…" : "Delete organization permanently"}
          </button>
        </div>
      </div>

      {/* Transfer: Step 1 — Review */}
      <AlertDialog
        open={transferStep === 1}
        onOpenChange={(o) => {
          if (!o && !transferMut.isPending) setTransferStep(0);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Review ownership transfer
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  You are about to transfer ownership of <strong>{org.name}</strong> to{" "}
                  <strong>{selectedMemberLabel}</strong>.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li>They will get full control, including billing and deletion rights.</li>
                  <li>You will be demoted to <strong>admin</strong>.</li>
                  <li>You will not be able to reverse this yourself.</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={transferMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setTransferStep(2);
              }}
              disabled={transferMut.isPending}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer: Step 2 — Type to confirm */}
      <AlertDialog
        open={transferStep === 2}
        onOpenChange={(o) => {
          if (!o && !transferMut.isPending) setTransferStep(0);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm transfer</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Type <code className="px-1 py-0.5 rounded bg-muted font-mono">{TRANSFER_PHRASE}</code> to confirm.
                </p>
                <Field
                  label=""
                  value={transferConfirmText}
                  onChange={setTransferConfirmText}
                  placeholder={TRANSFER_PHRASE}
                  disabled={transferMut.isPending}
                />
                {transferError && (
                  <p className="text-destructive text-sm" role="alert">{transferError}</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={transferMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmTransfer();
              }}
              disabled={transferMut.isPending || transferConfirmText.trim().toLowerCase() !== TRANSFER_PHRASE}
            >
              {transferMut.isPending ? "Transferring…" : `Transfer to ${selectedMemberLabel}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete: Step 1 — Warn */}
      <AlertDialog
        open={deleteStep === 1}
        onOpenChange={(o) => {
          if (!o && !deleteMut.isPending) setDeleteStep(0);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Permanently delete {org.name}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>This will immediately and irreversibly delete:</p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li>All workspaces, members, and invitations</li>
                  <li>All contacts, deals, conversations, and messages</li>
                  <li>All files, media, and integrations</li>
                  <li>All billing history and audit logs</li>
                </ul>
                <p className="text-destructive font-medium pt-1">There is no undo. Backups cannot be restored from the app.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Keep organization</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setDeleteStep(2);
              }}
              disabled={deleteMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              I understand, continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete: Step 2 — Final type-to-confirm */}
      <AlertDialog
        open={deleteStep === 2}
        onOpenChange={(o) => {
          if (!o && !deleteMut.isPending) setDeleteStep(0);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Final confirmation</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Type <code className="px-1 py-0.5 rounded bg-muted font-mono">{org.name}</code> once more to delete this organization forever.
                </p>
                <Field
                  label=""
                  value={confirmDelete}
                  onChange={setConfirmDelete}
                  placeholder={org.name}
                  disabled={deleteMut.isPending}
                />
                {deleteError && (
                  <p className="text-destructive text-sm" role="alert">{deleteError}</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDeleteAction();
              }}
              disabled={deleteMut.isPending || confirmDelete !== org.name}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending ? "Deleting…" : "Delete forever"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------ Inputs ------------------------------ */

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  readOnly,
  className,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        className={`mt-1 w-full h-10 px-3 rounded-md border border-input bg-surface text-sm ${
          readOnly || disabled ? "bg-muted/40 text-muted-foreground" : ""
        }`}
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={3}
        className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-surface text-sm disabled:bg-muted/40 disabled:text-muted-foreground"
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-surface text-sm disabled:bg-muted/40 disabled:text-muted-foreground"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-10 w-14 rounded-md border border-input bg-surface cursor-pointer disabled:opacity-50"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="flex-1 h-10 px-3 rounded-md border border-input bg-surface text-sm font-mono disabled:bg-muted/40 disabled:text-muted-foreground"
        />
      </div>
    </div>
  );
}
