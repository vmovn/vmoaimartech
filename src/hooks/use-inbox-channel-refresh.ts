/**
 * Force-fetch Inbox data when the channel/account filter changes.
 *
 * Switching channels swaps the React Query key (`["conversations", ws, params]`),
 * so a previously cached page for that key can render immediately with data
 * from an earlier visit — the "needs a hard refresh" symptom. Realtime events
 * that arrived while another channel was selected only invalidated the *other*
 * key, so nothing refetched on switch.
 *
 * This hook cancels in-flight requests for the previous selection and forces a
 * network refetch of the active conversation list, folder counts and per-channel
 * unread badges every time the selection changes.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

const KEYS = ["conversations", "conversation-counts", "conversation-channel-unread"] as const;

export function useInboxChannelRefresh(
  workspaceId: string | undefined,
  channels: string[],
  accountId: string | null,
) {
  const qc = useQueryClient();
  const selectionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    const selection = `${workspaceId}|${[...channels].sort().join(",")}|${accountId ?? "all"}`;
    if (selectionRef.current === selection) return;
    const isFirstRun = selectionRef.current === null;
    selectionRef.current = selection;
    // The initial mount already fetches through the normal query lifecycle.
    if (isFirstRun) return;

    let cancelled = false;
    void (async () => {
      for (const key of KEYS) {
        // Drop responses for the filter the user just left.
        await qc.cancelQueries({ queryKey: [key, workspaceId] });
      }
      if (cancelled) return;
      // Mark every cached entry stale so optimistic badge deltas applied while
      // another channel was selected can never survive the switch.
      for (const key of KEYS) {
        void qc.invalidateQueries({ queryKey: [key, workspaceId], refetchType: "none" });
      }
      // Recalculate badges from the same server source as the list: refetch the
      // conversation list and the unread/folder counts together, including
      // inactive count queries (other inbox scopes) so no stale badge lingers.
      await Promise.all([
        qc.refetchQueries({ queryKey: ["conversations", workspaceId], type: "active" }),
        qc.refetchQueries({ queryKey: ["conversation-counts", workspaceId], type: "all" }),
        qc.refetchQueries({
          queryKey: ["conversation-channel-unread", workspaceId],
          type: "all",
        }),
      ]);
    })();


    return () => {
      cancelled = true;
    };
  }, [qc, workspaceId, channels, accountId]);
}
