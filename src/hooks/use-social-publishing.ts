import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace, resolveWorkspaceId } from "@/hooks/use-workspace";

export type SocialPlatform = "facebook" | "instagram" | "linkedin" | "x" | "tiktok";

export type SocialChannel = {
  id: string;
  workspace_id: string;
  platform: SocialPlatform;
  name: string;
  external_id: string | null;
  username: string | null;
  avatar_url: string | null;
  token_expires_at: string | null;
  status: "connected" | "expired" | "error" | "disconnected";
  metadata: Record<string, unknown>;
  created_at: string;
};

export type SocialPostStatus = "draft" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";

export type SocialPostTarget = {
  id: string;
  post_id: string;
  channel_id: string;
  status: string;
  permalink: string | null;
  error: string | null;
  published_at: string | null;
  social_channels?: Pick<SocialChannel, "id" | "name" | "platform"> | null;
};

export type SocialPost = {
  id: string;
  workspace_id: string;
  caption: string;
  media_urls: string[];
  link_url: string | null;
  first_comment: string | null;
  status: SocialPostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  social_post_targets?: SocialPostTarget[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (t: string) => supabase.from(t as any) as any;

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  facebook: "Facebook Page",
  instagram: "Instagram Business",
  linkedin: "LinkedIn Page",
  x: "X (Twitter)",
  tiktok: "TikTok",
};

export const PLATFORM_LIMITS: Record<SocialPlatform, number> = {
  facebook: 63206,
  instagram: 2200,
  linkedin: 3000,
  x: 280,
  tiktok: 2200,
};

export function useSocialChannels() {
  const { active } = useCurrentWorkspace();
  return useQuery<SocialChannel[]>({
    queryKey: ["social-channels", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      const { data, error } = await db("social_channels")
        .select("id, workspace_id, platform, name, external_id, username, avatar_url, token_expires_at, status, metadata, created_at")
        .eq("workspace_id", active!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SocialChannel[];
    },
  });
}

export function useSaveSocialChannel() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      platform: SocialPlatform;
      name: string;
      external_id?: string;
      username?: string;
      access_token?: string;
    }) => {
      const workspaceId = await resolveWorkspaceId(active?.id);
      if (!workspaceId)
        throw new Error("No workspace is available for your account yet. Create a workspace in Settings first.");
      if (!input.name.trim()) throw new Error("Channel name is required");
      // Access tokens are never written from the browser — the server fn holds
      // the only path that can touch the credential column.
      const { saveSocialChannel } = await import("@/lib/social/channels.functions");
      await saveSocialChannel({
        data: {
          id: input.id,
          workspaceId,
          platform: input.platform,
          name: input.name.trim(),
          external_id: input.external_id?.trim() || null,
          username: input.username?.trim() || null,
          ...(input.access_token?.trim() ? { access_token: input.access_token.trim() } : {}),
        },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-channels"] }),
  });
}

export function useDeleteSocialChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db("social_channels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-channels"] }),
  });
}

export function useSocialPosts(status?: SocialPostStatus | "all") {
  const { active } = useCurrentWorkspace();
  return useQuery<SocialPost[]>({
    queryKey: ["social-posts", active?.id, status ?? "all"],
    enabled: !!active?.id,
    queryFn: async () => {
      let q = db("social_posts")
        .select("*, social_post_targets(*, social_channels(id, name, platform))")
        .eq("workspace_id", active!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (status && status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SocialPost[];
    },
  });
}

export type PostInput = {
  id?: string;
  caption: string;
  media_urls: string[];
  link_url?: string;
  first_comment?: string;
  channelIds: string[];
  scheduled_at?: string | null;
  status: SocialPostStatus;
};

export function validatePost(input: PostInput, channels: SocialChannel[]): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.caption.trim() && input.media_urls.length === 0)
    errors.caption = "Add a caption or at least one image";
  if (!input.channelIds.length) errors.channels = "Select at least one channel";
  if (input.status === "scheduled") {
    if (!input.scheduled_at) errors.scheduled_at = "Pick a date and time";
    else if (new Date(input.scheduled_at).getTime() < Date.now() - 60_000)
      errors.scheduled_at = "Scheduled time must be in the future";
  }
  const selected = channels.filter((c) => input.channelIds.includes(c.id));
  for (const c of selected) {
    if (input.caption.length > PLATFORM_LIMITS[c.platform]) {
      errors.caption = `Caption is too long for ${PLATFORM_LABELS[c.platform]} (max ${PLATFORM_LIMITS[c.platform]} characters)`;
      break;
    }
    if (c.platform === "instagram" && input.media_urls.length === 0) {
      errors.media = "Instagram posts require at least one image";
      break;
    }
  }
  return errors;
}

export function useSaveSocialPost() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: PostInput) => {
      const workspaceId = await resolveWorkspaceId(active?.id);
      if (!workspaceId)
        throw new Error("No workspace is available for your account yet. Create a workspace in Settings first.");
      const payload = {
        workspace_id: workspaceId,
        caption: input.caption,
        media_urls: input.media_urls,
        link_url: input.link_url?.trim() || null,
        first_comment: input.first_comment?.trim() || null,
        status: input.status,
        scheduled_at: input.status === "scheduled" ? input.scheduled_at : null,
      };
      let postId = input.id;
      if (postId) {
        const { error } = await db("social_posts").update(payload).eq("id", postId);
        if (error) throw error;
        await db("social_post_targets").delete().eq("post_id", postId);
      } else {
        const { data, error } = await db("social_posts").insert(payload).select("id").single();
        if (error) throw error;
        postId = data.id as string;
      }
      const targets = input.channelIds.map((channel_id) => ({
        post_id: postId,
        channel_id,
        workspace_id: workspaceId,
        status: "pending",
      }));
      if (targets.length) {
        const { error } = await db("social_post_targets").insert(targets);
        if (error) throw error;
      }
      return postId as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-posts"] }),
  });
}

export function useDeleteSocialPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db("social_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-posts"] }),
  });
}
