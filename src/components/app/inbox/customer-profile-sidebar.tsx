import { AttachmentItem, AttachmentsErrorState, type AttachmentFileRef } from "@/components/app/files/attachment-item";
import { format, formatDistanceToNowStrict } from "date-fns";
import { headerSlotClass } from "@/lib/layout/header-height";

import {
  Mail,
  Phone,
  MessageCircle,
  Building2,
  Briefcase,
  MapPin,
  Clock,
  Tag,
  UserCircle,
  X,
  ExternalLink,
  Sparkles,
  FileText,
  Paperclip,
  Handshake,
  ListTodo,
  Megaphone,
  Activity,
  StickyNote,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import {
  useCustomerBundle,
  customerDisplayName,
  customerLocation,
  type CustomerProfile,
} from "@/hooks/use-customer-profile";
import { formatPhoneNumber, phoneToTelHref, phoneToWhatsAppHref } from "@/lib/inbox/contact-display";

type Props = {
  contactId: string | null | undefined;
  onClose?: () => void;
};

export function CustomerProfileSidebar({ contactId, onClose }: Props) {
  const { profile, stats, deals, tasks, notes, attachments, campaigns, activity } = useCustomerBundle(
    contactId ?? undefined,
  );

  return (
    <aside className="w-full sm:w-96 flex flex-col min-h-0 border-l border-border bg-surface">
      <div className="flex items-center shrink-0 h-12 border-b border-border px-4 justify-between">
        <div className="text-sm font-semibold">Customer profile</div>
        {onClose && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 max-h-full">
        <div className="p-4">
          {!contactId ? (
            <div className="text-sm text-muted-foreground text-center py-8 space-y-1">
              <div className="font-medium text-foreground">No contact linked</div>
              <div className="text-xs">
                This conversation isn't linked to a CRM contact yet. Link one from the conversation header to see full
                customer details.
              </div>
            </div>
          ) : profile.isLoading ? (
            <ProfileSkeleton />
          ) : profile.error ? (
            <div className="text-sm text-destructive text-center py-8">Failed to load customer profile.</div>
          ) : !profile.data ? (
            <div className="text-sm text-muted-foreground text-center py-8">Customer not found</div>
          ) : (
            <ProfileBody
              contact={profile.data}
              stats={stats.data}
              deals={deals.data ?? []}
              tasks={tasks.data ?? []}
              notes={notes.data ?? []}
              attachments={attachments.data ?? []}
              attachmentsError={attachments.error}
              onRetryAttachments={() => void attachments.refetch()}
              campaigns={campaigns.data ?? []}
              activity={activity.data ?? []}
            />
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function ProfileBody({
  contact,
  stats,
  deals,
  tasks,
  notes,
  attachments,
  attachmentsError,
  onRetryAttachments,
  campaigns,
  activity,
}: {
  contact: CustomerProfile;
  stats: { total: number; open: number; resolved: number; last_message_at: string | null } | undefined;
  deals: Array<{
    id: string;
    title: string;
    amount: number | null;
    currency: string | null;
    status: string;
    expected_close_date: string | null;
  }>;
  tasks: Array<{ id: string; title: string; due_at: string | null; priority: string | null; status: string }>;
  notes: Array<{ id: string; body: string; is_pinned: boolean; created_at: string }>;
  attachments: Array<{
    id: string;
    file_name: string;
    file_size: number | null;
    mime_type: string | null;
    file: AttachmentFileRef;
    created_at: string;
  }>;
  attachmentsError?: unknown;
  onRetryAttachments?: () => void;
  campaigns: Array<{ id: string; name: string; status: string; channel: string | null; sent_at: string | null }>;
  activity: Array<{ id: string; verb: string; summary: string | null; created_at: string }>;
}) {
  const name = customerDisplayName(contact);
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const location = customerLocation(contact);
  const currency = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col items-center text-center pt-2">
        <Avatar className="h-20 w-20 mb-3 ring-4 ring-background shadow-sm">
          <AvatarImage src={contact.avatar_url ?? undefined} />
          <AvatarFallback className="text-lg font-semibold">{initials}</AvatarFallback>
        </Avatar>
        <h3 className="text-base font-semibold truncate max-w-full">{name}</h3>
        {contact.job_title && (
          <div className="text-xs text-muted-foreground truncate max-w-full">
            {contact.job_title}
            {contact.company?.name ? ` · ${contact.company.name}` : ""}
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-1.5 mt-3">
          <StatusPill label={contact.customer_status || contact.status} tone="primary" />
          {contact.lead_status && <StatusPill label={`Lead: ${contact.lead_status}`} tone="muted" />}
          <StatusPill label={contact.lifecycle_stage} tone="secondary" />
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-2">
        <QuickAction
          icon={<MessageCircle className="h-4 w-4" />}
          label="Chat"
          disabled={!contact.whatsapp && !contact.phone}
        />
        <QuickAction icon={<Phone className="h-4 w-4" />} label="Call" href={phoneToTelHref(contact.phone)} />
        <QuickAction
          icon={<Mail className="h-4 w-4" />}
          label="Email"
          href={contact.email ? `mailto:${contact.email}` : undefined}
        />
        <QuickAction
          icon={<ExternalLink className="h-4 w-4" />}
          label="Open"
          asLink
          to="/customers/$customerId"
          params={{ customerId: contact.id }}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Conversations" value={stats?.total ?? "—"} />
        <StatCard
          label="LTV"
          value={contact.customer_lifetime_value != null ? currency.format(contact.customer_lifetime_value) : "—"}
        />
        <StatCard
          label="Last contact"
          value={
            stats?.last_message_at
              ? formatDistanceToNowStrict(new Date(stats.last_message_at), {
                  addSuffix: false,
                })
              : "—"
          }
        />
      </div>

      <Separator />

      {/* Contact details */}
      <section className="space-y-2">
        <SectionTitle icon={<UserCircle className="h-3.5 w-3.5" />} label="Contact" />
        <Field
          icon={<Phone className="h-3.5 w-3.5" />}
          label="Phone"
          value={formatPhoneNumber(contact.phone)}
          href={phoneToTelHref(contact.phone)}
        />
        <Field
          icon={<MessageCircle className="h-3.5 w-3.5" />}
          label="WhatsApp"
          value={formatPhoneNumber(contact.whatsapp ?? contact.phone)}
          href={phoneToWhatsAppHref(contact.whatsapp ?? contact.phone)}
        />
        <Field
          icon={<Mail className="h-3.5 w-3.5" />}
          label="Email"
          value={contact.email}
          href={contact.email ? `mailto:${contact.email}` : undefined}
        />
        <Field
          icon={<Building2 className="h-3.5 w-3.5" />}
          label="Company"
          value={contact.company?.name ?? null}
          to={contact.company ? "/companies/$companyId" : undefined}
          params={contact.company ? { companyId: contact.company.id } : undefined}
        />
        <Field icon={<Briefcase className="h-3.5 w-3.5" />} label="Job title" value={contact.job_title} />
        <Field icon={<MapPin className="h-3.5 w-3.5" />} label="Location" value={location} />
        <Field icon={<Clock className="h-3.5 w-3.5" />} label="Timezone" value={contact.timezone} />
      </section>

      {/* Tags */}
      {contact.tags && contact.tags.length > 0 && (
        <section className="space-y-2">
          <SectionTitle icon={<Tag className="h-3.5 w-3.5" />} label="Tags" />
          <div className="flex flex-wrap gap-1.5">
            {contact.tags.map((t) => (
              <Badge key={t} variant="secondary" className="text-[11px]">
                {t}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {/* Ownership */}
      <section className="space-y-2">
        <SectionTitle icon={<UserCircle className="h-3.5 w-3.5" />} label="Ownership" />
        <PersonRow label="Owner" person={contact.owner} />
        <PersonRow label="Assigned agent" person={contact.agent} />
      </section>

      <Separator />

      <Accordion type="multiple" defaultValue={["deals", "tasks", "activity"]}>
        <AccordionItem value="deals">
          <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2">
            <span className="flex items-center gap-2">
              <Handshake className="h-3.5 w-3.5" />
              Related deals ({deals.length})
            </span>
          </AccordionTrigger>
          <AccordionContent>
            {deals.length === 0 ? (
              <EmptyLine text="No deals yet" />
            ) : (
              <div className="space-y-1.5">
                {deals.map((d) => (
                  <div key={d.id} className="rounded-sm border border-border p-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate font-medium">{d.title}</div>
                      {d.amount != null && (
                        <div className="text-xs text-muted-foreground shrink-0">
                          {new Intl.NumberFormat(undefined, {
                            style: "currency",
                            currency: d.currency ?? "USD",
                          }).format(d.amount)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[11px] capitalize">
                        {d.status}
                      </Badge>
                      {d.expected_close_date && (
                        <span className="text-[11px] text-muted-foreground">
                          Close {format(new Date(d.expected_close_date), "MMM d")}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="tasks">
          <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2">
            <span className="flex items-center gap-2">
              <ListTodo className="h-3.5 w-3.5" />
              Open tasks ({tasks.length})
            </span>
          </AccordionTrigger>
          <AccordionContent>
            {tasks.length === 0 ? (
              <EmptyLine text="No open tasks" />
            ) : (
              <div className="space-y-1.5">
                {tasks.map((t) => (
                  <div key={t.id} className="rounded-sm border border-border p-2 text-sm">
                    <div className="truncate font-medium">{t.title}</div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                      {t.priority && (
                        <Badge variant="outline" className="text-[11px] capitalize">
                          {t.priority}
                        </Badge>
                      )}
                      {t.due_at && <span>Due {format(new Date(t.due_at), "MMM d, HH:mm")}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="notes">
          <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2">
            <span className="flex items-center gap-2">
              <StickyNote className="h-3.5 w-3.5" />
              Notes ({notes.length})
            </span>
          </AccordionTrigger>
          <AccordionContent>
            {notes.length === 0 ? (
              <EmptyLine text="No notes yet" />
            ) : (
              <div className="space-y-1.5">
                {notes.slice(0, 6).map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      "rounded-sm border border-border p-2 text-sm",
                      n.is_pinned && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <p className="line-clamp-3 text-sm">{n.body}</p>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {format(new Date(n.created_at), "MMM d, yyyy")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="attachments">
          <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2">
            <span className="flex items-center gap-2">
              <Paperclip className="h-3.5 w-3.5" />
              Attachments ({attachments.length})
            </span>
          </AccordionTrigger>
          <AccordionContent>
            {attachmentsError ? (
              <AttachmentsErrorState
                error={attachmentsError}
                onRetry={onRetryAttachments}
                context="GET attachments (contact files)"
              />
            ) : attachments.length === 0 ? (
              <EmptyLine text="No attachments" />
            ) : (
              <div className="space-y-1">
                {attachments.map((a) => (
                  <AttachmentItem key={a.id} file={a.file} createdAt={a.created_at} />
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="campaigns">
          <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2">
            <span className="flex items-center gap-2">
              <Megaphone className="h-3.5 w-3.5" />
              Campaign history ({campaigns.length})
            </span>
          </AccordionTrigger>
          <AccordionContent>
            {campaigns.length === 0 ? (
              <EmptyLine text="No campaigns" />
            ) : (
              <div className="space-y-1.5">
                {campaigns.map((c) => (
                  <div key={c.id} className="rounded-sm border border-border p-2 text-sm">
                    <div className="truncate font-medium">{c.name}</div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                      <Badge variant="outline" className="text-[11px] capitalize">
                        {c.status}
                      </Badge>
                      {c.channel && <span>{c.channel}</span>}
                      {c.sent_at && <span>{format(new Date(c.sent_at), "MMM d")}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="activity">
          <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2">
            <span className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5" />
              Recent activity
            </span>
          </AccordionTrigger>
          <AccordionContent>
            {activity.length === 0 ? (
              <EmptyLine text="No recent activity" />
            ) : (
              <div className="space-y-2">
                {activity.map((a) => (
                  <div key={a.id} className="text-xs flex items-start gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{a.summary ?? a.verb.replace(/\./g, " ")}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {formatDistanceToNowStrict(new Date(a.created_at), {
                          addSuffix: true,
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="pt-2 text-[11px] text-muted-foreground flex items-center gap-1">
        <Sparkles className="h-3 w-3" />
        Created {format(new Date(contact.created_at), "MMM d, yyyy")}
      </div>
    </div>
  );
}

function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
      {icon}
      {label}
    </div>
  );
}

function Field({
  icon,
  label,
  value,
  href,
  to,
  params,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
  href?: string;
  to?: string;
  params?: Record<string, string>;
}) {
  if (!value) return null;
  const content = (
    <>
      <div className="text-muted-foreground shrink-0 mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm truncate">{value}</div>
      </div>
    </>
  );
  const cls = "flex items-start gap-2 rounded-sm p-1.5 -mx-1.5 hover:bg-muted transition-colors";
  if (to && params) {
    return (
      <Link to={to as never} params={params as never} className={cls}>
        {content}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className={cls}>
        {content}
      </a>
    );
  }
  return <div className={cls}>{content}</div>;
}

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-border bg-background p-2.5 text-center">
      <div className="text-sm font-semibold truncate">{value}</div>
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "primary" | "secondary" | "muted" }) {
  const cls =
    tone === "primary"
      ? "bg-primary/10 text-primary border-primary/20"
      : tone === "secondary"
        ? "bg-secondary text-secondary-foreground"
        : "bg-muted text-muted-foreground";
  return (
    <span className={cn("text-[11px] font-medium rounded-sm px-2 py-0.5 capitalize border border-transparent", cls)}>
      {label}
    </span>
  );
}

function QuickAction({
  icon,
  label,
  href,
  disabled,
  asLink,
  to,
  params,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string;
  disabled?: boolean;
  asLink?: boolean;
  to?: string;
  params?: Record<string, string>;
}) {
  const cls =
    "flex flex-col items-center justify-center gap-1 rounded-sm border border-border p-2 text-[11px] font-medium hover:bg-muted transition-colors disabled:opacity-50";
  if (asLink && to && params) {
    return (
      <Link to={to as never} params={params as never} className={cls}>
        {icon}
        {label}
      </Link>
    );
  }
  return (
    <a
      href={disabled ? undefined : href}
      className={cn(cls, disabled && "pointer-events-none opacity-50")}
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel="noreferrer"
    >
      {icon}
      {label}
    </a>
  );
}

function PersonRow({
  label,
  person,
}: {
  label: string;
  person: { id: string; display_name: string | null; avatar_url: string | null } | null | undefined;
}) {
  if (!person) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <div className="h-6 w-6 rounded-full bg-muted" />
        <div className="text-muted-foreground text-xs">
          {label}: <span className="italic">Unassigned</span>
        </div>
      </div>
    );
  }
  const name = person.display_name ?? "Team member";
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-6 w-6">
        <AvatarImage src={person.avatar_url ?? undefined} />
        <AvatarFallback className="text-[11px]">{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="text-[11px] uppercase text-muted-foreground tracking-wide">{label}</div>
        <div className="text-sm truncate">{name}</div>
      </div>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="text-xs text-muted-foreground italic">{text}</div>;
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center">
        <Skeleton className="h-20 w-20 rounded-full" />
        <Skeleton className="h-4 w-32 mt-3" />
        <Skeleton className="h-3 w-24 mt-2" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-14 rounded-sm" />
        <Skeleton className="h-14 rounded-sm" />
        <Skeleton className="h-14 rounded-sm" />
      </div>
      <Skeleton className="h-40 rounded-sm" />
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
