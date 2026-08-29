import { formatDistanceToNowStrict } from "date-fns";
import { CheckCheck, Pin, Star, AlertCircle, Circle } from "lucide-react";
import type { ConversationRow } from "@/hooks/use-conversations";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { resolveContactDisplayName, resolveContactInitials, resolveContactPhoneSubtitle } from "@/lib/inbox/contact-display";
import { cn } from "@/lib/utils";

type Props = {
  conversation: ConversationRow;
  isActive?: boolean;
  onSelect: (id: string) => void;
  typingUserIds?: string[];
};

const priorityStyles: Record<string, string> = {
  urgent: "text-red-500",
  high: "text-orange-500",
  normal: "text-transparent",
  low: "text-transparent",
};

export function ConversationListItem({
  conversation: c,
  isActive,
  onSelect,
  typingUserIds,
}: Props) {
  const name = resolveContactDisplayName(c.contact);
  const initials = resolveContactInitials(c.contact);
  const phoneSubtitle = resolveContactPhoneSubtitle(c.contact);
  const unread = c.unread_count > 0;
  const starred = (c.metadata as { starred?: boolean } | null)?.starred;
  const online =
    c.contact?.last_seen_at &&
    Date.now() - new Date(c.contact.last_seen_at).getTime() < 5 * 60 * 1000;
  const isTyping = (typingUserIds?.length ?? 0) > 0;
  const preview = isTyping
    ? "typing…"
    : c.last_message_preview ?? "No messages yet";

  return (
    <button
      type="button"
      onClick={() => onSelect(c.id)}
      aria-current={isActive ? "true" : undefined}
      className={cn(
        "w-[calc(100%-1rem)] mx-2 my-1 text-left flex items-start gap-2.5 px-2.5 py-2.5 rounded-lg border transition-colors relative overflow-hidden sm:my-1.5 sm:gap-3 sm:px-3 sm:py-3",
        "border-transparent bg-muted/35 hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive && "bg-primary/10 border-primary/40"
      )}
    >
      <div className="relative shrink-0">
        <Avatar className="h-9 w-9 sm:h-10 sm:w-10">
          <AvatarImage src={c.contact?.avatar_url ?? undefined} alt={name} />
          <AvatarFallback className="bg-gradient-to-br from-primary/80 to-accent/80 text-primary-foreground text-xs font-medium">
            {initials || "?"}
          </AvatarFallback>
        </Avatar>
        {online && (
          <span
            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 ring-2 ring-background"
            aria-label="Online"
          />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span
            className={cn(
              "truncate text-[13px] sm:text-sm",
              unread ? "font-semibold text-foreground" : "font-medium text-foreground/90"
            )}
          >
            {name}
          </span>
          {phoneSubtitle && (
            <span className="hidden sm:inline text-[10px] text-muted-foreground shrink-0 tabular-nums truncate max-w-[110px]">
              {phoneSubtitle}
            </span>
          )}

          {starred && (
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 shrink-0" />
          )}
          {c.priority === "urgent" && (
            <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />
          )}
          <span className="ml-auto pl-1 text-[10px] sm:text-[11px] text-muted-foreground shrink-0 tabular-nums">
            {c.last_message_at
              ? formatDistanceToNowStrict(new Date(c.last_message_at), {
                  addSuffix: false,
                })
                  .replace(" seconds", "s")
                  .replace(" second", "s")
                  .replace(" minutes", "m")
                  .replace(" minute", "m")
                  .replace(" hours", "h")
                  .replace(" hour", "h")
                  .replace(" days", "d")
                  .replace(" day", "d")
                  .replace(" months", "mo")
                  .replace(" month", "mo")
                  .replace(" years", "y")
                  .replace(" year", "y")
              : ""}
          </span>
        </div>

        <div className="flex items-center gap-1 mt-0.5">
          {c.last_message_from === "agent" && (
            <CheckCheck className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
          <p
            className={cn(
              "truncate text-xs",
              isTyping && "text-primary italic",
              !isTyping && unread ? "text-foreground/90 font-medium" : "text-muted-foreground"
            )}
          >
            {preview}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 mt-1.5 min-h-[18px]">
          {c.labels?.slice(0, 3).map((label) => (
            <span
              key={label.id}
              className="inline-flex max-w-[90px] items-center truncate text-[10px] sm:text-[11px] px-1.5 py-0.5 rounded font-medium"
              style={{
                backgroundColor: label.color ? `${label.color}20` : undefined,
                color: label.color ?? undefined,
                border: label.color ? `1px solid ${label.color}40` : undefined,
              }}
            >
              {label.name}
            </span>
          ))}
          {c.assignee && (
            <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] sm:text-[11px] text-muted-foreground">
              <Avatar className="h-4 w-4">
                <AvatarImage src={c.assignee.avatar_url ?? undefined} />
                <AvatarFallback className="text-[8px]">
                  {(c.assignee.display_name ?? "?")[0]}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:inline truncate max-w-[80px]">
                {c.assignee.display_name}
              </span>
            </span>
          )}
          {unread && (
            <span className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1.5 grid place-items-center rounded-sm bg-primary text-primary-foreground text-[10px] sm:text-[11px] font-semibold tabular-nums">

              {c.unread_count > 99 ? "99+" : c.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export function ConversationListItemSkeleton() {
  return (
    <div className="flex items-start gap-3 mx-2 my-1.5 px-3 py-3 rounded-lg bg-muted/35 animate-pulse">
      <div className="h-10 w-10 rounded-full bg-muted shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-1/3 bg-muted rounded" />
        <div className="h-3 w-4/5 bg-muted rounded" />
        <div className="h-2 w-1/4 bg-muted rounded" />
      </div>
    </div>
  );
}

