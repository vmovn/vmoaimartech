import { useMemo, useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import {
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  RotateCw,
  Reply,
  Forward,
  Copy,
  Pencil,
  Trash2,
  Smile,
  MapPin,
  FileText,
  Download,
  Mic,
  User,
  Lock,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/shared/components/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import type { MessageRow } from "@/hooks/use-messages";
import {
  useDeleteMessage,
  useEditMessage,
  useReactToMessage,
  useRetryMessage,
} from "@/hooks/use-messages";
import { toast } from "sonner";
import { useSignedAttachmentUrl } from "@/hooks/use-inbox-utils";
import { useMediaLightbox } from "@/components/ui/media-lightbox";
import { explainWhatsAppDeliveryFailure } from "@/lib/messaging/whatsapp-delivery-errors";

const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

type Props = {
  message: MessageRow;
  isOwn: boolean;
  showAvatar?: boolean;
  currentUserId?: string;
  onReply: (m: MessageRow) => void;
  onForward: (m: MessageRow) => void;
};

export function MessageBubble({
  message: m,
  isOwn,
  showAvatar,
  currentUserId,
  onReply,
  onForward,
}: Props) {
  const react = useReactToMessage();
  const del = useDeleteMessage();
  const edit = useEditMessage();
  const retry = useRetryMessage();

  const isDeleted = !!m.deleted_at;
  const reactions = m.metadata.reactions ?? {};
  const hasReactions = Object.keys(reactions).length > 0;

  const [editOpen, setEditOpen] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleEdit = () => {
    setEditValue(m.body ?? "");
    setEditOpen(true);
  };

  const submitEdit = () => {
    if (edit.isPending) return;
    const next = editValue.trim();
    if (next && next !== m.body) {
      edit.mutate(
        { id: m.id, body: next, conversationId: m.conversation_id },
        {
          onSuccess: () => {
            toast.success("Message updated");
            setEditOpen(false);
          },
          onError: (e) => {
            const err = e as { message?: string; code?: string } | undefined;
            const code = err?.code ?? "";
            const raw = err?.message ?? "";
            const isPermission =
              code === "42501" ||
              code === "PGRST301" ||
              /row-level security|permission denied|not authorized/i.test(raw);
            toast.error(
              isPermission
                ? "You don't have permission to edit this message."
                : raw || "Failed to update message",
            );
          },
        },
      );
    } else {
      setEditOpen(false);
    }
  };



  const handleDelete = () => {
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    await del.mutateAsync({ id: m.id, conversationId: m.conversation_id });
  };


  const canEdit = isOwn && !isDeleted && m.message_type === "text";
  const deliveryFailure = useMemo(
    () => explainWhatsAppDeliveryFailure(m.failed_reason),
    [m.failed_reason],
  );

  return (
    <div
      className={cn(
        "group flex items-end gap-2 animate-fade-in",
        isOwn ? "justify-end" : "justify-start"
      )}
    >
      {!isOwn && (
        <div className="w-8 shrink-0">
          {showAvatar && (
            <Avatar className="h-8 w-8">
              <AvatarImage src={m.sender?.avatar_url ?? undefined} />
              <AvatarFallback className="text-[11px]">
                {initials(m.sender?.display_name)}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      )}

      <div
        className={cn(
          "relative max-w-[75%] sm:max-w-[65%] min-w-0",
          isOwn ? "items-end" : "items-start"
        )}
      >
        {m.metadata.forwarded && (
          <div
            className={cn(
              "text-[11px] text-muted-foreground mb-0.5 flex items-center gap-1",
              isOwn ? "justify-end" : "justify-start"
            )}
          >
            <Forward className="h-3 w-3" /> Forwarded
          </div>
        )}

        <div
          className={cn(
            "relative rounded-2xl px-3 py-2 shadow-sm break-words transition-transform",
            m.is_internal
              ? "bg-amber-50 text-amber-950 border border-amber-300 dark:bg-amber-950/30 dark:text-amber-100 dark:border-amber-500/40 rounded-md"
              : isOwn
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-card text-card-foreground border border-border rounded-bl-md",
            isDeleted && "italic opacity-70"
          )}
          aria-label={m.is_internal ? "Internal note (not visible to customer)" : undefined}
        >
          {m.is_internal && (
            <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              <Lock className="h-3 w-3" /> Internal note
            </div>
          )}
          {/* Reply preview */}
          {m.reply_to && !isDeleted && (
            <div
              className={cn(
                "text-xs mb-1.5 pl-2 border-l-2 rounded-sm py-1 pr-2 truncate",
                isOwn
                  ? "border-primary-foreground/60 bg-primary-foreground/10"
                  : "border-primary bg-muted"
              )}
            >
              <div className="font-medium opacity-80 truncate">
                {m.reply_to.direction === "outbound" ? "You" : "Contact"}
              </div>
              <div className="opacity-75 truncate">
                {m.reply_to.body ?? m.reply_to.message_type}
              </div>
            </div>
          )}

          {isDeleted ? (
            <div className="text-sm">This message was deleted</div>
          ) : (
            <MessageContent message={m} isOwn={isOwn} />
          )}

          {/* Meta row */}
          <div
            className={cn(
              "flex items-center gap-1 mt-1 text-[11px]",
              isOwn ? "text-primary-foreground/75" : "text-muted-foreground",
              "justify-end"
            )}
          >
            {m.edited_at && !isDeleted && <span>edited</span>}
            <span>{format(new Date(m.created_at), "HH:mm")}</span>
            {isOwn && !isDeleted && <StatusIcon status={m.status} />}
          </div>

          {/* Reactions */}
          {hasReactions && (
            <div
              className={cn(
                "absolute -bottom-2.5 flex items-center gap-0.5 bg-background border border-border rounded-sm px-1.5 py-0.5 shadow-sm text-xs",
                isOwn ? "right-2" : "left-2"
              )}
            >
              {Object.entries(reactions).map(([emoji, users]) => (
                <button
                  key={emoji}
                  type="button"
                  className={cn(
                    "flex items-center gap-0.5 transition-transform",
                    currentUserId && users.includes(currentUserId) && "font-semibold"
                  )}
                  onClick={() =>
                    react.mutate({
                      id: m.id,
                      emoji,
                      conversationId: m.conversation_id,
                      current: m.metadata,
                    })
                  }
                >
                  <span>{emoji}</span>
                  {users.length > 1 && (
                    <span className="text-[11px] text-muted-foreground">
                      {users.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Failed state */}
        {m.status === "failed" && isOwn && (
          <div className="mt-1 max-w-md text-[11px] text-destructive">
            {deliveryFailure.retryable ? (
              <button
                type="button"
                onClick={() =>
                  retry.mutate({ id: m.id, conversationId: m.conversation_id })
                }
                className="flex items-center gap-1 hover:underline"
              >
                <AlertCircle className="h-3 w-3 shrink-0" />
                Failed — {deliveryFailure.summary}
                <RotateCw className="h-3 w-3 shrink-0" />
              </button>
            ) : (
              <div className="flex items-start gap-1">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  <span className="font-medium">Failed — {deliveryFailure.summary}</span>
                  {deliveryFailure.action && (
                    <span className="mt-0.5 block text-muted-foreground">
                      {deliveryFailure.action}
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action menu */}
      {!isDeleted && (
        <div
          className={cn(
            "opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity self-center flex items-center gap-0.5",
            isOwn ? "order-first" : ""
          )}
        >
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full"
                aria-label="React"
              >
                <Smile className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-1 flex gap-1" align="center">
              {REACTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="text-lg transition-transform p-1"
                  onClick={() =>
                    react.mutate({
                      id: m.id,
                      emoji: e,
                      conversationId: m.conversation_id,
                      current: m.metadata,
                    })
                  }
                >
                  {e}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full"
                aria-label="More"
              >
                <span className="text-lg leading-none">⋯</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isOwn ? "end" : "start"}>
              <DropdownMenuItem onClick={() => onReply(m)}>
                <Reply className="h-4 w-4" /> Reply
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onForward(m)}>
                <Forward className="h-4 w-4" /> Forward
              </DropdownMenuItem>
              {m.body && (
                <DropdownMenuItem
                  onClick={() => {
                    navigator.clipboard.writeText(m.body ?? "");
                    toast.success("Copied");
                  }}
                >
                  <Copy className="h-4 w-4" /> Copy
                </DropdownMenuItem>
              )}
              {canEdit && (
                <DropdownMenuItem onClick={handleEdit}>
                  <Pencil className="h-4 w-4" /> Edit
                </DropdownMenuItem>
              )}
              {isOwn && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit message</DialogTitle>
            <DialogDescription>
              Update the text of your message. Recipients may see an "edited" indicator.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            rows={5}
            autoFocus
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                if (edit.isPending) return;
                submitEdit();
              }
            }}

          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={edit.isPending}>
              Cancel
            </Button>
            <Button
              onClick={submitEdit}
              disabled={edit.isPending || !editValue.trim() || editValue.trim() === (m.body ?? "")}
            >
              {edit.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this message?"
        description="This message will be deleted for everyone in the conversation. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export type NormalizedContactCard = {
  name?: string;
  phone?: string;
  email?: string;
  existingContactId?: string | null;
};

export function extractContactCards(metadata: MessageRow["metadata"]): NormalizedContactCard[] {
  const out: NormalizedContactCard[] = [];
  const md = (metadata ?? {}) as Record<string, unknown>;

  // Outbound share shape
  const single = md.contact_card as NormalizedContactCard | undefined;
  const linkedId =
    typeof md.existing_contact_id === "string"
      ? (md.existing_contact_id as string)
      : null;
  if (single && (single.name || single.phone || single.email)) {
    out.push({
      name: single.name,
      phone: single.phone,
      email: single.email,
      existingContactId: linkedId,
    });
  }

  // Inbound WhatsApp shape: metadata.contacts or metadata.raw.contacts
  const sources: unknown[] = [md.contacts];
  const raw = md.raw as Record<string, unknown> | undefined;
  if (raw && Array.isArray(raw.contacts)) sources.push(raw.contacts);

  for (const src of sources) {
    if (!Array.isArray(src)) continue;
    for (const c of src as Array<Record<string, unknown>>) {
      const nameObj = c?.name as { formatted_name?: string; first_name?: string; last_name?: string } | undefined;
      const composed = [nameObj?.first_name, nameObj?.last_name].filter(Boolean).join(" ");
      const name =
        nameObj?.formatted_name ??
        (composed || (typeof c?.formatted_name === "string" ? (c.formatted_name as string) : undefined));

      const phones = Array.isArray(c?.phones) ? (c.phones as Array<{ phone?: string; wa_id?: string }>) : [];
      const emails = Array.isArray(c?.emails) ? (c.emails as Array<{ email?: string }>) : [];
      const phone = phones[0]?.phone ?? phones[0]?.wa_id ?? (typeof c?.phone === "string" ? (c.phone as string) : undefined);
      const email = emails[0]?.email ?? (typeof c?.email === "string" ? (c.email as string) : undefined);
      if (name || phone || email) out.push({ name: name || undefined, phone, email });
    }
  }

  // Dedupe by phone|email|name (keep first, which retains existingContactId when present)
  const seen = new Set<string>();
  return out.filter((c) => {
    const k = `${c.name ?? ""}|${c.phone ?? ""}|${c.email ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function MessageContent({ message: m, isOwn }: { message: MessageRow; isOwn: boolean }) {

  const mediaPath = (m.metadata?.media_path as string | undefined) ?? null;
  const mediaUrl = useSignedAttachmentUrl(mediaPath, m.media_url);
  const mediaName =
    (m.metadata?.media_name as string | undefined) ?? m.body ?? "Attachment";
  const [contactCardOpen, setContactCardOpen] = useState(false);
  const [selectedContactIdx, setSelectedContactIdx] = useState<number | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const lightbox = useMediaLightbox();

  switch (m.message_type) {
    case "image":
      return (
        <div className="space-y-1">
          {mediaUrl && (
            <button
              type="button"
              className="block cursor-zoom-in rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Open image"
              onClick={() =>
                lightbox.open({ url: mediaUrl, type: "image", name: mediaName, caption: m.body })
              }
            >
              <img
                src={mediaUrl}
                alt={m.body ?? "Image"}
                className="rounded-lg max-h-80 object-cover"
                loading="lazy"
                decoding="async"
              />
            </button>
          )}
          {m.body && <div className="text-sm whitespace-pre-wrap">{m.body}</div>}
        </div>
      );
    case "video":
      return (
        <div className="space-y-1">
          {mediaUrl && (
            <div className="relative">
              <video
                controls
                src={mediaUrl}
                className="rounded-lg max-h-80 w-full"
                preload="metadata"
              />
              <button
                type="button"
                className="absolute right-2 top-2 rounded-md bg-background/80 px-2 py-1 text-xs font-medium text-foreground shadow hover:bg-background"
                onClick={() =>
                  lightbox.open({ url: mediaUrl, type: "video", name: mediaName, caption: m.body })
                }
              >
                Expand
              </button>
            </div>
          )}
          {m.body && <div className="text-sm whitespace-pre-wrap">{m.body}</div>}
        </div>
      );
    case "audio":
      return (
        <div className="flex items-center gap-2 min-w-[220px]">
          <Mic className="h-4 w-4 shrink-0 opacity-80" />
          {mediaUrl && (
            <audio controls src={mediaUrl} className="h-9 flex-1" preload="metadata" />
          )}
        </div>
      );
    case "document":
      return (
        <a
          href={mediaUrl ?? "#"}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "flex items-center gap-3 rounded-md p-2 min-w-[200px]",
            isOwn ? "bg-primary-foreground/10" : "bg-muted"
          )}
          aria-label={`Download ${mediaName}`}
        >
          <div
            className={cn(
              "h-9 w-9 rounded grid place-items-center shrink-0",
              isOwn ? "bg-primary-foreground/20" : "bg-background"
            )}
          >
            <FileText className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{mediaName}</div>
            <div className="text-[11px] opacity-70">
              {m.media_size ? formatBytes(m.media_size) : m.media_type}
            </div>
          </div>
          <Download className="h-4 w-4 opacity-70" />
        </a>
      );
    case "location": {
      const loc = m.metadata.location;
      return (
        <a
          href={
            loc
              ? `https://www.google.com/maps?q=${loc.lat},${loc.lng}`
              : "#"
          }
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-md p-2 bg-muted text-foreground min-w-[200px]"
        >
          <MapPin className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">
              {loc?.label ?? "Location shared"}
            </div>
            {loc && (
              <div className="text-[11px] opacity-70">
                {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
              </div>
            )}
          </div>
        </a>
      );
    }
    case "contact":
    case "contacts" as MessageRow["message_type"]: {
      let cards: NormalizedContactCard[] = [];
      let parseError = false;
      try {
        cards = extractContactCards(m.metadata);
      } catch {
        parseError = true;
      }
      // Loading: outbound message still in-flight and metadata not yet attached.
      const pendingStatus = m.status as string;
      const isLoading =
        !parseError &&
        cards.length === 0 &&
        !m.metadata &&
        (pendingStatus === "queued" || pendingStatus === "sending");
      const isEmpty = !parseError && !isLoading && cards.length === 0;
      const primary = cards[0];
      const label = primary?.name ?? "Contact";
      const subtitle =
        primary?.phone ?? primary?.email ?? (cards.length > 1 ? `${cards.length} contacts` : "");
      return (
        <>
          <button
            type="button"
            onClick={() => setContactCardOpen(true)}
            className={cn(
              "flex items-center gap-3 rounded-md p-2 min-w-[220px] text-left hover:opacity-90 transition-opacity",
              isOwn ? "bg-primary-foreground/10" : "bg-muted text-foreground"
            )}
          >
            <div className="h-9 w-9 rounded-full bg-background text-foreground grid place-items-center">
              <User className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              {isLoading ? (
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ) : parseError ? (
                <div className="text-sm font-medium text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Contact unavailable
                </div>
              ) : isEmpty ? (
                <div className="text-sm text-muted-foreground italic">Contact (no details)</div>
              ) : (
                <>
                  <div className="text-sm font-medium truncate">
                    {label}
                    {cards.length > 1 && (
                      <span className="ml-1 text-[11px] opacity-70">+{cards.length - 1}</span>
                    )}
                  </div>
                  {subtitle && (
                    <div className="text-[11px] opacity-70 truncate">{subtitle}</div>
                  )}
                </>
              )}
            </div>
          </button>
          <Dialog
            open={contactCardOpen}
            onOpenChange={(open) => {
              setContactCardOpen(open);
              if (!open) {
                setSelectedContactIdx(null);
                setContactSearch("");
              }
            }}
          >
            <DialogContent>
              {(() => {
                const isList = cards.length > 1 && selectedContactIdx === null;
                const activeIdx = cards.length === 1 ? 0 : selectedContactIdx;
                const active = activeIdx !== null ? cards[activeIdx] : null;
                return (
                  <>
                    <DialogHeader>
                      <div className="flex items-center gap-2">
                        {cards.length > 1 && selectedContactIdx !== null && (
                          <button
                            type="button"
                            onClick={() => setSelectedContactIdx(null)}
                            className="grid h-7 w-7 place-items-center rounded-sm hover:bg-muted text-muted-foreground"
                            aria-label="Back to contacts"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                        )}
                        <DialogTitle>
                          {isLoading
                            ? "Loading contact…"
                            : parseError
                            ? "Contact unavailable"
                            : isList
                            ? `Shared contacts (${cards.length})`
                            : active?.name ?? label}
                        </DialogTitle>
                      </div>
                      <DialogDescription>
                        {isLoading
                          ? "Fetching shared contact details"
                          : parseError
                          ? "We couldn't read this contact card"
                          : isList
                          ? "Select a contact to view details"
                          : "Shared contact details"}
                      </DialogDescription>
                    </DialogHeader>
                    {isLoading ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-10 w-10 rounded-full" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-3 w-28" />
                          </div>
                        </div>
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                      </div>
                    ) : parseError ? (
                      <div className="flex flex-col items-center gap-2 py-6 text-center">
                        <div className="grid h-10 w-10 place-items-center rounded-full bg-destructive/10 text-destructive">
                          <AlertCircle className="h-5 w-5" />
                        </div>
                        <div className="text-sm font-medium">Contact metadata failed to load</div>
                        <div className="text-xs text-muted-foreground max-w-[280px]">
                          The shared contact card is malformed or missing. Ask the sender to share it again.
                        </div>
                      </div>
                    ) : isEmpty ? (
                      <div className="flex flex-col items-center gap-2 py-6 text-center">
                        <div className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
                          <User className="h-5 w-5" />
                        </div>
                        <div className="text-sm font-medium">No contact details</div>
                        <div className="text-xs text-muted-foreground max-w-[280px]">
                          This contact card doesn't include a name, phone, or email.
                        </div>
                      </div>
                    ) : isList ? (
                      (() => {
                        const q = contactSearch.trim().toLowerCase();
                        const filtered = q
                          ? cards
                              .map((c, idx) => ({ c, idx }))
                              .filter(({ c }) =>
                                [c.name, c.phone, c.email]
                                  .filter(Boolean)
                                  .some((v) => v!.toLowerCase().includes(q)),
                              )
                          : cards.map((c, idx) => ({ c, idx }));
                        return (
                          <div className="space-y-2">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                autoFocus
                                value={contactSearch}
                                onChange={(e) => setContactSearch(e.target.value)}
                                placeholder="Search name, phone or email"
                                className="pl-8 h-9"
                                aria-label="Search shared contacts"
                              />
                            </div>
                            {filtered.length === 0 ? (
                              <div className="py-6 text-center text-sm text-muted-foreground">
                                No contacts match "{contactSearch}".
                              </div>
                            ) : (
                              <div className="space-y-1 max-h-[320px] overflow-y-auto">
                                {filtered.map(({ c, idx }) => {
                                  const sub = c.phone ?? c.email;
                                  return (
                                    <button
                                      key={idx}
                                      type="button"
                                      onClick={() => setSelectedContactIdx(idx)}
                                      className="w-full flex items-center gap-3 rounded-sm p-2 text-left hover:bg-muted transition-colors"
                                    >
                                      <div className="h-9 w-9 rounded-full bg-muted text-foreground grid place-items-center">
                                        <User className="h-4 w-4" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="text-sm font-medium truncate">
                                          {c.name ?? `Contact ${idx + 1}`}
                                        </div>
                                        {sub && (
                                          <div className="text-[11px] text-muted-foreground truncate">{sub}</div>
                                        )}
                                      </div>
                                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : active ? (
                      <div className="space-y-2 text-sm">
                        {active.phone && (
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Phone</span>
                            <a href={`tel:${active.phone}`} className="font-medium truncate">{active.phone}</a>
                          </div>
                        )}
                        {active.email && (
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Email</span>
                            <a href={`mailto:${active.email}`} className="font-medium truncate">{active.email}</a>
                          </div>
                        )}
                        {!active.phone && !active.email && (
                          <div className="text-muted-foreground">No details available.</div>
                        )}
                      </div>
                    ) : null}
                  </>
                );
              })()}
            </DialogContent>
          </Dialog>
        </>
      );
    }

    case "interactive": {
      const i = m.metadata.interactive as
        | {
            options?: unknown;
            type?: string;
            action?: { parameters?: { flow_cta?: string } };
          }
        | undefined;
      const options = Array.isArray(i?.options) ? (i.options as unknown[]) : [];
      const isFlow = i?.type === "flow";
      const flowCta = i?.action?.parameters?.flow_cta || "Open form";
      const formName = (m.metadata as Record<string, unknown>)["wa_form_name"];
      const nfm = (m.metadata as Record<string, unknown>)["nfm_reply"] as
        | { name?: string; response_json?: unknown }
        | undefined;
      return (
        <div className="space-y-1.5">
          {m.body && <div className="text-sm whitespace-pre-wrap">{m.body}</div>}
          {isFlow && (
            <div
              className={cn(
                "text-sm rounded-md px-3 py-1.5 text-center font-medium",
                isOwn ? "bg-primary-foreground/15" : "bg-primary/10 text-primary",
              )}
            >
              {flowCta}
            </div>
          )}
          {isFlow && typeof formName === "string" && formName && (
            <div className="text-[11px] opacity-70">Form: {formName}</div>
          )}
          {nfm && (
            <div className="text-[11px] opacity-70">
              Form response received{nfm.name ? ` · ${nfm.name}` : ""}
            </div>
          )}
          {options.map((opt, idx) => (
            <div
              key={idx}
              className={cn(
                "text-sm rounded-md px-3 py-1.5 text-center",
                isOwn
                  ? "bg-primary-foreground/15"
                  : "bg-primary/10 text-primary"
              )}
            >
              {String(opt)}
            </div>
          ))}
        </div>
      );
    }

    case "sticker":
      return (
        m.media_url ? (
          <button
            type="button"
            className="cursor-zoom-in"
            aria-label="Open sticker"
            onClick={() => lightbox.open({ url: m.media_url!, type: "image", name: "Sticker" })}
          >
            <img src={m.media_url} alt="Sticker" className="h-32 w-32 object-contain" />
          </button>
        ) : (
          <div className="text-3xl">{m.body}</div>
        )
      );
    case "system":
      return <div className="text-xs opacity-70">{m.body}</div>;
    case "template":
    case "text":
    default:
      return (
        <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
      );
  }
}

function StatusIcon({ status }: { status: MessageRow["status"] }) {
  switch (status) {
    case "queued":
      return <Clock className="h-3 w-3" />;
    case "sent":
      return <Check className="h-3 w-3" />;
    case "delivered":
      return <CheckCheck className="h-3 w-3" />;
    case "read":
      return <CheckCheck className="h-3 w-3 text-sky-400" />;
    case "failed":
      return <AlertCircle className="h-3 w-3 text-destructive" />;
  }
}

function initials(name?: string | null) {
  return (name ?? "")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DayDivider({ date }: { date: Date }) {
  const label = useMemo(() => {
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMMM d, yyyy");
  }, [date]);
  return (
    <div className="sticky top-1 z-10 flex items-center justify-center my-3 pointer-events-none">
      <span className="pointer-events-auto text-[11px] px-3 py-1 rounded-sm bg-background/85 backdrop-blur border border-border text-muted-foreground shadow-sm">
        {label}
      </span>
    </div>
  );
}
