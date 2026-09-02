import { useEffect as useReactEffect, useSyncExternalStore } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  readActiveWorkspaceId,
  writeActiveWorkspaceId,
  clearActiveWorkspaceId,
  subscribeActiveTenant,
  readActiveOrgId,
} from "@/lib/tenant/active-tenant";
import { ensurePlatformOllamaProvider } from "@/lib/ai/platform-ollama.functions";


export type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "starter" | "growth" | "enterprise";
  owner_id: string;
  organization_id: string | null;
  description: string | null;
  avatar_url: string | null;
  archived_at: string | null;
  notifications_enabled: boolean;
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type WorkspaceRole = "owner" | "admin" | "agent" | "viewer";

export type MemberStatus = "active" | "suspended";

export type WorkspaceMemberRow = {
  user_id: string;
  role: WorkspaceRole;
  status: MemberStatus;
  created_at: string;
  last_active_at: string | null;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  last_seen_at: string | null;
};

export type WorkspaceInvitation = {
  id: string;
  workspace_id: string;
  email: string;
  role: WorkspaceRole;
  token: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  invited_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = (t: string) => supabase.from(t as any) as any;

function getActiveWsId(): string | null {
  return readActiveWorkspaceId();
}

export function setActiveWorkspaceId(id: string) {
  writeActiveWorkspaceId(id);
}

export function useActiveWorkspaceId(): string | null {
  return useSyncExternalStore(
    subscribeActiveTenant,
    getActiveWsId,
    () => null,
  );
}

/* ------------------------------ Queries ------------------------------ */

export function useWorkspaces() {
  return useQuery({
    queryKey: ["workspaces", "mine"],
    queryFn: async (): Promise<WorkspaceRow[]> => {
      const { data, error } = await anyFrom("workspaces")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WorkspaceRow[];
    },
  });
}

export function useCurrentWorkspace() {
  const q = useWorkspaces();
  const activeId = useActiveWorkspaceId();
  const activeOrgId = useSyncExternalStore(
    subscribeActiveTenant,
    readActiveOrgId,
    () => null,
  );

  // Prefer workspaces that belong to the active organization so no surface
  // silently loads a workspace from another org. Legacy/personal workspaces
  // predate org linkage and carry `organization_id = null`; they must stay
  // usable, otherwise every workspace-scoped write fails with
  // "No active workspace" even though the account owns a workspace.
  const all = (q.data ?? []).filter((w) => !w.archived_at);
  const inOrg = activeOrgId ? all.filter((w) => w.organization_id === activeOrgId) : [];
  const unlinked = all.filter((w) => !w.organization_id);
  const scoped = !activeOrgId
    ? all
    : inOrg.length
      ? inOrg
      : unlinked.length
        ? unlinked
        : all;

  const currentById = scoped.find((w) => w.id === activeId) ?? null;
  const active = currentById ?? scoped[0] ?? null;


  // If the persisted active workspace does not belong to the active org
  // (org just switched, workspace archived, etc.), realign it so consumers
  // reading `readActiveWorkspaceId()` directly stay consistent with the org.
  useReactEffect(() => {
    if (!active) return;
    if (activeId === active.id) return;
    writeActiveWorkspaceId(active.id);
  }, [active?.id, activeId]);

  return { ...q, data: active, active };
}

/**
 * Resolve a usable workspace id for a write, without depending on the
 * workspaces query having settled. Used by mutations so a slow (or
 * not-yet-primed) workspace list never surfaces as "No active workspace".
 * Falls back to the org-scoped workspace, then any unlinked/legacy
 * workspace, then the first workspace the user can read.
 */
export async function resolveWorkspaceId(preferred?: string | null): Promise<string | null> {
  if (preferred) return preferred;
  const stored = readActiveWorkspaceId();
  if (stored) return stored;

  const { data, error } = await anyFrom("workspaces")
    .select("id, organization_id, archived_at")
    .order("created_at", { ascending: true });
  if (error) return null;

  const rows = ((data ?? []) as Pick<WorkspaceRow, "id" | "organization_id" | "archived_at">[])
    .filter((w) => !w.archived_at);
  const orgId = readActiveOrgId();
  const pick =
    (orgId ? rows.find((w) => w.organization_id === orgId) : undefined) ??
    rows.find((w) => !w.organization_id) ??
    rows[0];
  if (!pick) return null;
  writeActiveWorkspaceId(pick.id);
  return pick.id;
}




export function useWorkspaceRole(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["workspace", workspaceId, "my-role"],
    enabled: !!workspaceId,
    queryFn: async (): Promise<WorkspaceRole | null> => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid || !workspaceId) return null;
      const { data, error } = await anyFrom("workspace_members")
        .select("role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", uid)
        .maybeSingle();
      if (error) throw error;
      return (data?.role ?? null) as WorkspaceRole | null;
    },
  });
}

export function useWorkspaceMembers(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["workspace", workspaceId, "members"],
    enabled: !!workspaceId,
    queryFn: async (): Promise<WorkspaceMemberRow[]> => {
      const { data: members, error } = await anyFrom("workspace_members")
        .select("user_id, role, status, created_at, last_active_at")
        .eq("workspace_id", workspaceId);
      if (error) throw error;
      const ids: string[] = (members ?? []).map((m: { user_id: string }) => m.user_id);
      if (ids.length === 0) return [];
      const { data: profiles, error: pErr } = await anyFrom("profiles")
        .select("id, display_name, avatar_url, email, last_seen_at")
        .in("id", ids);
      if (pErr) throw pErr;
      const byId = new Map<string, { display_name: string | null; avatar_url: string | null; email: string | null; last_seen_at: string | null }>(
        (profiles ?? []).map((p: { id: string; display_name: string | null; avatar_url: string | null; email: string | null; last_seen_at: string | null }) => [p.id, p]),
      );
      return (members ?? []).map((m: { user_id: string; role: WorkspaceRole; status: MemberStatus; created_at: string; last_active_at: string | null }) => ({
        user_id: m.user_id,
        role: m.role,
        status: m.status ?? "active",
        created_at: m.created_at,
        last_active_at: m.last_active_at ?? null,
        display_name: byId.get(m.user_id)?.display_name ?? null,
        avatar_url: byId.get(m.user_id)?.avatar_url ?? null,
        email: byId.get(m.user_id)?.email ?? null,
        last_seen_at: byId.get(m.user_id)?.last_seen_at ?? null,
      }));
    },
  });
}

export function useWorkspaceInvitations(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["workspace", workspaceId, "invitations"],
    enabled: !!workspaceId,
    queryFn: async (): Promise<WorkspaceInvitation[]> => {
      const { data, error } = await anyFrom("workspace_invitations")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WorkspaceInvitation[];
    },
  });
}

export function useWorkspaceAuditLog(workspaceId: string | undefined, limit = 100) {
  return useQuery({
    queryKey: ["workspace", workspaceId, "audit", limit],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, actor_id, action, resource_type, resource_id, changes, created_at")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type InvitationAuditEvent = {
  id: string;
  actor_id: string | null;
  action: string;
  invitation_id: string | null;
  changes: Record<string, unknown> | null;
  created_at: string;
  actor_name?: string | null;
  actor_email?: string | null;
};

export function useInvitationAuditLog(workspaceId: string | undefined, limit = 200) {
  return useQuery({
    queryKey: ["workspace", workspaceId, "invitation-audit", limit],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, actor_id, action, resource_id, changes, created_at")
        .eq("workspace_id", workspaceId!)
        .eq("resource_type", "workspace_invitation")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        id: string; actor_id: string | null; action: string;
        resource_id: string | null; changes: Record<string, unknown> | null; created_at: string;
      }>;
      const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean))) as string[];
      let profiles: Record<string, { display_name: string | null; email: string | null }> = {};
      if (actorIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", actorIds);
        profiles = Object.fromEntries((profs ?? []).map((p: { id: string; display_name: string | null; email: string | null }) => [p.id, { display_name: p.display_name, email: p.email }]));
      }
      return rows.map((r) => ({
        id: r.id,
        actor_id: r.actor_id,
        action: r.action,
        invitation_id: r.resource_id,
        changes: r.changes,
        created_at: r.created_at,
        actor_name: r.actor_id ? profiles[r.actor_id]?.display_name ?? null : null,
        actor_email: r.actor_id ? profiles[r.actor_id]?.email ?? null : null,
      })) as InvitationAuditEvent[];
    },
  });
}

/* ------------------------------ Mutations ------------------------------ */

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48);
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; organization_id?: string | null; description?: string }) => {
      const slug = `${slugify(input.name) || "workspace"}-${Math.random().toString(36).slice(2, 8)}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("create_workspace_with_owner", {
        _name: input.name,
        _slug: slug,
        _organization_id: input.organization_id ?? null,
        _description: input.description ?? null,
      });
      if (error) throw error;
      const workspace = data as WorkspaceRow;
      try {
        await ensurePlatformOllamaProvider({ data: { workspaceId: workspace.id } });
      } catch {
        // Platform Local AI is optional; workspace creation must still succeed.
      }
      return workspace;
    },
    onSuccess: (ws) => {
      setActiveWorkspaceId(ws.id);
      qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}

export function useUpdateWorkspace(workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<WorkspaceRow>) => {
      if (!workspaceId) throw new Error("No workspace");
      const { error } = await anyFrom("workspaces").update(patch).eq("id", workspaceId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  });
}

export function useArchiveWorkspace(workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (archived: boolean) => {
      if (!workspaceId) throw new Error("No workspace");
      const { error } = await anyFrom("workspaces")
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq("id", workspaceId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  });
}

export function useDeleteWorkspace(workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("No workspace");
      const { error } = await anyFrom("workspaces").delete().eq("id", workspaceId);
      if (error) throw error;
    },
    onSuccess: () => {
      clearActiveWorkspaceId();
      qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}

export function useTransferWorkspaceOwnership(workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (newOwnerId: string) => {
      if (!workspaceId) throw new Error("No workspace");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("transfer_workspace_ownership", {
        _workspace_id: workspaceId,
        _new_owner_id: newOwnerId,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace"] }),
  });
}

export function useUpdateMemberRole(workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: WorkspaceRole }) => {
      if (!workspaceId) throw new Error("No workspace");
      const { error } = await anyFrom("workspace_members")
        .update({ role })
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace"] }),
  });
}

export function useRemoveMember(workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      if (!workspaceId) throw new Error("No workspace");
      const { error } = await anyFrom("workspace_members")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace"] }),
  });
}

export function useCreateInvitation(workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: WorkspaceRole }) => {
      if (!workspaceId) throw new Error("No workspace");
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await anyFrom("workspace_invitations")
        .insert({
          workspace_id: workspaceId,
          email: email.trim().toLowerCase(),
          role,
          invited_by: userData.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as WorkspaceInvitation;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace"] }),
  });
}

export function useRevokeInvitation(workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await anyFrom("workspace_invitations")
        .update({ status: "revoked" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "invitations"] }),
  });
}

export function useAcceptInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("accept_workspace_invitation", { _token: token });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (workspaceId) => {
      if (workspaceId) setActiveWorkspaceId(workspaceId);
      qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}

export function useInvitationByToken(token: string | undefined) {
  return useQuery({
    queryKey: ["workspace-invitation", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await anyFrom("workspace_invitations")
        .select("id, workspace_id, email, role, status, expires_at")
        .eq("token", token)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: ws } = await anyFrom("workspaces")
        .select("id, name, avatar_url")
        .eq("id", data.workspace_id)
        .maybeSingle();
      return { ...data, workspace: ws };
    },
  });
}

/* ------------------------------ Team management ------------------------------ */

export function useSetMemberStatus(workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: MemberStatus }) => {
      if (!workspaceId) throw new Error("No workspace");
      const { error } = await anyFrom("workspace_members")
        .update({ status })
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace"] }),
  });
}

export function useResendInvitation(workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<string> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("resend_workspace_invitation", { _id: id });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "invitations"] }),
  });
}

/**
 * Subscribes to realtime changes for a workspace and refetches the affected
 * query keys as rows arrive. Returns a cleanup handle via the effect.
 */
export function useWorkspaceRealtime(workspaceId: string | undefined) {
  const qc = useQueryClient();
  // Import lazily to avoid SSR issues.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enabled = typeof window !== "undefined" && !!workspaceId;
  // useEffect via React import — imported at top of file.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useReactEffect(() => {
    if (!enabled || !workspaceId) return;
    const channel = supabase
      .channel(`ws:${workspaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "workspace_members", filter: `workspace_id=eq.${workspaceId}` },
        () => qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "members"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "workspace_invitations", filter: `workspace_id=eq.${workspaceId}` },
        () => qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "invitations"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "audit_logs", filter: `workspace_id=eq.${workspaceId}` },
        () => qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "audit"] }))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" },
        () => qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "members"] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [enabled, workspaceId, qc]);
}

/**
 * Fires a heartbeat every 60s while the tab is visible so peers see the user
 * as "online" via profiles.last_seen_at.
 */
export function usePresenceHeartbeat(enabled = true) {
  useReactEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let cancelled = false;
    async function beat() {
      if (cancelled || document.visibilityState !== "visible") return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.rpc as any)("heartbeat").catch(() => {});
    }
    beat();
    const id = window.setInterval(beat, 60_000);
    const onVis = () => beat();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled]);
}

// Back-compat aliases for existing imports.
export type Workspace = WorkspaceRow;


/* --------------------- Cross-workspace invitation management --------------------- */

export type MyWorkspaceMembership = { workspace_id: string; role: WorkspaceRole };

/** Every workspace the signed-in user belongs to, with their role in it. */
export function useMyWorkspaceRoles() {
  return useQuery({
    queryKey: ["workspaces", "my-roles"],
    queryFn: async (): Promise<MyWorkspaceMembership[]> => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return [];
      const { data, error } = await anyFrom("workspace_members")
        .select("workspace_id, role")
        .eq("user_id", uid);
      if (error) throw error;
      return (data ?? []) as MyWorkspaceMembership[];
    },
  });
}

/** Invitations across several workspaces at once (invite management screen). */
export function useInvitationsForWorkspaces(workspaceIds: string[]) {
  const key = [...workspaceIds].sort().join(",");
  return useQuery({
    queryKey: ["workspace-invitations", "multi", key],
    enabled: workspaceIds.length > 0,
    queryFn: async (): Promise<WorkspaceInvitation[]> => {
      const { data, error } = await anyFrom("workspace_invitations")
        .select("*")
        .in("workspace_id", workspaceIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WorkspaceInvitation[];
    },
  });
}

/** Change the role a pending invitation will grant on acceptance. */
export function useUpdateInvitationRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: WorkspaceRole }) => {
      const { error } = await anyFrom("workspace_invitations")
        .update({ role })
        .eq("id", id)
        .eq("status", "pending");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-invitations"] });
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
  });
}

/** Revoke any pending invitation, regardless of which workspace it belongs to. */
export function useRevokeInvitationById() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await anyFrom("workspace_invitations")
        .update({ status: "revoked" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-invitations"] });
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
  });
}

/** Permanently delete an invitation row (admins/owners only). */
export function useDeleteInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await anyFrom("workspace_invitations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-invitations"] });
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
  });
}

/** Create an invitation for an explicit workspace (not the active one). */
export function useCreateInvitationFor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ workspaceId, email, role }: { workspaceId: string; email: string; role: WorkspaceRole }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await anyFrom("workspace_invitations")
        .insert({
          workspace_id: workspaceId,
          email: email.trim().toLowerCase(),
          role,
          invited_by: userData.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as WorkspaceInvitation;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-invitations"] });
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
  });
}

export type InvitationVerification = {
  found: boolean;
  status?: WorkspaceInvitation["status"];
  email?: string;
  role?: WorkspaceRole;
  workspace_id?: string;
  expires_at?: string;
  expired?: boolean;
  usable: boolean;
};

/** Verify an invite token or link pasted by an admin. */
export async function verifyInvitationToken(raw: string): Promise<InvitationVerification> {
  const token = raw.trim().split("/").pop()?.split("?")[0] ?? "";
  if (!token) return { found: false, usable: false };
  const { data, error } = await anyFrom("workspace_invitations")
    .select("id, workspace_id, email, role, status, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { found: false, usable: false };
  const expired = new Date(data.expires_at).getTime() < Date.now();
  return {
    found: true,
    status: data.status,
    email: data.email,
    role: data.role,
    workspace_id: data.workspace_id,
    expires_at: data.expires_at,
    expired,
    usable: data.status === "pending" && !expired,
  };
}
