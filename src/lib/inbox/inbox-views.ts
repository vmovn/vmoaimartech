import type { InboxView } from "@/components/app/inbox/inbox-nav-rail";

/**
 * Lives outside the route module: `validateSearch` stays in the shared route
 * chunk while the component is code-split away, so any constant both halves
 * touch must come from a plain module or it becomes undefined at runtime.
 */
export const INBOX_VIEWS: InboxView[] = [
  "all", "unread", "mine", "unassigned", "open", "pending", "resolved",
  "queue", "pinned", "starred", "favorites", "archived", "spam", "trash",
];

/** Persisted inbox filter chip, scoped per workspace. */
export const inboxViewKey = (workspaceId: string) => `swiffer.inbox.view.${workspaceId}`;

export function readSavedInboxView(workspaceId: string | undefined | null): InboxView | null {
  if (typeof window === "undefined" || !workspaceId) return null;
  try {
    const raw = window.localStorage.getItem(inboxViewKey(workspaceId)) as InboxView | null;
    return raw && INBOX_VIEWS.includes(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeSavedInboxView(workspaceId: string | undefined | null, v: InboxView) {
  if (typeof window === "undefined" || !workspaceId) return;
  try {
    if (v === "all") window.localStorage.removeItem(inboxViewKey(workspaceId));
    else window.localStorage.setItem(inboxViewKey(workspaceId), v);
  } catch {
    /* storage unavailable — filter simply won't persist */
  }
}
