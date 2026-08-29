import { useCallback, useMemo, useRef, useState } from "react";
import {
  Archive, ArchiveRestore, Star, Pin, Trash2, AlertOctagon, MoreHorizontal,
  CheckCircle2, Clock, Bell, BellOff, UserPlus, ArrowLeft, Phone, Video,
  Mail, MessageCircle, Send, Link2, User, Users, Gauge, Sparkles, Stethoscope, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ConversationRow, InboxChannel } from "@/hooks/use-conversations";
import { channelLabel } from "@/lib/inbox/channel-capabilities";
import { useCustomerProfile } from "@/hooks/use-customer-profile";
import { resolveContactDisplayName, resolveContactInitials, resolveContactPhoneSubtitle } from "@/lib/inbox/contact-display";
import { cn } from "@/lib/utils";
import { HandoffToolbar } from "./handoff-toolbar";
import { RequestPaymentButton } from "@/components/app/payments/request-payment-button";
import { MotionStagger, MotionItem } from "@/shared/motion";
import { Skeleton, SkeletonCircle } from "@/shared/components/skeleton";
import { EmptyState } from "@/shared/components/empty-state";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import { ExportTranscriptDialog } from "./export-transcript-dialog";


type Props = {
  conversation: ConversationRow;
  onBack?: () => void;
  onArchive?: () => void;
  onStar?: () => void;
  onPin?: () => void;
  onSpam?: () => void;
  onTrash?: () => void;
  onResolve?: () => void;
  onAssign?: () => void;
  onMute?: () => void;
  onLinkContact?: () => void;
  onOpenContact?: () => void;
  /** Opens the per-conversation link diagnostics drawer. */
  onDiagnostics?: () => void;
  /** Currently open right-hand panel (null when closed). */
  panel?: InboxPanel;
  /** Toggle a right-hand panel. Buttons render only when provided. */
  onPanelToggle?: (panel: Exclude<InboxPanel, null>) => void;
};

export type InboxPanel = "customer" | "team" | "sla" | "intel" | null;

const PANEL_BUTTONS: { id: Exclude<InboxPanel, null>; label: string; icon: typeof User }[] = [
  { id: "customer", label: "Contact details", icon: User },
  { id: "intel", label: "Conversation intel", icon: Sparkles },
  { id: "sla", label: "SLA & priority", icon: Gauge },
  { id: "team", label: "Team collaboration", icon: Users },
];

const CHANNEL_ICON: Record<InboxChannel, typeof MessageCircle> = {
  whatsapp: MessageCircle,
  email: Mail,
  sms: Send,
  webchat: MessageCircle,
  instagram: MessageCircle,
  messenger: MessageCircle,
  telegram: Send,
  voice: Phone,
  other: MessageCircle,
};



/**
 * Conversation header — sticky top bar above the message thread.
 * Inspired by Front / Intercom: identity on the left, channel + status
 * chips in the middle, actions on the right.
 */
export function ConversationHeader({
  conversation,
  onBack,
  onArchive,
  onStar,
  onPin,
  onSpam,
  onTrash,
  onResolve,
  onAssign,
  onMute,
  onLinkContact,
  onOpenContact,
  onDiagnostics,
  panel,
  onPanelToggle,
}: Props) {
  const { data: contact, isLoading: contactLoading } = useCustomerProfile(conversation.contact_id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const meta = (conversation.metadata ?? {}) as Record<string, unknown>;
  const starred = meta.starred === "true" || meta.starred === true;
  const pinned = meta.pinned === "true" || meta.pinned === true;
  const muted = meta.muted === "true" || meta.muted === true;

  const ChannelIcon = CHANNEL_ICON[conversation.channel] ?? MessageCircle;
  const displayName = useMemo(
    () => resolveContactDisplayName(contact, conversation.contact),
    [contact, conversation.contact],
  );
  const initials = useMemo(
    () => resolveContactInitials(contact, conversation.contact),
    [contact, conversation.contact],
  );
  const phoneSubtitle = useMemo(
    () => resolveContactPhoneSubtitle(contact, conversation.contact),
    [contact, conversation.contact],
  );
  const isUnknownContact = displayName === "Unknown contact";

  type MenuAction = {
    key: string;
    label: string;
    icon: typeof Star;
    onClick?: () => void;
    destructive?: boolean;
    separatorBefore?: boolean;
  };

  const menuActions = useMemo<MenuAction[]>(() => {
    const items: MenuAction[] = [];
    if (onAssign) items.push({ key: "assign", label: "Assign…", icon: UserPlus, onClick: onAssign });
    if (onLinkContact) items.push({ key: "link", label: "Link contact…", icon: Link2, onClick: onLinkContact });
    items.push({ key: "export", label: "Export transcript…", icon: Download, onClick: () => setExportOpen(true) });
    if (onDiagnostics) items.push({ key: "diag", label: "Diagnose linking…", icon: Stethoscope, onClick: onDiagnostics });
    if (onStar) items.push({ key: "star", label: starred ? "Unstar" : "Star", icon: Star, onClick: onStar });
    if (onPin) items.push({ key: "pin", label: pinned ? "Unpin" : "Pin to top", icon: Pin, onClick: onPin });
    if (onMute) items.push({ key: "mute", label: muted ? "Unmute" : "Mute notifications", icon: muted ? Bell : BellOff, onClick: onMute });
    if (onArchive) {
      items.push({
        key: "archive",
        label: conversation.is_archived ? "Unarchive" : "Archive",
        icon: conversation.is_archived ? ArchiveRestore : Archive,
        onClick: onArchive,
        separatorBefore: true,
      });
    }
    if (onSpam) items.push({ key: "spam", label: "Mark as spam", icon: AlertOctagon, onClick: onSpam, separatorBefore: !onArchive });
    if (onTrash) items.push({ key: "trash", label: "Move to trash", icon: Trash2, onClick: onTrash, destructive: true });
    return items;
  }, [onAssign, onLinkContact, onDiagnostics, onStar, onPin, onMute, onArchive, onSpam, onTrash, starred, pinned, muted, conversation.is_archived]);

  // --- Analytics: menu open / action / close (drop-off) -------------------
  const menuOpenedAt = useRef<number | null>(null);
  const actionTaken = useRef(false);

  const handleMenuOpenChange = useCallback(
    (open: boolean) => {
      setMenuOpen(open);
      const base = {
        conversation_id: conversation.id,
        channel: conversation.channel,
        action_count: menuActions.length,
      };
      if (open) {
        menuOpenedAt.current = Date.now();
        actionTaken.current = false;
        trackUiEvent("inbox.conversation_menu.open", { ...base, loading: contactLoading });
      } else {
        trackUiEvent("inbox.conversation_menu.close", {
          ...base,
          action_taken: actionTaken.current,
          dropped_off: !actionTaken.current,
          duration_ms: menuOpenedAt.current ? Date.now() - menuOpenedAt.current : null,
        });
        menuOpenedAt.current = null;
      }
    },
    [conversation.id, conversation.channel, menuActions.length, contactLoading],
  );

  const handleMenuAction = useCallback(
    (action: MenuAction) => {
      actionTaken.current = true;
      trackUiEvent("inbox.conversation_menu.action", {
        conversation_id: conversation.id,
        channel: conversation.channel,
        action: action.key,
        destructive: !!action.destructive,
        time_to_action_ms: menuOpenedAt.current ? Date.now() - menuOpenedAt.current : null,
      });
      action.onClick?.();
    },
    [conversation.id, conversation.channel],
  );





  const statusVariant = conversation.status === "resolved" ? "secondary" : "default";
  const priorityColor =
    conversation.priority === "urgent"
      ? "bg-destructive text-destructive-foreground"
      : conversation.priority === "high"
      ? "bg-primary text-primary-foreground"
      : "bg-muted text-muted-foreground";

  return (
    <TooltipProvider delayDuration={200}>
      <header data-testid="inbox-conversation-header" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))", paddingLeft: "max(0.75rem, env(safe-area-inset-left))", paddingRight: "max(0.75rem, env(safe-area-inset-right))" }} className="flex items-center gap-2 py-2 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 min-h-header-safe">
        {onBack && (
          <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack} aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}

        <button
          type="button"
          onClick={onOpenContact}
          disabled={!onOpenContact}
          className="flex items-center gap-2 min-w-0 flex-1 text-left rounded-sm -mx-1 px-1 py-0.5 hover:bg-muted/50 disabled:hover:bg-transparent disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="View contact details"
        >
          <Avatar className="h-9 w-9 shrink-0">
            {contact?.avatar_url && <AvatarImage src={contact.avatar_url} alt={contact.name ?? ""} />}
            <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-sm font-semibold truncate">
                {displayName}
              </h2>
              {pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
              {starred && <Star className="h-3 w-3 fill-primary text-primary shrink-0" />}
              {muted && <BellOff className="h-3 w-3 text-muted-foreground shrink-0" />}
              {isUnknownContact && onLinkContact && (
                <span
                  role="button"
                  tabIndex={0}
                  className="inline-flex items-center h-6 px-2 text-[11px] rounded-sm shrink-0 border border-border bg-background hover:bg-muted"
                  onClick={(e) => { e.stopPropagation(); onLinkContact(); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onLinkContact(); } }}
                >
                  <Link2 className="h-3 w-3 mr-1" /> Link contact
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
              <span className="inline-flex items-center gap-1">
                <ChannelIcon className="h-3 w-3" />
                {channelLabel(conversation.channel)}
              </span>
              {phoneSubtitle && (
                <>
                  <span className="opacity-50">·</span>
                  <span className="truncate tabular-nums">{phoneSubtitle}</span>
                </>
              )}
              {conversation.subject && (
                <>
                  <span className="opacity-50">·</span>
                  <span className="truncate">{conversation.subject}</span>
                </>
              )}
            </div>
          </div>
        </button>

          <div className="flex items-center gap-1 shrink-0">
          <Badge variant={statusVariant} className="capitalize hidden sm:inline-flex">
            {conversation.status}
          </Badge>
          {conversation.priority !== "normal" && (
            <span className={cn("text-[11px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide hidden sm:inline-flex", priorityColor)}>
              {conversation.priority}
            </span>
          )}
            <HandoffToolbar
            conversationId={conversation.id}
            handoffState={((conversation as unknown as { handoff_state?: "ai"|"human"|"queued" }).handoff_state) ?? "ai"}
            aiEnabled={((conversation as unknown as { ai_enabled?: boolean }).ai_enabled) ?? true}
              className="hidden xl:flex mr-1"
          />

          <div className="hidden lg:flex items-center">
            <IconButton label="Assign" onClick={onAssign} icon={UserPlus} />
            <IconButton label={starred ? "Unstar" : "Star"} onClick={onStar} icon={Star} active={!!starred} />
            <IconButton label={pinned ? "Unpin" : "Pin"} onClick={onPin} icon={Pin} active={!!pinned} />
            <IconButton
              label={conversation.status === "resolved" ? "Reopen" : "Resolve"}
              onClick={onResolve}
              icon={conversation.status === "resolved" ? Clock : CheckCircle2}
            />
          </div>

          {conversation.contact_id && (
            <RequestPaymentButton
              prefill={{
                contactId: conversation.contact_id,
                customerName: displayName,
                customerPhone: contact?.phone ?? undefined,
                customerEmail: contact?.email ?? undefined,
              }}
              variant="outline"
            />
          )}


          {onPanelToggle && (
            <div data-testid="inbox-panel-toolbar" className="hidden sm:flex items-center border-l border-border pl-1 ml-1">
              {PANEL_BUTTONS.map((p) => (
                <IconButton
                  key={p.id}
                  label={p.label}
                  icon={p.icon}
                  active={panel === p.id}
                  onClick={() => onPanelToggle(p.id)}
                />
              ))}
            </div>
          )}

          <DropdownMenu open={menuOpen} onOpenChange={handleMenuOpenChange}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-60 p-0 overflow-hidden shadow-lg"
            >
              <MotionStagger className="p-1" gap={0.028} delay={0.02}>
                <MotionItem preset="row" className="flex items-center gap-2 p-2 mb-1 border-b border-border md:hidden">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack} aria-label="Back to conversations">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  {contactLoading ? (
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <SkeletonCircle size={24} />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  ) : (
                    <span className="text-sm font-semibold truncate">{displayName}</span>
                  )}
                </MotionItem>

                {contactLoading ? (
                  <div className="space-y-1 p-1" role="status" aria-busy="true">
                    <span className="sr-only">Loading actions</span>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                        <Skeleton className="h-4 w-4 rounded" />
                        <Skeleton className="h-3" style={{ width: `${70 - i * 8}%` }} />
                      </div>
                    ))}
                  </div>
                ) : menuActions.length === 0 ? (
                  <EmptyState
                    variant="compact"
                    icon={MoreHorizontal}
                    title="No actions available"
                    description="You don't have permission to act on this conversation."
                  />
                ) : (
                  menuActions.map((action) =>
                    action.separatorBefore ? (
                      <MotionItem preset="row" key={action.key}>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleMenuAction(action)}
                          className={action.destructive ? "text-destructive focus:text-destructive" : undefined}
                        >
                          <action.icon className="h-4 w-4 mr-2" /> {action.label}
                        </DropdownMenuItem>
                      </MotionItem>
                    ) : (
                      <MotionItem preset="row" key={action.key}>
                        <DropdownMenuItem
                          onClick={() => handleMenuAction(action)}
                          className={action.destructive ? "text-destructive focus:text-destructive" : undefined}
                        >
                          <action.icon className="h-4 w-4 mr-2" /> {action.label}
                        </DropdownMenuItem>
                      </MotionItem>
                    ),
                  )
                )}
              </MotionStagger>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <ExportTranscriptDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        meta={{
          conversationId: conversation.id,
          channel: channelLabel(conversation.channel),
          contactName: displayName,
          subject: conversation.subject ?? null,
        }}
      />
    </TooltipProvider>
  );
}

function IconButton({
  label, icon: Icon, onClick, active,
}: { label: string; icon: typeof Star; onClick?: () => void; active?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={onClick}
          aria-label={label}
        >
          <Icon className={cn("h-4 w-4", active && "fill-current")} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}
