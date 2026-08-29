import { Bell, CheckCheck, Archive, Trash2, ExternalLink, MessagesSquare, Send, Sparkles, ShieldAlert, CreditCard, UserPlus, AtSign, CheckSquare, Handshake, Megaphone, Info, Building2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  useNotifications, useUnreadCount, useMarkRead, useMarkAllRead,
  useArchiveNotification, useDeleteNotification, useNotificationsRealtime,
  type NotificationRow, type NotificationCategory,
} from "@/hooks/use-notifications";

const CATEGORY_META: Record<NotificationCategory, {
  icon: typeof Bell; tone: "info" | "success" | "warn" | "danger";
}> = {
  system:       { icon: Info,         tone: "info" },
  workspace:    { icon: Building2,    tone: "info" },
  invitation:   { icon: UserPlus,     tone: "info" },
  security:     { icon: ShieldAlert,  tone: "danger" },
  subscription: { icon: CreditCard,   tone: "warn" },
  mention:      { icon: AtSign,       tone: "info" },
  assignment:   { icon: CheckSquare,  tone: "info" },
  task:         { icon: CheckSquare,  tone: "info" },
  deal:         { icon: Handshake,    tone: "success" },
  campaign:     { icon: Megaphone,    tone: "success" },
  ai:           { icon: Sparkles,     tone: "info" },
  info:         { icon: MessagesSquare, tone: "info" },
};

export function iconForCategory(category: NotificationCategory | null | undefined) {
  return CATEGORY_META[category ?? "info"] ?? CATEGORY_META.info;
}

export function NotificationCenter() {
  const { data: items = [] } = useNotifications({ status: "all" });
  const { data: unread = 0 } = useUnreadCount();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const archive = useArchiveNotification();
  const del = useDeleteNotification();

  useNotificationsRealtime((row) => {
    toast(row.title, { description: row.body ?? undefined });
  });

  const active = items.filter((n) => n.status !== "archived").slice(0, 20);

  return (
    <Popover>
      <PopoverTrigger
        className="relative grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 grid h-4 min-w-[16px] place-items-center rounded-sm bg-accent px-1 text-[11px] font-semibold text-accent-foreground shadow-sm animate-scale-in">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="font-display text-sm font-semibold">Notifications</div>
            <div className="text-[11px] text-muted-foreground">{unread} unread</div>
          </div>
          <button
            onClick={() => markAllRead.mutate()}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
        </div>
        <ul className="max-h-[420px] overflow-y-auto divide-y divide-border">
          {active.length === 0 && (
            <li className="p-8 text-center text-sm text-muted-foreground">
              You're all caught up.
            </li>
          )}
          {active.map((n) => <NotificationRowItem key={n.id} n={n} onRead={markRead.mutate} onArchive={archive.mutate} onDelete={del.mutate} />)}
        </ul>
        <div className="border-t border-border px-4 py-2 text-center">
          <Link
            to="/notifications"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationRowItem({
  n, onRead, onArchive, onDelete,
}: {
  n: NotificationRow;
  onRead: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const meta = iconForCategory(n.category);
  const Icon = meta.icon;
  const unread = n.status === "unread";

  const body = (
    <div className="flex gap-3 px-4 py-3 group">
      <div className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
        meta.tone === "success" && "bg-success/15 text-success",
        meta.tone === "warn" && "bg-warning/15 text-warning",
        meta.tone === "info" && "bg-accent/15 text-accent",
        meta.tone === "danger" && "bg-destructive/15 text-destructive",
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-sm font-medium">{n.title}</div>
          <div className="text-[11px] text-muted-foreground whitespace-nowrap">
            {formatDistanceToNow(new Date(n.created_at), { addSuffix: false })}
          </div>
        </div>
        {n.body && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</div>}
        <div className="mt-1 hidden gap-3 text-[11px] text-muted-foreground group-hover:flex">
          {unread && (
            <button onClick={(e) => { e.preventDefault(); onRead(n.id); }} className="hover:text-foreground">
              Mark read
            </button>
          )}
          <button onClick={(e) => { e.preventDefault(); onArchive(n.id); }} className="hover:text-foreground inline-flex items-center gap-1">
            <Archive className="h-3 w-3" /> Archive
          </button>
          <button onClick={(e) => { e.preventDefault(); onDelete(n.id); }} className="hover:text-destructive inline-flex items-center gap-1">
            <Trash2 className="h-3 w-3" /> Delete
          </button>
          {n.action_url && (
            <span className="inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" /> Open</span>
          )}
        </div>
      </div>
      {unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />}
    </div>
  );

  const cls = cn(
    "block transition-colors hover:bg-muted/50 cursor-pointer",
    unread && "bg-accent/[0.04]",
  );

  if (n.action_url) {
    return (
      <li>
        <a href={n.action_url} className={cls} onClick={() => unread && onRead(n.id)}>{body}</a>
      </li>
    );
  }
  return (
    <li className={cls} onClick={() => unread && onRead(n.id)}>{body}</li>
  );
}
