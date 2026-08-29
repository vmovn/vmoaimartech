import { Inbox, Star, Pin, AtSign, Archive, AlertOctagon, Trash2, UserCheck, UserPlus, CheckCircle2, Clock, Users2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useConversationCounts, type ConversationFilter } from "@/hooks/use-conversations";
import { useHandoffQueue } from "@/hooks/use-handoff";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type InboxView =
  | ConversationFilter
  | "pinned"
  | "favorites"
  | "spam"
  | "trash"
  | "queue";

type Item = { id: InboxView; label: string; icon: LucideIcon; countKey?: string };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Inbox",
    items: [
      { id: "all", label: "All", icon: Inbox, countKey: "all" },
      { id: "unread", label: "Unread", icon: AtSign, countKey: "unread" },
      { id: "mine", label: "Assigned to me", icon: UserCheck, countKey: "mine" },
      { id: "unassigned", label: "Unassigned", icon: UserPlus, countKey: "unassigned" },
    ],
  },
  {
    title: "Status",
    items: [
      { id: "open", label: "Open", icon: Clock, countKey: "open" },
      { id: "pending", label: "Pending", icon: Clock, countKey: "pending" },
      { id: "resolved", label: "Resolved", icon: CheckCircle2, countKey: "resolved" },
      { id: "queue", label: "Handoff queue", icon: Users2, countKey: "queue" },
    ],
  },
  {
    title: "Saved",
    items: [
      { id: "pinned", label: "Pinned", icon: Pin },
      { id: "starred", label: "Starred", icon: Star },
      { id: "favorites", label: "Favorites", icon: Star },
    ],
  },
  {
    title: "More",
    items: [
      { id: "archived", label: "Archive", icon: Archive, countKey: "archived" },
      { id: "spam", label: "Spam", icon: AlertOctagon },
      { id: "trash", label: "Trash", icon: Trash2 },
    ],
  },
];

type Props = {
  view: InboxView;
  onChange: (v: InboxView) => void;
  inboxId?: string | null;
};

/**
 * Slim icon rail — Front / Missive style. Shows unread counters as pill
 * badges. Views without a native count (pinned / favorites / spam / trash)
 * are visual placeholders that still switch the list filter.
 */
export function InboxNavRail({ view, onChange, inboxId }: Props) {
  const { data: counts } = useConversationCounts(inboxId ?? undefined);
  const { data: queueItems } = useHandoffQueue("waiting");
  const c: Record<string, number> = {
    ...((counts?.badges as Record<string, number> | undefined) ?? {}),
    queue: queueItems?.length ?? 0,
  };

  return (
    <TooltipProvider delayDuration={200}>
      <nav
        aria-label="Inbox views"
        className="w-14 shrink-0 border-r border-border bg-surface flex flex-col items-center py-3 gap-3 overflow-y-auto"
      >
        {GROUPS.map((group, gi) => (
          <div key={group.title} className="flex flex-col items-center gap-1">
            {gi > 0 && <div className="w-6 h-px bg-border my-1" />}
            {group.items.map((item) => {
              const active = view === item.id;
              const count = item.countKey ? c[item.countKey] : undefined;
              const Icon = item.icon;
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={active ? "secondary" : "ghost"}
                      size="icon"
                      className={cn("h-9 w-9 relative", active && "shadow-sm")}
                      onClick={() => onChange(item.id)}
                      aria-label={item.label}
                      aria-pressed={active}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                      {typeof count === "number" && count > 0 && (
                        <span
                          data-testid={`nav-rail-count-${item.id}`}
                          className={cn(
                            "absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-sm text-[11px] font-semibold grid place-items-center",
                            active
                              ? "bg-primary text-primary-foreground"
                              : "bg-accent text-primary-foreground"
                          )}
                        >
                          {count > 99 ? "99+" : count}
                        </span>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    {item.label}
                    {typeof count === "number" && count > 0 && (
                      <span className="ml-2 opacity-70">{count}</span>
                    )}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ))}
      </nav>
    </TooltipProvider>
  );
}

/** Map a nav-rail view to the ConversationList's filter enum. */
export function viewToFilter(view: InboxView): ConversationFilter {
  switch (view) {
    case "pinned":
    case "favorites":
      return "starred";
    case "spam":
    case "trash":
      return "archived";
    case "queue":
      return "all";
    default:
      return view;
  }
}
