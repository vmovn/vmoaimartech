import { useEffect, useMemo, useRef, useState } from "react";
import { format, isSameDay } from "date-fns";
import { Badge } from "@/components/ui/badge";


import { cn } from "@/lib/utils";

import {
  useMessages,
  useResumeQueuedMessages,
  type MessageRow,
} from "@/hooks/use-messages";
import {
  useTypingIndicators,
  useMarkAsRead,
  type ConversationRow,
} from "@/hooks/use-conversations";

import { useAuth } from "@/hooks/use-auth";
import { MessageBubble, DayDivider, extractContactCards } from "./message-bubble";
import { MessageComposer } from "./message-composer";
import { ForwardMessageDialog } from "./forward-message-dialog";
import { OfflineQueueBanner } from "./offline-queue-banner";
import { ChannelSwitcher } from "./channel-switcher";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  conversation: ConversationRow;
};

export function ConversationWindow({ conversation }: Props) {
  const { user } = useAuth();
  const {
    messages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMessages(conversation.id);
  const safeMessages = Array.isArray(messages) ? messages : [];
  const { data: typing } = useTypingIndicators(conversation.id);
  const markRead = useMarkAsRead();
  const [replyTo, setReplyTo] = useState<MessageRow | null>(null);
  const [forwardTarget, setForwardTarget] = useState<MessageRow | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const lastReadSyncRef = useRef<string | null>(null);
  // Anchor scroll position when older messages are prepended so the viewport
  // does not jump to the top on mobile.
  const preservedScrollRef = useRef<{ height: number; top: number } | null>(null);

  // Resume delivery for messages left stuck at `queued` (dropped send request).
  const resumeQueued = useResumeQueuedMessages();
  const resumeAttemptRef = useRef<string | null>(null);
  const stuckQueuedId = useMemo(() => {
    const cutoff = Date.now() - 20_000;
    const stuck = safeMessages.find(
      (m) =>
        m.direction === "outbound" &&
        m.status === "queued" &&
        !String(m.id).startsWith("temp-") &&
        new Date(m.created_at).getTime() < cutoff,
    );
    return stuck?.id ?? null;
  }, [safeMessages]);

  useEffect(() => {
    if (!stuckQueuedId) return;
    const key = `${conversation.id}:${stuckQueuedId}`;
    if (resumeAttemptRef.current === key) return;
    resumeAttemptRef.current = key;
    resumeQueued.mutate(conversation.id);
    // `resumeQueued` is a stable mutation object; retry is guarded by the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, stuckQueuedId]);

  const online =
    conversation.contact?.last_seen_at &&
    Date.now() - new Date(conversation.contact.last_seen_at).getTime() <
      5 * 60 * 1000;




  const othersTyping = (Array.isArray(typing) ? typing : []).filter((t) => t.user_id !== user?.id);
  const latestInboundMessageId = useMemo(
    () => safeMessages.slice().reverse().find((m) => m.direction === "inbound" && !m.is_internal)?.id ?? null,
    [safeMessages],
  );

  // Prefill candidates for the "Share contact" modal: most recent contact-card
  // attachment in the thread first, then the conversation's recipient.
  const contactPrefill = useMemo(() => {
    const seen = new Set<string>();
    const cards: {
      name?: string;
      phone?: string;
      email?: string;
      source: "attachment" | "recipient";
      existingContactId?: string | null;
    }[] = [];
    for (let i = safeMessages.length - 1; i >= 0; i--) {
      const m = safeMessages[i];
      if (!m?.metadata) continue;
      let extracted: {
        name?: string;
        phone?: string;
        email?: string;
        existingContactId?: string | null;
      }[] = [];
      try {
        extracted = extractContactCards(m.metadata);
      } catch {
        continue;
      }
      for (const c of extracted) {
        const k = `${c.name ?? ""}|${c.phone ?? ""}|${c.email ?? ""}`;
        if (seen.has(k)) continue;
        seen.add(k);
        cards.push({
          name: c.name,
          phone: c.phone,
          email: c.email,
          existingContactId: c.existingContactId ?? null,
          source: "attachment",
        });
      }
    }
    const c = conversation.contact;
    if (c) {
      const name =
        c.display_name ??
        [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ??
        undefined;
      const recipient = {
        name: name || undefined,
        phone: c.phone ?? undefined,
        email: c.email ?? undefined,
      };
      const k = `${recipient.name ?? ""}|${recipient.phone ?? ""}|${recipient.email ?? ""}`;
      if ((recipient.name || recipient.phone || recipient.email) && !seen.has(k)) {
        cards.push({
          ...recipient,
          source: "recipient",
          existingContactId: c.id ?? null,
        });
      }
    }
    return cards;
  }, [safeMessages, conversation.contact]);


  // Mark as read on open and when a new inbound message arrives while open.
  useEffect(() => {
    const readKey = `${conversation.id}:${latestInboundMessageId ?? "none"}`;
    const previousKey = lastReadSyncRef.current;
    const firstSyncForConversation = !previousKey?.startsWith(`${conversation.id}:`);
    const hasUnread = conversation.unread_count > 0;
    const hasNewInbound = !!latestInboundMessageId && readKey !== previousKey;

    if (!hasUnread && firstSyncForConversation) {
      lastReadSyncRef.current = readKey;
      return;
    }

    if (!hasUnread && !hasNewInbound) return;

    lastReadSyncRef.current = readKey;
    markRead.mutate({
      conversationId: conversation.id,
      optimisticConversation: conversation,
      assumeUnread: hasNewInbound,
    });

    // Run once more after webhook/conversation counters settle so an open
    // conversation cannot retain a late unread increment from the backend.
    const settleTimer = window.setTimeout(() => markRead.mutate(conversation.id), 900);
    return () => window.clearTimeout(settleTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, conversation.unread_count, latestInboundMessageId]);

  // Auto-scroll on new messages (only if near bottom) and restore position
  // when older messages are prepended by the infinite loader.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prevCount = prevCountRef.current;
    const isNew = safeMessages.length > prevCount;

    // Older-message prepend: restore the previous scroll offset from bottom.
    if (isNew && preservedScrollRef.current && prevCount > 0) {
      const { height, top } = preservedScrollRef.current;
      const delta = el.scrollHeight - height;
      if (delta > 0) el.scrollTop = top + delta;
      preservedScrollRef.current = null;
      prevCountRef.current = safeMessages.length;
      return;
    }

    if (isNew) {
      bottomRef.current?.scrollIntoView({
        behavior: prevCount === 0 ? "auto" : "smooth",
        block: "end",
      });
    }
    prevCountRef.current = safeMessages.length;
  }, [safeMessages]);

  // Infinite scroll upward (load older). Snapshot scroll geometry BEFORE
  // fetching so the effect above can restore position after the prepend.
  useEffect(() => {
    const el = topSentinelRef.current;
    const scroller = scrollRef.current;
    if (!el || !scroller || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          preservedScrollRef.current = {
            height: scroller.scrollHeight,
            top: scroller.scrollTop,
          };
          fetchNextPage();
        }
      },
      { root: scroller, rootMargin: "160px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const groups = useMemo(() => groupByDay(safeMessages), [safeMessages]);


  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 relative">
      {/* Slim channel bar — main conversation actions live in ConversationHeader above. */}
      <div data-testid="inbox-channel-subheader" style={{ paddingLeft: "max(0.75rem, env(safe-area-inset-left))" }} className="sticky top-0 z-10 h-12 sm:pl-4 pr-2 sm:pr-4 border-b border-border flex items-center gap-2 overflow-hidden bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/60">
        <ChannelSwitcher conversation={conversation} align="start" />
        <Badge variant="secondary" className="capitalize text-[10px] hidden sm:inline-flex shrink-0">
          {conversation.priority}
        </Badge>
        {othersTyping.length > 0 && (
          <span className="text-xs text-primary animate-fade-in ml-auto truncate">typing…</span>
        )}
        {!othersTyping.length && online && (
          <span className="text-xs text-muted-foreground ml-auto truncate">online</span>
        )}
      </div>



      <OfflineQueueBanner />

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto scroll-smooth [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch] [overflow-anchor:none] px-3 sm:px-6 py-4 bg-chat-pattern"
        style={{
          backgroundImage: [
            "radial-gradient(circle at 18% 12%, color-mix(in oklab, var(--primary) 7%, transparent), transparent 45%)",
            "radial-gradient(circle at 82% 78%, color-mix(in oklab, var(--accent) 6%, transparent), transparent 45%)",
            "radial-gradient(color-mix(in oklab, var(--muted-foreground) 18%, transparent) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "auto, auto, 22px 22px",
        }}
      >
        <div ref={topSentinelRef} />
        {isFetchingNextPage && (
          <div className="text-center text-xs text-muted-foreground py-2">
            Loading earlier messages…
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className={cn("flex", i % 2 ? "justify-end" : "justify-start")}
              >
                <Skeleton className="h-10 w-52 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : safeMessages.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-muted-foreground">
            No messages yet. Say hello 👋
          </div>
        ) : (
          <div className="space-y-2 max-w-3xl mx-auto">
            {groups.map((g) => (
              <div key={g.key}>
                <DayDivider date={g.date} />
                <div className="space-y-1.5">
                  {g.items.map((m, idx) => {
                    const prev = g.items[idx - 1];
                    const isOwn = m.direction === "outbound";
                    const sameSender =
                      prev &&
                      prev.direction === m.direction &&
                      prev.sent_by === m.sent_by;
                    return (
                      <MessageBubble
                        key={m.id}
                        message={m}
                        isOwn={isOwn}
                        showAvatar={!sameSender}
                        currentUserId={user?.id}
                        onReply={setReplyTo}
                        onForward={setForwardTarget}
                      />
                    );
                  })}
                </div>
              </div>
            ))}

            {othersTyping.length > 0 && (
              <div className="flex items-end gap-2 animate-fade-in">
                <div className="w-8" />
                <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                  <TypingDots />
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <MessageComposer
        conversationId={conversation.id}
        workspaceId={conversation.workspace_id}
        channel={conversation.channel}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        contactPrefill={contactPrefill}
        contactId={conversation.contact_id}
      />


      <ForwardMessageDialog
        open={!!forwardTarget}
        onOpenChange={(o) => !o && setForwardTarget(null)}
        message={forwardTarget}
        excludeConversationId={conversation.id}
      />
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1">
      <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
      <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
      <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce" />
    </div>
  );
}

function groupByDay(messages: MessageRow[]) {
  const groups: { key: string; date: Date; items: MessageRow[] }[] = [];
  for (const m of messages) {
    const d = new Date(m.created_at);
    const last = groups[groups.length - 1];
    if (last && isSameDay(last.date, d)) {
      last.items.push(m);
    } else {
      groups.push({ key: d.toDateString(), date: d, items: [m] });
    }
  }
  return groups;
}
