import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { OrganizationSwitcher, type SwitcherWorkspace } from "./organization-switcher";
import {
  useOrganizations,
  setActiveOrgId,
  isValidOrgId,
  resolveActiveOrgId,
  type OrganizationRow,
} from "@/hooks/use-organization";

import {
  useWorkspaces,
  useCurrentWorkspace,
  setActiveWorkspaceId,
  useCreateWorkspace,
} from "@/hooks/use-workspace";
import type { Organization } from "@/shared/hooks/use-active-organization";
import { supabase } from "@/integrations/supabase/client";
import {
  hasUnsavedChanges,
  listUnsavedLabels,
} from "@/hooks/use-unsaved-changes";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RealtimeStatusIndicator } from "./realtime-status-indicator";
import { logOrganizationSwitch } from "@/lib/org-switch-audit.functions";
import { resetRealtimeForOrgSwitch } from "@/lib/realtime/org-realtime";
import { onRemoteOrgChange } from "@/lib/realtime/org-cross-tab";
import { readActiveOrgId } from "@/lib/tenant/active-tenant";

function readActiveId(): string | null {
  return readActiveOrgId();
}


function toSwitcherOrg(o: OrganizationRow): Organization {
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    avatarUrl: o.logo_url ?? undefined,
  };
}

/**
 * Connected OrganizationSwitcher — reads the user's organizations, exposes
 * the active one from localStorage, and lets the user confirm/switch after
 * a personal org is auto-provisioned on first API call.
 */
export function OrganizationSwitcherConnected({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  const qc = useQueryClient();
  const { data: orgs = [], isLoading, isError, error, refetch } = useOrganizations();
  const { data: allWorkspaces = [] } = useWorkspaces();
  const { active: activeWorkspace } = useCurrentWorkspace();
  const createWorkspace = useCreateWorkspace();
  const [activeId, setActiveId] = React.useState<string | null>(readActiveId);
  const [switchingId, setSwitchingId] = React.useState<string | null>(null);
  // Visible phase driver — surfaces WHY the switcher is disabled at each
  // step of the quiescence pipeline so the tooltip / progress caption can
  // stay in sync with the real work happening under the hood.
  const [switchPhase, setSwitchPhase] = React.useState<
    "clearing" | "settling" | "loading" | "finalizing" | null
  >(null);
  // Synchronous re-entry lock: React state updates are async, so two rapid
  // clicks within the same tick can both pass a state-based guard. A ref
  // flips synchronously and blocks the second call before it starts.
  const switchLockRef = React.useRef(false);

  /**
   * Total time budget for a switch operation before we abort and surface a
   * retryable error. Covers channel teardown + query cancellation + cache
   * quiescence. Post-switch data loading has its own watchdog below.
   */
  const SWITCH_TIMEOUT_MS = 8000;
  /**
   * Time budget for the new org's initial data to start settling after we
   * flip the active id. If TanStack Query is still fetching after this
   * window, we assume the tenant is slow/unreachable and show a retry toast.
   */
  const POST_SWITCH_LOAD_TIMEOUT_MS = 12000;

  /**
   * Wait for TanStack Query to report no in-flight fetches or mutations.
   * We call this AFTER `cancelQueries()` + `getMutationCache().clear()` so
   * any lingering requests should settle within a few microtasks. Resolves
   * `true` on quiescence, `false` if the timeout elapses first (caller
   * treats that as a hard failure).
   */
  const waitForQuiescence = React.useCallback(
    async (timeoutMs = 1500, signal?: AbortSignal): Promise<boolean> => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (signal?.aborted) return false;
        if (qc.isFetching() === 0 && qc.isMutating() === 0) return true;
        await new Promise((r) => setTimeout(r, 25));
      }
      return false;
    },
    [qc],
  );

  /**
   * After the active org flips, wait until the new tenant's queries settle.
   * Resolves `true` on quiescence, `false` on timeout so callers can raise
   * a retryable error instead of leaving the UI hanging on spinners.
   */
  const waitForPostSwitchLoad = React.useCallback(
    async (timeoutMs: number, signal: AbortSignal): Promise<boolean> => {
      const start = Date.now();
      // Give hooks a tick to subscribe & kick off their first fetches.
      await new Promise((r) => setTimeout(r, 50));
      while (Date.now() - start < timeoutMs) {
        if (signal.aborted) return false;
        if (qc.isFetching() === 0 && qc.isMutating() === 0) return true;
        await new Promise((r) => setTimeout(r, 50));
      }
      return false;
    },
    [qc],
  );

  // Reconcile the stored active id against the user's actual memberships.
  // Covers three failure modes:
  //   1. No id stored yet (first load) → pick the first org.
  //   2. Stored id is malformed / tampered → `readActiveId` already cleared
  //      it, so we fall through to the first-org fallback.
  //   3. Stored id points at an org the user was removed from (or that was
  //      deleted) → snap to the first available membership and warn.
  React.useEffect(() => {
    if (orgs.length === 0) return;
    const stored = readActiveId();
    const resolved = resolveActiveOrgId(stored, orgs);
    if (!resolved) return;
    if (resolved !== stored) {
      if (stored && isValidOrgId(stored)) {
        // Well-formed id, but not in the membership list → surface this so
        // the user understands why the sidebar just jumped orgs.
        toast.warning("Previously selected organization is no longer available", {
          description: `Switched to ${orgs.find((o) => o.id === resolved)?.name ?? "your first organization"}.`,
        });
      }
      setActiveId(resolved);
      setActiveOrgId(resolved);
    } else if (activeId !== resolved) {
      setActiveId(resolved);
    }
  }, [activeId, orgs]);


  // Keep in sync with cross-tab / programmatic changes.
  // When another tab flips the active org, we mirror the switch in this tab:
  // silence org-A realtime, purge its cached queries, adopt the new id, and
  // broadcast a resubscribe signal so hooks re-open channels scoped to org-B.
  // No page reload — TanStack Query refetches on demand for the new key.
  React.useEffect(() => {
    const applyRemote = (nextId: string | null) => {
      const currentId = readActiveId();
      if (!nextId || nextId === currentId) {
        setActiveId(currentId);
        return;
      }
      // Mirror the local switch pipeline, minus the toast/audit overhead.
      resetRealtimeForOrgSwitch("pre-switch");
      void qc.cancelQueries().finally(() => {
        qc.removeQueries();
        qc.getMutationCache().clear();
        setActiveId(nextId);
        resetRealtimeForOrgSwitch("post-switch");
        toast.info("Active organization changed in another tab");
      });
    };

    const onLocal = () => setActiveId(readActiveId());
    window.addEventListener("pmai:org-changed", onLocal);
    const unsubRemote = onRemoteOrgChange(applyRemote);
    return () => {
      window.removeEventListener("pmai:org-changed", onLocal);
      unsubRemote();
    };
  }, [qc]);


  // Pending target when the user tried to switch while there were unsaved
  // edits. When set, the AlertDialog below is open; confirming discards the
  // edits and proceeds, cancelling drops the intent.
  const [pendingSwitch, setPendingSwitch] = React.useState<{
    id: string;
    label: string;
    dirtyLabels: string[];
  } | null>(null);

  const performSwitch = React.useCallback(
    async (id: string) => {
      // Synchronous guard: ref flips before React re-renders, so a second
      // click in the same tick is dropped instead of racing the first.
      if (switchLockRef.current) return;
      if (id === activeId || switchingId) return;
      switchLockRef.current = true;
      const picked = orgs.find((o) => o.id === id);
      const label = picked?.name ?? "organization";
      const previousId = activeId;
      const previous = orgs.find((o) => o.id === activeId);
      const startedAt = Date.now();
      setSwitchingId(id);
      setSwitchPhase("clearing");
      const progress = toast.loading(`Switching to ${label}…`, {
        description: "Clearing data cache and reconnecting realtime channels.",
      });

      // AbortController driving both timeout paths. If the overall budget
      // expires we abort, roll back the optimistic selection, and surface a
      // retry action to the user.
      const controller = new AbortController();
      const timeoutHandle = window.setTimeout(
        () => controller.abort(new DOMException("switch-timeout", "TimeoutError")),
        SWITCH_TIMEOUT_MS,
      );

      let purgeError: unknown = null;
      try {
        // Phase 1 — silence org-A realtime BEFORE we drop cached data so
        // late `postgres_changes` payloads can't reseed the cache we're
        // about to purge.
        const preTeardown = resetRealtimeForOrgSwitch("pre-switch");
        if (!preTeardown.ok) purgeError = preTeardown.error;

        // Race the cache-purge steps against the switch budget so a wedged
        // fetch/mutation can't hold the switcher open indefinitely.
        await qc.cancelQueries();
        qc.removeQueries();
        qc.getMutationCache().clear();
        if (controller.signal.aborted) {
          throw new Error("Timed out while clearing cached data");
        }

        setSwitchPhase("settling");
        const settled = await waitForQuiescence(1500, controller.signal);
        if (!settled) {
          throw new Error(
            controller.signal.aborted
              ? "Timed out while clearing cached data"
              : "Background requests didn't settle in time",
          );
        }

        // Flip the active org last so subscribers re-key against an empty cache.
        setSwitchPhase("finalizing");
        setActiveId(id);
        setActiveOrgId(id);

        // Phase 2 — any channel that raced back up during settle/quiescence
        // is torn down now, and we broadcast a `realtime-reset` so hooks
        // that opt into `useRealtimeGeneration()` immediately resubscribe
        // with org-B filters.
        const postTeardown = resetRealtimeForOrgSwitch("post-switch");
        if (!postTeardown.ok && !purgeError) purgeError = postTeardown.error;

        // Watch the new tenant's initial load. If it stalls past the
        // post-switch budget, we roll the UI back and let the user retry.
        setSwitchPhase("loading");
        const loaded = await waitForPostSwitchLoad(
          POST_SWITCH_LOAD_TIMEOUT_MS,
          controller.signal,
        );
        if (!loaded) {
          if (previousId) {
            setActiveId(previousId);
            setActiveOrgId(previousId);
          }
          throw new Error(
            controller.signal.aborted
              ? `Loading ${label} timed out`
              : `${label} took too long to load`,
          );
        }

        toast.dismiss(progress);
        if (purgeError) {
          const msg = purgeError instanceof Error ? purgeError.message : String(purgeError);
          toast.warning(`Switched to ${label}, but couldn't fully clear background data`, {
            description: msg,
          });
        } else {
          toast.success(`Switched to ${label}`, {
            description: "Data cache cleared and realtime channels resubscribed.",
          });
        }
        // Best-effort audit log — never blocks or fails the switch.
        void logOrganizationSwitch({
          data: {
            fromOrgId: previousId ?? null,
            toOrgId: id,
            fromOrgName: previous?.name ?? null,
            toOrgName: picked?.name ?? null,
            outcome: "success",
            purgeSucceeded: !purgeError,
            purgeError: purgeError
              ? purgeError instanceof Error
                ? purgeError.message
                : String(purgeError)
              : null,
            durationMs: Date.now() - startedAt,
            userAgent:
              typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
          },
        }).catch(() => {});
      } catch (e) {
        toast.dismiss(progress);
        const isTimeout =
          controller.signal.aborted ||
          (e instanceof Error && /timed out|too long/i.test(e.message));
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(
          isTimeout ? `Switching to ${label} timed out` : `Failed to switch to ${label}`,
          {
            description: msg,
            duration: 10000,
            action: { label: "Retry", onClick: () => void performSwitch(id) },
          },
        );
        void logOrganizationSwitch({
          data: {
            fromOrgId: previousId ?? null,
            toOrgId: id,
            fromOrgName: previous?.name ?? null,
            toOrgName: picked?.name ?? null,
            outcome: isTimeout ? "timeout" : "failure",
            purgeSucceeded: !purgeError,
            purgeError: purgeError
              ? purgeError instanceof Error
                ? purgeError.message
                : String(purgeError)
              : null,
            durationMs: Date.now() - startedAt,
            reason: msg.slice(0, 500),
            userAgent:
              typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
          },
        }).catch(() => {});
      } finally {
        window.clearTimeout(timeoutHandle);
        setSwitchingId(null);
        setSwitchPhase(null);
        switchLockRef.current = false;
      }
    },
    [activeId, switchingId, orgs, qc, waitForQuiescence, waitForPostSwitchLoad],
  );

  /**
   * Public entry point invoked by the switcher UI. If the current page has
   * unsaved edits registered via `useUnsavedChanges`, we open a confirmation
   * modal instead of running the switch immediately. Confirming the modal
   * discards the pending edits (the caller's local state) and proceeds.
   */
  const handleSelect = React.useCallback(
    (id: string) => {
      if (id === activeId || switchingId) return;
      if (hasUnsavedChanges()) {
        const picked = orgs.find((o) => o.id === id);
        setPendingSwitch({
          id,
          label: picked?.name ?? "organization",
          dirtyLabels: listUnsavedLabels(),
        });
        return;
      }
      void performSwitch(id);
    },
    [activeId, switchingId, orgs, performSwitch],
  );

  const handleCreate = async () => {
    const name = window.prompt("Organization name")?.trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      toast.error("You must be signed in");
      return;
    }
    const creating = toast.loading(`Creating ${name}…`);
    const { data, error } = await supabase
      .from("organizations")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ name, slug, owner_id: uid } as any)
      .select("id")
      .single();
    if (error || !data) {
      toast.dismiss(creating);
      toast.error(error?.message ?? "Failed to create organization");
      return;
    }
    await supabase
      .from("organization_members")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ organization_id: data.id, user_id: uid, role: "owner" } as any);
    await qc.invalidateQueries({ queryKey: ["organizations"] });
    toast.dismiss(creating);
    void handleSelect(data.id);
  };

  const handleCreateWorkspace = async () => {
    const name = window.prompt("Workspace name")?.trim();
    if (!name) return;
    try {
      await createWorkspace.mutateAsync({ name });
      toast.success("Workspace created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create workspace");
    }
  };

  const workspaces: SwitcherWorkspace[] = allWorkspaces
    .filter((w) => !activeId || !w.organization_id || w.organization_id === activeId)
    .map((w) => ({
      id: w.id,
      name: w.name,
      plan: w.plan,
      avatarUrl: w.avatar_url,
      archived: !!w.archived_at,
    }));

  return (
    <>
      <OrganizationSwitcher
        organizations={orgs.map(toSwitcherOrg)}
        activeId={activeId}
        onSelect={(id) => handleSelect(id)}
        onCreate={handleCreate}
        collapsed={collapsed}
        loading={isLoading}
        switching={!!switchingId}
        switchingId={switchingId}
        switchPhase={switchPhase}
        error={isError ? (error as Error) : null}
        onRetry={() => void refetch()}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspace?.id ?? null}
        onSelectWorkspace={(id) => {
          const ws = allWorkspaces.find((w) => w.id === id);
          setActiveWorkspaceId(id);
          toast.success(`Switched to ${ws?.name ?? "workspace"}`);
        }}
        onCreateWorkspace={() => void handleCreateWorkspace()}
      />
      <AlertDialog
        open={!!pendingSwitch}
        onOpenChange={(open) => {
          if (!open) setPendingSwitch(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingSwitch
                ? `Switching to ${pendingSwitch.label} will clear all cached data on this page. You have unsaved changes that will be lost:`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingSwitch && pendingSwitch.dirtyLabels.length > 0 ? (
            <ul className="ml-4 list-disc text-sm text-muted-foreground">
              {pendingSwitch.dirtyLabels.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = pendingSwitch;
                setPendingSwitch(null);
                if (target) void performSwitch(target.id);
              }}
            >
              Discard and switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
