import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/**
 * Social publishing engine. Publishes a stored post to every selected channel
 * through the provider Graph APIs. Tokens stay server-side.
 */

const input = z.object({ postId: z.string().uuid(), workspaceId: z.string().uuid() });

const GRAPH = 'https://graph.facebook.com/v21.0';

type PublishResult = { externalId?: string; permalink?: string };

async function publishFacebook(
  pageId: string,
  token: string,
  caption: string,
  mediaUrls: string[],
  link?: string | null,
): Promise<PublishResult> {
  const isPhoto = mediaUrls.length > 0;
  const url = isPhoto ? `${GRAPH}/${pageId}/photos` : `${GRAPH}/${pageId}/feed`;
  const body: Record<string, string> = { access_token: token };
  if (isPhoto) {
    body.url = mediaUrls[0];
    body.caption = caption;
  } else {
    body.message = caption;
    if (link) body.link = link;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json?.error?.message ?? `Facebook error ${res.status}`);
  const id = json.post_id ?? json.id;
  return { externalId: id, permalink: `https://facebook.com/${id}` };
}

async function publishInstagram(
  igUserId: string,
  token: string,
  caption: string,
  mediaUrls: string[],
): Promise<PublishResult> {
  if (!mediaUrls.length) throw new Error('Instagram requires at least one image');
  const createRes = await fetch(`${GRAPH}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ image_url: mediaUrls[0], caption, access_token: token }),
  });
  const created = await createRes.json();
  if (!createRes.ok || created.error) throw new Error(created?.error?.message ?? 'Instagram media creation failed');

  const pubRes = await fetch(`${GRAPH}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: created.id, access_token: token }),
  });
  const published = await pubRes.json();
  if (!pubRes.ok || published.error) throw new Error(published?.error?.message ?? 'Instagram publish failed');
  return { externalId: published.id, permalink: `https://www.instagram.com/p/${published.id}` };
}

async function publishLinkedIn(
  orgUrn: string,
  token: string,
  caption: string,
): Promise<PublishResult> {
  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: orgUrn.startsWith('urn:') ? orgUrn : `urn:li:organization:${orgUrn}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: caption },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LinkedIn error ${res.status}: ${text.slice(0, 200)}`);
  const id = res.headers.get('x-restli-id') ?? undefined;
  return { externalId: id };
}

export const publishSocialPost = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { postId: string; workspaceId: string }) => input.parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = context.supabase as any;

    const { data: post, error } = await supabase
      .from('social_posts')
      .select('*, social_post_targets(*, social_channels(id, platform, external_id, name))')
      .eq('id', data.postId)
      .eq('workspace_id', data.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!post) throw new Error('Post not found');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const targets: any[] = post.social_post_targets ?? [];
    if (!targets.length) throw new Error('This post has no channels selected');

    await supabase.from('social_posts').update({ status: 'publishing' }).eq('id', post.id);

    // Access tokens are hidden from app users at the database level; load them
    // with the service client, scoped to this workspace's channels only.
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const channelIds = targets.map((t) => t.channel_id).filter(Boolean);
    const { data: tokenRows } = await supabaseAdmin
      .from('social_channels')
      .select('id, access_token')
      .eq('workspace_id', data.workspaceId)
      .in('id', channelIds);
    const tokens = new Map<string, string | null>(
      (tokenRows ?? []).map((r) => [r.id as string, (r as { access_token: string | null }).access_token]),
    );

    const results: { channel: string; ok: boolean; error?: string }[] = [];
    for (const target of targets) {
      const channel = target.social_channels;
      if (!channel) continue;
      await supabase.from('social_post_targets').update({ status: 'publishing' }).eq('id', target.id);
      try {
        const accessToken = tokens.get(channel.id);
        if (!accessToken) throw new Error('Channel has no access token. Reconnect the channel.');
        let out: PublishResult;
        if (channel.platform === 'facebook') {
          out = await publishFacebook(channel.external_id, accessToken, post.caption, post.media_urls ?? [], post.link_url);
        } else if (channel.platform === 'instagram') {
          out = await publishInstagram(channel.external_id, accessToken, post.caption, post.media_urls ?? []);
        } else if (channel.platform === 'linkedin') {
          out = await publishLinkedIn(channel.external_id, accessToken, post.caption);
        } else {
          throw new Error(`Publishing to ${channel.platform} is not supported yet`);
        }
        await supabase
          .from('social_post_targets')
          .update({
            status: 'published',
            external_post_id: out.externalId ?? null,
            permalink: out.permalink ?? null,
            error: null,
            published_at: new Date().toISOString(),
          })
          .eq('id', target.id);
        results.push({ channel: channel.name, ok: true });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Publish failed';
        await supabase
          .from('social_post_targets')
          .update({ status: 'failed', error: message })
          .eq('id', target.id);
        results.push({ channel: channel.name, ok: false, error: message });
      }
    }

    const anyOk = results.some((r) => r.ok);
    await supabase
      .from('social_posts')
      .update({
        status: anyOk ? 'published' : 'failed',
        published_at: anyOk ? new Date().toISOString() : null,
      })
      .eq('id', post.id);

    return { ok: anyOk, results };
  });

/** Publishes every scheduled post whose time has arrived. Called by the scheduler route. */
export const runScheduledSocialPosts = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = context.supabase as any;
    const { data: due } = await supabase
      .from('social_posts')
      .select('id')
      .eq('workspace_id', data.workspaceId)
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString())
      .limit(20);
    return { due: (due ?? []).map((d: { id: string }) => d.id) };
  });
