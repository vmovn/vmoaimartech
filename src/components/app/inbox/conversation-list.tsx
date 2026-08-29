import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch, Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";

import { Search, ArrowUpDown, Inbox as InboxIcon, CheckSquare, Tag, SlidersHorizontal, RefreshCw, AlertCircle, AlertTriangle, ChevronsUpDown, ChevronDown, Check, Settings2, Info } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useConversations,
  useConversationCounts,
  useChannelUnreadCounts,
  useInfiniteScroll,
  useWorkspaceTypingIndicators,
  type ConversationCounts,
  type ConversationFilter,
  type ConversationSort,
  type ConversationRow,
  type InboxChannel,
} from "@/hooks/use-conversations";
import {
  FILTERABLE_CHANNELS,
  channelLabel,
  channelSetupPath,
  isFilterableChannel,
} from "@/lib/inbox/channel-capabilities";
import { normalizeChannelAccounts, mergeAccountSources, type SyncedChannelAccount } from "@/lib/inbox/account-sync";
import { useLiveChatAccounts } from "@/hooks/use-livechat-accounts";
import { useInboxChannelRefresh } from "@/hooks/use-inbox-channel-refresh";
import { useExternalChannelAccounts } from "@/hooks/use-external-accounts";

import { ChannelIcon } from "./channel-icon";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useChannelAccounts, type ChannelAccountRow } from "@/hooks/use-channel-accounts";


import {
  ConversationListItem,
  ConversationListItemSkeleton,
} from "./conversation-list-item";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LabelManagerDialog } from "./label-manager";
import { AdvancedSearchDialog } from "./advanced-search";
import { BulkActionsBar } from "./bulk-actions-bar";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,

} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useInboxSyncSettings,
  SYNC_INTERVAL_OPTIONS,
  SYNC_BUTTON_OPTIONS,
  formatSyncAgo,
  formatSyncDuration,
} from "@/lib/inbox/sync-settings";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** One completed conversation-list refresh, kept for the sync details panel. */
type SyncRun = {
  at: number;
  ms: number;
  count: number;
  ok: boolean;
  error: string | null;
};




type Props = {
  selectedId?: string;
  onSelect: (c: ConversationRow) => void;
  inboxId?: string | null;
  /** Optional controlled filter (from nav rail). Falls back to internal state. */
  filter?: ConversationFilter;
  onFilterChange?: (f: ConversationFilter) => void;
};

type Tab = {
  id: ConversationFilter;
  label: string;
  countKey?: keyof ConversationCounts["badges"];
};

const TABS: Tab[] = [
  { id: "all", label: "All", countKey: "all" },
  { id: "unread", label: "Unread", countKey: "unread" },
  { id: "mine", label: "Mine", countKey: "mine" },
  { id: "unassigned", label: "Unassigned", countKey: "unassigned" },
  { id: "open", label: "Open", countKey: "open" },
  { id: "pending", label: "Pending", countKey: "pending" },
  { id: "resolved", label: "Resolved", countKey: "resolved" },
  { id: "starred", label: "Starred" },
  { id: "archived", label: "Archived", countKey: "archived" },
];

/** Per-workspace localStorage key for the selected inbox account filter. */
const accountKey = (workspaceId?: string) => `swiffer.inbox.account.${workspaceId ?? "none"}`;

/** Per-workspace localStorage key for the selected channel tile filters. */
const channelsKey = (workspaceId?: string) => `swiffer.inbox.channels.${workspaceId ?? "none"}`;

function readSavedAccountId(workspaceId?: string): string | null {
  if (typeof window === "undefined" || !workspaceId) return null;
  try {
    return window.localStorage.getItem(accountKey(workspaceId));
  } catch {
    return null;
  }
}

function writeSavedAccountId(workspaceId: string | undefined, id: string | null) {
  if (typeof window === "undefined" || !workspaceId) return;
  try {
    if (id) window.localStorage.setItem(accountKey(workspaceId), id);
    else window.localStorage.removeItem(accountKey(workspaceId));
  } catch {
    /* storage unavailable */
  }
}

function readSavedChannels(workspaceId?: string): InboxChannel[] {
  if (typeof window === "undefined" || !workspaceId) return [];
  try {
    const raw = window.localStorage.getItem(channelsKey(workspaceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFilterableChannel);
  } catch {
    return [];
  }
}

function writeSavedChannels(workspaceId: string | undefined, channels: InboxChannel[]) {
  if (typeof window === "undefined" || !workspaceId) return;
  try {
    if (channels.length > 0) {
      window.localStorage.setItem(channelsKey(workspaceId), JSON.stringify(channels));
    } else {
      window.localStorage.removeItem(channelsKey(workspaceId));
    }
  } catch {
    /* storage unavailable */
  }
}

/** Per-workspace localStorage key for the inbox search term. */
const searchKey = (workspaceId?: string) => `swiffer.inbox.search.${workspaceId ?? "none"}`;

function readSavedSearch(workspaceId?: string): string {
  if (typeof window === "undefined" || !workspaceId) return "";
  try {
    return window.localStorage.getItem(searchKey(workspaceId)) ?? "";
  } catch {
    return "";
  }
}

function writeSavedSearch(workspaceId: string | undefined, term: string) {
  if (typeof window === "undefined" || !workspaceId) return;
  try {
    if (term.trim()) window.localStorage.setItem(searchKey(workspaceId), term);
    else window.localStorage.removeItem(searchKey(workspaceId));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Connection status badge for an account row in the selector.
 *
 * Live Chat "accounts" are chatbots, so this is how you tell a live widget bot
 * from a disabled/archived one at a glance; the same badge is reused for every
 * channel since they all carry a normalized `status`.
 */
function AccountStatusBadge({
  status,
  reason,
  className,
}: {
  status?: string | null;
  reason?: string | null;
  className?: string;
}) {
  const s = (status ?? "").toLowerCase();
  const tone =
    s === "connected"
      ? { dot: "bg-success", text: "text-success", label: "Connected" }
      : s === "pending" || s === "syncing"
        ? { dot: "bg-warning", text: "text-warning", label: "Syncing" }
        : s === "error" || s === "invalid"
          ? { dot: "bg-destructive", text: "text-destructive", label: "Error" }
          : { dot: "bg-muted-foreground", text: "text-muted-foreground", label: "Disabled" };

  return (
    <span
      title={reason ?? tone.label}
      className={`inline-flex shrink-0 items-center gap-1 rounded border border-border/60 px-1.5 py-0.5 text-[10px] font-medium leading-none ${tone.text} ${className ?? ""}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden />
      {tone.label}
    </span>
  );
}


export function ConversationList({ selectedId, onSelect, inboxId, filter: filterProp, onFilterChange }: Props) {
  const [filterState, setFilterState] = useState<ConversationFilter>("all");
  const filter = filterProp ?? filterState;
  const setFilter = (f: ConversationFilter) => {
    if (onFilterChange) onFilterChange(f);
    else setFilterState(f);
  };
  const [sort, setSort] = useState<ConversationSort>("recent");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [channels, setChannels] = useState<InboxChannel[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [accountId, setAccountIdState] = useState<string | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState("");
  const isMobile = useIsMobile();
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);
  const accountSearchRef = useRef<HTMLInputElement>(null);
  const { active: workspace } = useCurrentWorkspace();
  const {
    data: accountsData,
    isError: accountsError,
    error: accountsErrorObj,
    isFetching: accountsFetching,
    refetch: refetchAccounts,
  } = useChannelAccounts(workspace?.id);
  // Live Chat has no `channel_accounts` rows — widget-enabled chatbots are the
  // accounts, projected into the same shape so the selector treats them alike.
  const { data: liveChatAccounts } = useLiveChatAccounts(workspace?.id);
  // Telegram / Messenger / Instagram each have their own provider table.
  const { data: externalAccounts } = useExternalChannelAccounts(workspace?.id);
  // Validate providers at the sync boundary: rows with an unsupported
  // `provider` never reach inbox state, they are surfaced as an error instead.
  // `mergeAccountSources` additionally drops rows left over from another
  // workspace and de-duplicates ids, so a partially-settled merge can never
  // point the thread view at a stale account.
  const { accounts, invalid: invalidAccounts } = useMemo(
    () =>
      normalizeChannelAccounts<ChannelAccountRow>(
        mergeAccountSources<ChannelAccountRow>(
          workspace?.id,
          accountsData,
          externalAccounts,
          liveChatAccounts,
        ),
      ),
    [workspace?.id, accountsData, externalAccounts, liveChatAccounts],
  );

  const selectedAccount = accounts.find((a) => a.id === accountId) ?? null;

  // Switching channel/account force-fetches the list, folder counts and unread
  // badges so a stale cached page never survives the switch.
  useInboxChannelRefresh(workspace?.id, channels, accountId);


  // Keep the selected account + channels in the URL so the inbox view is shareable.
  const navigate = useNavigate();
  const urlSearchParams = useSearch({ strict: false }) as {
    account?: string;
    q?: string;
    channels?: string;
  };
  const urlAccountId = urlSearchParams.account ?? null;
  const urlQ = urlSearchParams.q ?? null;
  const urlChannelsRaw = urlSearchParams.channels ?? null;
  const urlChannels: InboxChannel[] = (urlChannelsRaw ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(isFilterableChannel);
  const syncFiltersToUrl = (id: string | null, chs?: InboxChannel[]) => {
    navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        account: id ?? undefined,
        ...(chs === undefined
          ? {}
          : { channels: chs.length > 0 ? chs.join(",") : undefined }),
      }),
      replace: true,
    });
  };
  const syncAccountToUrl = (id: string | null) => syncFiltersToUrl(id);
  const setAccountId = (id: string | null) => {
    setAccountIdState(id);
    syncAccountToUrl(id);
  };

  /** Update channel filter state + per-workspace storage + URL in one place. */
  const applyChannels = (next: InboxChannel[], accountForUrl?: string | null) => {
    setChannels(next);
    writeSavedChannels(workspace?.id, next);
    syncFiltersToUrl(accountForUrl === undefined ? accountId : accountForUrl, next);
  };

  const filteredAccounts = accountSearch.trim()
    ? accounts.filter((a) => {
        const q = accountSearch.toLowerCase();
        return (
          a.display_name.toLowerCase().includes(q) ||
          (a.phone_number?.toLowerCase().includes(q) ?? false) ||
          channelLabel(a.channel).toLowerCase().includes(q)
        );
      })
    : accounts;

  /** Select an account (or "All") and mirror it onto the channel filter. */
  const selectAccount = (a: SyncedChannelAccount<ChannelAccountRow> | null) => {
    setAccountIdState(a?.id ?? null);
    setAccountMenuOpen(false);
    setAccountSearch("");
    const nextChannels: InboxChannel[] = (() => {
      if (!a) return [];
      return FILTERABLE_CHANNELS.includes(a.channel) ? [a.channel] : [];
    })();
    writeSavedAccountId(workspace?.id, a?.id ?? null);
    applyChannels(nextChannels, a?.id ?? null);
  };


  // Focus the account search input when the dropdown opens.
  useEffect(() => {
    if (accountMenuOpen) {
      const t = setTimeout(() => accountSearchRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [accountMenuOpen]);

  // Restore the chosen account/channel filter once the account list has loaded.
  // The URL query param wins over the per-workspace localStorage fallback so
  // shared/bookmarked inbox links open with the same account selected.
  // Treat a failed sync as "settled" so the restore effect still applies the
  // saved channel filter instead of hanging in the loading state forever.
  const accountsLoaded = accountsData !== undefined || accountsError;
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !workspace?.id || !accountsLoaded) return;
    restoredRef.current = true;
    const savedAccountId = urlAccountId ?? readSavedAccountId(workspace.id);
    // URL channels win over the per-workspace localStorage fallback.
    const savedChannels = urlChannels.length > 0 ? urlChannels : readSavedChannels(workspace.id);
    const match = savedAccountId ? accounts.find((a) => a.id === savedAccountId) : null;
    if (match) {
      setAccountIdState(match.id);
      writeSavedAccountId(workspace.id, match.id);
      const ch = match.channel;
      const next = FILTERABLE_CHANNELS.includes(ch) ? [ch] : [];
      setChannels(next);
      writeSavedChannels(workspace.id, next);
      if (!urlAccountId || urlChannels.join(",") !== next.join(",")) {
        syncFiltersToUrl(match.id, next);
      }
    } else {
      // Stale account (deleted, or belongs to another workspace) — purge it
      // from the URL and from this workspace's saved filter.
      if (savedAccountId) writeSavedAccountId(workspace.id, null);
      setChannels(savedChannels);
      writeSavedChannels(workspace.id, savedChannels);
      if (urlAccountId || urlChannels.join(",") !== savedChannels.join(",")) {
        syncFiltersToUrl(null, savedChannels);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id, accountsLoaded, accounts.length, urlAccountId, urlChannelsRaw]);


  // Switching workspaces invalidates the current account filter immediately:
  // clear state and drop the inherited ?account= param so the new workspace
  // never renders another tenant's account selection while accounts load.
  const prevWorkspaceRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevWorkspaceRef.current;
    prevWorkspaceRef.current = workspace?.id;
    if (prev === workspace?.id) return;
    restoredRef.current = false;
    setAccountIdState(null);
    setChannels([]);
    if (prev !== undefined) {
      // Search terms are per-workspace too — clear and re-restore.
      searchRestoredRef.current = false;
      setSearch("");
      setDebouncedSearch("");
    }
    // On first mount keep the URL params (they target the current workspace).
    if (prev !== undefined && (urlAccountId || urlQ || urlChannelsRaw)) {
      navigate({
        to: ".",
        search: (p: Record<string, unknown>) => ({
          ...p,
          account: undefined,
          q: undefined,
          channels: undefined,
        }),
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id]);

  // React to external URL changes (e.g. the topbar badge clear button) so the
  // account/channel filters stay in sync with the URL after the initial restore.
  useEffect(() => {
    if (!restoredRef.current) return;
    if (urlAccountId === accountId && urlChannels.join(",") === channels.join(",")) return;
    setAccountIdState(urlAccountId);
    writeSavedAccountId(workspace?.id, urlAccountId);
    let nextChannels: InboxChannel[] = urlChannels;
    if (urlAccountId) {
      const match = accounts.find((a) => a.id === urlAccountId);
      if (match) {
        const ch = match.channel;
        nextChannels = FILTERABLE_CHANNELS.includes(ch) ? [ch] : [];
      }
    }
    setChannels(nextChannels);
    writeSavedChannels(workspace?.id, nextChannels);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlAccountId, urlChannelsRaw, accountId, accounts.length, workspace?.id]);




  const [advOpen, setAdvOpen] = useState(false);

  /** Channel that a given account maps onto in the filter row. */
  const accountChannel = (a: SyncedChannelAccount<ChannelAccountRow>) => a.channel;

  // Toggling channels manually must drop an account selection that no longer matches.
  const toggleChannel = (c: InboxChannel) => {
    const next = channels.includes(c) ? channels.filter((x) => x !== c) : [...channels, c];
    let nextAccount: string | null = accountId;
    if (selectedAccount) {
      const accCh = accountChannel(selectedAccount);
      if (next.length !== 1 || next[0] !== accCh) {
        nextAccount = null;
        setAccountIdState(null);
        writeSavedAccountId(workspace?.id, null);
      }
    }
    applyChannels(next, nextAccount);
  };


  /** Reset everything back to "All accounts / All channels / All conversations". */
  const resetFilters = () => {
    setSearch("");
    selectAccount(null);
    setFilter("all");
  };


  // ⌘K / Ctrl+K opens advanced search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAdvOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Restore the last search term for this workspace (URL wins over storage).
  const searchRestoredRef = useRef(false);
  useEffect(() => {
    if (searchRestoredRef.current || !workspace?.id) return;
    searchRestoredRef.current = true;
    const restored = urlQ ?? readSavedSearch(workspace.id);
    if (restored) {
      setSearch(restored);
      setDebouncedSearch(restored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id]);

  // Debounce the search term, then persist it (URL + per-workspace storage).
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      if (!searchRestoredRef.current) return;
      writeSavedSearch(workspace?.id, search);
      const next = search.trim() ? search : undefined;
      if ((urlQ ?? undefined) !== next) {
        navigate({
          to: ".",
          search: (prev: Record<string, unknown>) => ({ ...prev, q: next }),
          replace: true,
        });
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, workspace?.id]);


  const qc = useQueryClient();
  const { data: counts } = useConversationCounts(inboxId);
  const { data: unreadCounts } = useChannelUnreadCounts(inboxId);
  const channelUnread = unreadCounts?.byChannel;
  const accountUnread = unreadCounts?.byAccount;
  // When one account is selected the badge must reflect that account only,
  // otherwise it shows every channel's unread total.
  const totalChannelUnread = accountId
    ? (accountUnread?.[accountId] ?? 0)
    : Object.values(channelUnread ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  const {
    conversations,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    dataUpdatedAt,
  } = useConversations({
    filter,
    inboxId,
    search: debouncedSearch,
    sort,
    channels: channels.length > 0 ? channels : undefined,
    // Selecting one account must narrow the list to that account, not just to
    // its channel — several WhatsApp accounts share the `whatsapp` channel.
    accountId,
  });

  // Typing indicators for the whole workspace, keyed by conversation id.
  const typingByConversation = useWorkspaceTypingIndicators();



  // Background/auto refetches stay silent; only an explicit manual sync shows
  // the "Updating conversations…" feedback.
  const [manualSync, setManualSync] = useState(false);

  // Per-workspace sync preferences: background cadence + sync button visibility.
  const {
    settings: syncSettings,
    update: updateSyncSettings,
    showSyncButton,
  } = useInboxSyncSettings(workspace?.id);

  // Track when the last refetch (background or manual) finished and how long
  // it took, so the toolbar can prove background updates are still running.
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [lastSyncMs, setLastSyncMs] = useState<number | null>(null);
  // Rolling history of recent sync runs shown in the sync details panel.
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [syncPanelOpen, setSyncPanelOpen] = useState(false);

  const fetchStartedRef = useRef<number | null>(null);
  const countRef = useRef(0);
  countRef.current = conversations.length;
  const errorRef = useRef<unknown>(null);
  errorRef.current = isError ? error : null;
  useEffect(() => {
    if (isFetching) {
      if (fetchStartedRef.current == null) fetchStartedRef.current = Date.now();
      return;
    }
    if (fetchStartedRef.current != null) {
      const ms = Date.now() - fetchStartedRef.current;
      setLastSyncMs(ms);
      fetchStartedRef.current = null;
      const err = errorRef.current;
      setSyncRuns((prev) =>
        [
          {
            at: Date.now(),
            ms,
            count: countRef.current,
            ok: !err,
            error: err
              ? err instanceof Error
                ? err.message
                : String(err)
              : null,
          },
          ...prev,
        ].slice(0, 20),
      );
    }
    if (dataUpdatedAt) setLastSyncedAt(dataUpdatedAt);
  }, [isFetching, dataUpdatedAt, conversations.length, isError, error]);


  // Re-render the relative label on a slow tick so "2m ago" stays truthful.
  const [, setAgoTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setAgoTick((n) => n + 1), 15_000);
    return () => window.clearInterval(t);
  }, []);
  const lastSyncedLabel = formatSyncAgo(lastSyncedAt);

  // Track the most recent sync failure so the toolbar can surface *why* the
  // list may be stale and when it will try again.
  const [lastErrorAt, setLastErrorAt] = useState<number | null>(null);
  const [lastErrorMsg, setLastErrorMsg] = useState<string | null>(null);
  useEffect(() => {
    if (isError) {
      setLastErrorAt(Date.now());
      setLastErrorMsg(
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Unknown sync error",
      );
    } else if (!isFetching && dataUpdatedAt) {
      // A successful refresh clears the failure state.
      setLastErrorAt(null);
      setLastErrorMsg(null);
    }
  }, [isError, error, isFetching, dataUpdatedAt]);

  const syncFailed = isError || lastErrorAt != null;
  const retryIntervalMs = Math.max(syncSettings.refetchIntervalMs || 0, 15_000);
  const nextRetryAt = lastErrorAt != null ? lastErrorAt + retryIntervalMs : null;
  const nextRetryLabel = (() => {
    if (isFetching) return "retrying now…";
    if (nextRetryAt == null) return "—";
    const secs = Math.max(0, Math.round((nextRetryAt - Date.now()) / 1000));
    if (secs <= 0) return "any moment";
    if (secs < 60) return `in ${secs}s`;
    return `in ${Math.round(secs / 60)}m`;
  })();



  const syncNow = () => {
    setManualSync(true);
    void Promise.allSettled([
      refetch(),
      qc.invalidateQueries({ queryKey: ["conversation-counts"] }),
      qc.invalidateQueries({ queryKey: ["conversation-channel-unread"] }),
    ]).finally(() => setManualSync(false));
  };

  const sentinelRef = useInfiniteScroll(
    () => {
      if (hasNextPage && !isFetchingNextPage) fetchNextPage();
    },
    hasNextPage ?? false
  );

  const selectChannel = (c: InboxChannel | null) => {
    setAccountIdState(null);
    writeSavedAccountId(workspace?.id, null);
    applyChannels(c ? [c] : [], null);
    setAccountMenuOpen(false);
    setAccountSearch("");
  };


  const accountsByChannel = (c: InboxChannel) =>
    filteredAccounts.filter((a) => accountChannel(a) === c);

  const q = accountSearch.trim().toLowerCase();
  const visibleChannels = FILTERABLE_CHANNELS.filter(
    (c) => !q || channelLabel(c).toLowerCase().includes(q) || accountsByChannel(c).length > 0,
  );

  const triggerTitle = selectedAccount
    ? selectedAccount.display_name
    : channels.length === 1
      ? channelLabel(channels[0]!)
      : "All channels";
  const triggerSubtitle = accountsError
    ? "Couldn't load accounts — tap to retry"
    : !accountsLoaded
    ? "Loading accounts…"
    : selectedAccount
      ? selectedAccount.phone_number ?? channelLabel(accountChannel(selectedAccount))
      : channels.length === 1
        ? `${accounts.filter((a) => accountChannel(a) === channels[0]).length} account(s)`
        : accounts.length > 0
          ? `${accounts.length} connected`
          : "No accounts connected";


  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Search + filter header */}
      <div className="p-2 sm:p-3 border-b border-border space-y-2">
        {/* Channel + account selector */}
        <DropdownMenu open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-2.5 py-2 text-left transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Select channel or account"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-gradient-accent text-accent-foreground">
                {selectedAccount || channels.length === 1 ? (
                  <ChannelIcon
                    channel={
                      selectedAccount ? accountChannel(selectedAccount) : channels[0]!
                    }
                    className="h-5 w-5"
                    iconClassName="h-4 w-4"
                  />
                ) : (
                  <InboxIcon className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {triggerTitle}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {triggerSubtitle}
                </span>
              </span>
              {totalChannelUnread > 0 && (
                <span className="min-w-[20px] h-5 rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-center text-primary-foreground">
                  {totalChannelUnread > 99 ? "99+" : totalChannelUnread}
                </span>
              )}
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={6}
            collisionPadding={12}
            avoidCollisions
            className="z-50 w-[--radix-dropdown-menu-trigger-width] min-w-72 max-w-[calc(100vw-1.5rem)] p-0"
          >
            <div className="px-2 pt-2 pb-1.5 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  ref={accountSearchRef}
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  placeholder="Search channels or accounts…"
                  className="h-8 pl-7 pr-7 text-xs"
                  aria-label="Search channels and connected accounts"
                  onKeyDown={(e) => {
                    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
                      e.stopPropagation();
                    }
                    if (e.key === "Escape") setAccountMenuOpen(false);
                  }}
                />
                {accountSearch && (
                  <button
                    type="button"
                    onClick={() => setAccountSearch("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Clear search"
                    tabIndex={-1}
                  >
                    <span className="sr-only">Clear</span>
                    <span aria-hidden className="text-[10px] leading-none">×</span>
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto py-1">
              <DropdownMenuItem className="gap-2 mx-1" onSelect={() => selectChannel(null)}>
                <InboxIcon className="h-4 w-4" />
                <span className="flex-1">All channels</span>
                {totalChannelUnread > 0 && (
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {totalChannelUnread > 99 ? "99+" : totalChannelUnread}
                  </span>
                )}
                {!accountId && channels.length === 0 && <Check className="h-3.5 w-3.5 text-accent" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="mx-1" />
              {accountsError ? (
                <div
                  className="mx-1 my-1 rounded-md border border-danger/30 bg-danger-muted px-3 py-3 space-y-2"
                  role="alert"
                  aria-live="assertive"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-semibold text-danger">
                        Couldn't load connected accounts
                      </p>
                      <p className="text-[11px] text-danger/80">
                        {accountsErrorObj instanceof Error && accountsErrorObj.message
                          ? accountsErrorObj.message
                          : "Check your connection and try again."}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-6">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      disabled={accountsFetching}
                      onClick={(e) => {
                        e.preventDefault();
                        void refetchAccounts();
                      }}
                    >
                      <RefreshCw
                        className={`h-3 w-3 ${accountsFetching ? "animate-spin" : ""}`}
                        aria-hidden
                      />
                      {accountsFetching ? "Retrying…" : "Retry"}
                    </Button>
                    <Link
                      to="/integrations/marketplace"
                      className="text-[11px] font-medium text-accent hover:underline"
                      onClick={() => setAccountMenuOpen(false)}
                    >
                      Manage channels
                    </Link>
                  </div>
                </div>
              ) : !accountsLoaded ? (
                <div className="px-2 py-1.5 space-y-2" role="status" aria-live="polite">
                  <p className="px-1 text-[11px] text-muted-foreground">Loading connected accounts…</p>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-2 px-1">
                      <Skeleton className="h-5 w-5 rounded-md" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-2.5 w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
              {invalidAccounts.length > 0 && (
                <div
                  className="mx-1 my-1 rounded-md border border-warning/30 bg-warning-muted px-3 py-2.5 space-y-1.5"
                  role="alert"
                  aria-live="polite"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-semibold text-warning">
                        {invalidAccounts.length} account
                        {invalidAccounts.length > 1 ? "s" : ""} use an unsupported channel type
                      </p>
                      <ul className="space-y-0.5">
                        {invalidAccounts.slice(0, 3).map(({ row, reason }) => (
                          <li key={row.id} className="text-[11px] text-warning/90 truncate">
                            <span className="font-medium">{row.display_name}</span> — {reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="pl-6">
                    <Link
                      to="/integrations/marketplace"
                      className="text-[11px] font-medium text-accent hover:underline"
                      onClick={() => setAccountMenuOpen(false)}
                    >
                      Manage channels
                    </Link>
                  </div>
                </div>
              )}
              {visibleChannels.map((c) => {
                const chAccounts = accountsByChannel(c);
                const unread = channelUnread?.[c] ?? 0;
                const isActive = channels.length === 1 && channels[0] === c;
                const row = (
                  <>
                    <ChannelIcon channel={c} className="h-5 w-5" iconClassName="h-4 w-4" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{channelLabel(c)}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {chAccounts.length > 0
                          ? `${chAccounts.length} account${chAccounts.length > 1 ? "s" : ""}`
                          : "No accounts connected"}
                      </span>
                    </span>
                    {unread > 0 && (
                      <span className="min-w-[20px] h-5 rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-center text-primary-foreground">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                    {isActive && !accountId && <Check className="h-3.5 w-3.5 text-accent" />}
                  </>
                );

                if (chAccounts.length === 0) {
                  const setupTo = channelSetupPath(c);
                  return (
                    <div key={c} className="mx-1 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => selectChannel(c)}
                        className="flex min-h-11 flex-1 items-center gap-2 rounded px-2 text-sm text-left hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
                      >
                        {row}
                      </button>
                      <Link
                        to={setupTo.to}
                        params={setupTo.params}
                        className="shrink-0 rounded px-2 py-1 text-[11px] font-medium text-accent hover:underline"
                        onClick={() => setAccountMenuOpen(false)}
                      >
                        Connect
                      </Link>
                    </div>
                  );
                }


                // On mobile a side-anchored submenu can render off-screen and is
                // hard to tap, so expand the accounts inline instead.
                if (isMobile) {
                  const expanded = expandedChannel === c;
                  return (
                    <div key={c} className="mx-1">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => selectChannel(c)}
                          className="flex min-h-11 flex-1 items-center gap-2 rounded px-2 text-sm text-left hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {row}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedChannel(expanded ? null : c);
                          }}
                          aria-expanded={expanded}
                          aria-label={`${expanded ? "Hide" : "Show"} ${channelLabel(c)} accounts`}
                          className="grid h-11 w-9 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted"
                        >
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                          />
                        </button>
                      </div>
                      {expanded && (
                        <div className="mb-1 ml-4 border-l border-border pl-2">
                          {chAccounts.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => selectAccount(a)}
                              className="flex min-h-11 w-full items-center gap-2 rounded px-2 text-sm text-left hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <ChannelIcon channel={c} className="h-4 w-4" iconClassName="h-3.5 w-3.5" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate">{a.display_name}</span>
                                <span className="block truncate text-[11px] text-muted-foreground">
                                  {a.phone_number ?? channelLabel(c)}
                                </span>
                              </span>
                              <AccountStatusBadge status={a.status} reason={a.status_reason} />
                              {accountId === a.id && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <DropdownMenuSub key={c}>
                    <DropdownMenuSubTrigger className="gap-2 mx-1">
                      {row}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent
                      sideOffset={6}
                      alignOffset={-4}
                      collisionPadding={12}
                      avoidCollisions
                      className="z-[60] max-h-[60vh] w-[min(15rem,calc(100vw-2rem))] overflow-y-auto p-1"
                    >
                      <DropdownMenuItem className="gap-2" onSelect={() => selectChannel(c)}>
                        <ChannelIcon channel={c} className="h-4 w-4" iconClassName="h-3.5 w-3.5" />
                        <span className="flex-1">All {channelLabel(c)} accounts</span>
                        {isActive && !accountId && <Check className="h-3.5 w-3.5 text-accent" />}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {chAccounts.map((a) => (
                        <DropdownMenuItem key={a.id} className="gap-2" onSelect={() => selectAccount(a)}>
                          <ChannelIcon channel={c} className="h-4 w-4" iconClassName="h-3.5 w-3.5" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{a.display_name}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {a.phone_number ?? channelLabel(c)}
                            </span>
                          </span>
                          <AccountStatusBadge status={a.status} reason={a.status_reason} />
                          {accountId === a.id && <Check className="h-3.5 w-3.5 text-accent" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                );

              })}
              {visibleChannels.length === 0 && (
                <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                  No channels or accounts match "{accountSearch}"
                </div>
              )}
              {accounts.length === 0 && (
                <div className="mt-1 border-t border-border px-3 py-3 text-center space-y-2">
                  <p className="text-xs text-muted-foreground">
                    No channel accounts connected yet.
                  </p>
                  <Link
                    to="/integrations/marketplace"
                    className="inline-block text-xs font-medium text-accent hover:underline"
                    onClick={() => setAccountMenuOpen(false)}
                  >
                    Connect a channel
                  </Link>
                </div>
              )}
                </>
              )}

            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="relative flex min-w-0 items-center gap-1">

          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isMobile ? "Search conversations…" : "Search name, phone or message…"}
              className="h-9 pl-8 pr-10 sm:pr-16"
              aria-label="Search conversations by contact name, phone or message text"
            />

            <button
              type="button"
              onClick={() => setAdvOpen(true)}
              className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted sm:block"
              aria-label="Advanced search"
              title="Advanced search (⌘K)"
            >
              ⌘K
            </button>
            <button
              type="button"
              onClick={() => setAdvOpen(true)}
              className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden"
              aria-label="Advanced search"
              title="Advanced search"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 px-2 text-xs"
                aria-label={`Sort conversations: ${sortLabel(sort)}`}
                title={`Sort: ${sortLabel(sort)}`}
              >
                <ArrowUpDown className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">{sortLabel(sort)}</span>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={sort}
                onValueChange={(v) => setSort(v as ConversationSort)}
              >
                <DropdownMenuRadioItem value="recent">
                  Most recent
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="oldest">
                  Oldest first
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="priority">
                  Priority
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="unread">
                  Unread first
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant={selectMode ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => {
              setSelectMode((v) => !v);
              setSelectedIds(new Set());
            }}
            title="Bulk select"
          >
            <CheckSquare className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setLabelsOpen(true)}
            title="Manage labels"
          >
            <Tag className="h-3.5 w-3.5" />
          </Button>
          {showSyncButton && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={syncNow}
              disabled={manualSync}
              title="Sync conversations"
              aria-label="Sync conversations"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", manualSync && "animate-spin")} />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                title="Sync settings"
                aria-label="Sync settings"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Realtime</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={syncSettings.realtimeEnabled}
                onCheckedChange={(checked) =>
                  updateSyncSettings({ realtimeEnabled: Boolean(checked) })
                }
              >
                Live updates
              </DropdownMenuCheckboxItem>
              <div className="px-2 pb-1.5 text-[11px] text-muted-foreground">
                {syncSettings.realtimeEnabled
                  ? "New messages and status changes arrive instantly."
                  : "Off — this workspace only updates on refresh or manual sync."}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Background refresh</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={String(syncSettings.refetchIntervalMs)}
                onValueChange={(v) =>
                  updateSyncSettings({ refetchIntervalMs: Number(v) })
                }
              >
                {SYNC_INTERVAL_OPTIONS.map((o) => (
                  <DropdownMenuRadioItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Manual sync button</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={syncSettings.syncButtonMode}
                onValueChange={(v) =>
                  updateSyncSettings({ syncButtonMode: v as typeof syncSettings.syncButtonMode })
                }
              >
                {SYNC_BUTTON_OPTIONS.map((o) => (
                  <DropdownMenuRadioItem key={o.value} value={o.value}>
                    {o.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-[11px] text-muted-foreground space-y-0.5">
                <div>Last synced: {lastSyncedLabel}</div>
                <div>Duration: {formatSyncDuration(lastSyncMs)}</div>
                {syncFailed && (
                  <>
                    <div className="text-destructive">Last error: {lastErrorMsg ?? "Unknown sync error"}</div>
                    <div className="text-destructive">Next retry: {nextRetryLabel}</div>
                  </>
                )}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => syncNow()} disabled={manualSync}>
                <RefreshCw className={cn("h-3.5 w-3.5 mr-2", manualSync && "animate-spin")} />
                Sync now
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <TooltipProvider delayDuration={100}>
            <Popover open={syncPanelOpen} onOpenChange={setSyncPanelOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label={syncFailed ? "Sync failed — open sync details" : "Open sync details"}
                      className={cn(
                        "ml-auto control-focus control-motion inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-control",
                        syncFailed
                          ? "text-destructive hover:text-destructive"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {syncFailed ? (
                        <AlertTriangle className="h-3.5 w-3.5" />
                      ) : (
                        <Info className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end" className="max-w-xs">
                  <div className="space-y-0.5">
                    {syncFailed && (
                      <>
                        <div className="font-medium text-destructive">Sync failed</div>
                        <div className="break-words">{lastErrorMsg ?? "Unknown sync error"}</div>
                        {lastErrorAt != null && (
                          <div>Failed at: {new Date(lastErrorAt).toLocaleTimeString()}</div>
                        )}
                        <div>Next retry: {nextRetryLabel}</div>
                      </>
                    )}
                    <div>Last synced: {lastSyncedLabel}</div>
                    <div>Duration: {formatSyncDuration(lastSyncMs)}</div>
                    <div>Conversations: {conversations.length}</div>
                    <div className="pt-0.5 text-muted-foreground">Click for sync details</div>
                  </div>
                </TooltipContent>
              </Tooltip>
              <PopoverContent side="bottom" align="end" className="w-80 p-0">
                <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                  <div className="text-xs font-medium">Sync details</div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => syncNow()}
                    disabled={manualSync}
                  >
                    <RefreshCw className={cn("mr-1 h-3 w-3", manualSync && "animate-spin")} />
                    Sync now
                  </Button>
                </div>
                <div className="space-y-1 border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
                  <div className="flex justify-between gap-2">
                    <span>Status</span>
                    <span className={cn("font-medium", syncFailed ? "text-destructive" : "text-foreground")}>
                      {isFetching ? "Syncing…" : syncFailed ? "Failed" : "Healthy"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Last synced</span>
                    <span className="text-foreground">{lastSyncedLabel}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Duration</span>
                    <span className="text-foreground">{formatSyncDuration(lastSyncMs)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Conversations</span>
                    <span className="text-foreground">{conversations.length}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Background refresh</span>
                    <span className="text-foreground">
                      {SYNC_INTERVAL_OPTIONS.find(
                        (o) => o.value === syncSettings.refetchIntervalMs,
                      )?.label ?? `${Math.round(syncSettings.refetchIntervalMs / 1000)}s`}
                    </span>
                  </div>
                  {syncFailed && (
                    <>
                      <div className="text-destructive break-words">
                        Last error: {lastErrorMsg ?? "Unknown sync error"}
                      </div>
                      <div className="text-destructive">Next retry: {nextRetryLabel}</div>
                    </>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {syncRuns.length === 0 ? (
                    <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
                      No sync runs recorded yet.
                    </div>
                  ) : (
                    <ul className="divide-y divide-border">
                      {syncRuns.map((run) => (
                        <li key={run.at} className="px-3 py-1.5 text-[11px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5">
                              {run.ok ? (
                                <Check className="h-3 w-3 text-emerald-500" />
                              ) : (
                                <AlertTriangle className="h-3 w-3 text-destructive" />
                              )}
                              <span className="tabular-nums">
                                {new Date(run.at).toLocaleTimeString()}
                              </span>
                            </span>
                            <span className="tabular-nums text-muted-foreground">
                              {formatSyncDuration(run.ms)} · {run.count}{" "}
                              {run.count === 1 ? "item" : "items"}
                            </span>
                          </div>
                          {!run.ok && run.error && (
                            <div className="mt-0.5 break-words text-destructive">{run.error}</div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </TooltipProvider>

        </div>
      </div>

      {selectMode && conversations.length > 0 && (
        <div className="px-3 py-1.5 border-b border-border flex items-center gap-2 bg-muted/40">
          <Checkbox
            checked={
              selectedIds.size > 0 && selectedIds.size === conversations.length
            }
            onCheckedChange={(v) => {
              if (v) setSelectedIds(new Set(conversations.map((c) => c.id)));
              else setSelectedIds(new Set());
            }}
            aria-label="Select all"
          />
          <span className="text-xs text-muted-foreground">
            {selectedIds.size > 0
              ? `${selectedIds.size} selected`
              : "Select all visible"}
          </span>
          <div className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
            <SlidersHorizontal className="h-3 w-3" />
            Bulk mode
          </div>
        </div>
      )}






      {/* Background refresh indicator */}
      {manualSync && !isLoading && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30 text-[11px] text-muted-foreground"
        >
          <RefreshCw className="h-3 w-3 animate-spin" aria-hidden />
          Updating conversations…
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto" role="listbox" aria-label="Conversations">
        {isLoading ? (
          <div role="status" aria-live="polite">
            <span className="sr-only">Loading conversations…</span>
            {Array.from({ length: 8 }).map((_, i) => (
              <ConversationListItemSkeleton key={i} />
            ))}
          </div>

        ) : isError ? (
          <div className="p-6 text-center space-y-3">
            <AlertCircle className="h-8 w-8 mx-auto text-destructive" aria-hidden />
            <div className="text-sm font-medium">Could not load conversations</div>
            <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {(error as { message?: string } | null)?.message ?? "Unknown error"}
            </p>
            <Button size="sm" variant="outline" onClick={syncNow} disabled={manualSync}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", manualSync && "animate-spin")} />
              Retry sync
            </Button>
          </div>
        ) : conversations.length === 0 ? (
          <EmptyState
            filter={filter}
            filterLabel={TABS.find((t) => t.id === filter)?.label ?? filter}
            search={debouncedSearch}
            accountName={selectedAccount?.display_name ?? null}
            channelCount={channels.length}
            canReset={Boolean(selectedAccount) || filter !== "all" || channels.length > 0}
            onReset={resetFilters}
            onSync={syncNow}
            isFetching={manualSync}
          />
        ) : (


          <>
            {conversations.map((c) => {
              const checked = selectedIds.has(c.id);
              return (
                <div key={c.id} className={cn("flex items-stretch", selectMode && "gap-0")}>
                  {selectMode && (
                    <label className="flex items-center px-2 border-b border-border cursor-pointer hover:bg-muted">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          setSelectedIds((s) => {
                            const n = new Set(s);
                            if (v) n.add(c.id);
                            else n.delete(c.id);
                            return n;
                          })
                        }
                        aria-label="Select conversation"
                      />
                    </label>
                  )}
                  <div className="flex-1 min-w-0">
                    <ConversationListItem
                      conversation={c}
                      isActive={c.id === selectedId}
                      typingUserIds={typingByConversation[c.id]}
                      onSelect={() =>
                        selectMode
                          ? setSelectedIds((s) => {
                              const n = new Set(s);
                              if (n.has(c.id)) n.delete(c.id);
                              else n.add(c.id);
                              return n;
                            })
                          : onSelect(c)
                      }
                    />
                  </div>
                </div>
              );
            })}
            <div ref={sentinelRef} className="h-9" />
            {isFetchingNextPage && (
              <div className="p-3">
                <ConversationListItemSkeleton />
              </div>
            )}
          </>
        )}
      </div>

      {selectMode && (
        <BulkActionsBar
          selectedIds={Array.from(selectedIds)}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      <LabelManagerDialog open={labelsOpen} onOpenChange={setLabelsOpen} />
      <AdvancedSearchDialog
        open={advOpen}
        onOpenChange={setAdvOpen}
        onSelectHit={(hit) => {
          if (hit.conversation_id) {
            // Best-effort: match against currently loaded list; otherwise the caller reloads.
            const found = conversations.find((c) => c.id === hit.conversation_id);
            if (found) onSelect(found);
          }
        }}
      />
    </div>
  );
}

function sortLabel(s: ConversationSort) {
  switch (s) {
    case "oldest":
      return "Oldest";
    case "priority":
      return "Priority";
    case "unread":
      return "Unread";
    default:
      return "Recent";
  }
}

function EmptyState({
  filter,
  filterLabel,
  search,
  accountName,
  channelCount,
  canReset,
  onReset,
  onSync,
  isFetching,
}: {
  filter: ConversationFilter;
  filterLabel: string;
  search: string;
  accountName: string | null;
  channelCount: number;
  canReset: boolean;
  onReset: () => void;
  onSync: () => void;
  isFetching: boolean;
}) {
  const title = search
    ? "No matches"
    : accountName
      ? `No conversations for ${accountName}`
      : filter === "unread"
        ? "Everything's read"
        : filter === "mine"
          ? "No conversations assigned to you"
          : channelCount > 0
            ? "No conversations on the selected channels"
            : "No conversations yet";

  const detail = search
    ? `Nothing found for "${search}".`
    : accountName
      ? `Nothing under the “${filterLabel}” filter for this account. Conversations on other channels may still exist — use “Show all conversations”.`
      : filter !== "all" || channelCount > 0
        ? `Nothing matches the “${filterLabel}” filter right now.`
        : "New messages appear here in realtime.";


  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="h-12 w-12 rounded-full bg-muted grid place-items-center mb-3">
        <InboxIcon className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-[260px] [overflow-wrap:anywhere]">
        {detail}
      </p>
      <div className="mt-4 flex items-center gap-2">
        {canReset && (
          <Button size="sm" variant="outline" onClick={onReset}>
            Show all conversations
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onSync} disabled={isFetching}>
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>
    </div>
  );
}

