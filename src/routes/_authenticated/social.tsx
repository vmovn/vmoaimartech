import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { AppTopbar } from '@/components/app/app-topbar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { useTenantAccent, accentTint } from '@/lib/themes/tenant-accent';
import { Plus, Trash2, Send, CalendarClock, Loader2, Share2, ExternalLink, Pencil, X } from 'lucide-react';
import {
  useSocialChannels, useSaveSocialChannel, useDeleteSocialChannel,
  useSocialPosts, useSaveSocialPost, useDeleteSocialPost, validatePost,
  PLATFORM_LABELS, PLATFORM_LIMITS,
  type SocialPlatform, type SocialChannel, type SocialPost, type PostInput,
} from '@/hooks/use-social-publishing';
import { publishSocialPost } from '@/lib/social/publish.functions';
import { useCurrentWorkspace } from '@/hooks/use-workspace';

export const Route = createFileRoute('/_authenticated/social')({
  component: SocialStudio,
  staticData: { breadcrumb: 'Social Studio' },
  head: () => ({
    meta: [
      { title: 'Social Studio · Auto Posting' },
      { name: 'description', content: 'Schedule and auto-publish posts to Facebook, Instagram and LinkedIn from one CRM composer.' },
      { property: 'og:title', content: 'Social Studio · Auto Posting' },
      { property: 'og:description', content: 'Schedule and auto-publish posts to Facebook, Instagram and LinkedIn from one CRM composer.' },
    ],
  }),
});

const emptyPost: PostInput = { caption: '', media_urls: [], link_url: '', first_comment: '', channelIds: [], scheduled_at: null, status: 'draft' };

function StatusPill({ status }: { status: SocialPost['status'] }) {
  const cls: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    scheduled: 'bg-primary/10 text-primary',
    publishing: 'bg-amber-500/15 text-amber-600',
    published: 'bg-emerald-500/15 text-emerald-600',
    failed: 'bg-destructive/15 text-destructive',
    cancelled: 'bg-muted text-muted-foreground',
  };
  return <Badge variant="outline" className={`capitalize ${cls[status]}`}>{status}</Badge>;
}

function SocialStudio() {
  const { active: workspace } = useCurrentWorkspace();
  const { data: channels = [] } = useSocialChannels();
  const { data: posts = [], isLoading } = useSocialPosts('all');
  const savePost = useSaveSocialPost();
  const deletePost = useDeleteSocialPost();
  const saveChannel = useSaveSocialChannel();
  const deleteChannel = useDeleteSocialChannel();
  const publish = useServerFn(publishSocialPost);

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null);
  const [form, setForm] = useState<PostInput>(emptyPost);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mediaInput, setMediaInput] = useState('');
  const [confirmDeletePost, setConfirmDeletePost] = useState<SocialPost | null>(null);

  const [channelOpen, setChannelOpen] = useState(false);
  const [channelForm, setChannelForm] = useState<{ id?: string; platform: SocialPlatform; name: string; external_id: string; username: string; access_token: string }>({
    platform: 'facebook', name: '', external_id: '', username: '', access_token: '',
  });
  const [confirmDeleteChannel, setConfirmDeleteChannel] = useState<SocialChannel | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const limit = useMemo(() => {
    const selected = channels.filter((c) => form.channelIds.includes(c.id));
    if (!selected.length) return null;
    return Math.min(...selected.map((c) => PLATFORM_LIMITS[c.platform]));
  }, [channels, form.channelIds]);

  const openComposer = (post?: SocialPost) => {
    if (post) {
      setEditingPost(post);
      setForm({
        id: post.id,
        caption: post.caption,
        media_urls: post.media_urls ?? [],
        link_url: post.link_url ?? '',
        first_comment: post.first_comment ?? '',
        channelIds: (post.social_post_targets ?? []).map((t) => t.channel_id),
        scheduled_at: post.scheduled_at ? post.scheduled_at.slice(0, 16) : null,
        status: post.status === 'published' ? 'draft' : post.status,
      });
    } else {
      setEditingPost(null);
      setForm(emptyPost);
    }
    setErrors({});
    setMediaInput('');
    setComposerOpen(true);
  };

  const submitPost = async (mode: 'draft' | 'scheduled' | 'now') => {
    const payload: PostInput = {
      ...form,
      status: mode === 'now' ? 'draft' : mode,
      scheduled_at: mode === 'scheduled' && form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
    };
    const errs = validatePost(payload, channels);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      const id = await savePost.mutateAsync(payload);
      if (mode === 'now') {
        setPublishingId(id);
        const res = await publish({ data: { postId: id, workspaceId: workspace!.id } });
        const failed = res.results.filter((r) => !r.ok);
        if (res.ok && !failed.length) toast.success('Published to all channels');
        else if (res.ok) toast.warning(`Published with errors: ${failed.map((f) => `${f.channel} — ${f.error}`).join('; ')}`);
        else toast.error(failed.map((f) => `${f.channel}: ${f.error}`).join('; ') || 'Publishing failed');
      } else {
        toast.success(mode === 'scheduled' ? 'Post scheduled' : 'Draft saved');
      }
      setComposerOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save post');
    } finally {
      setPublishingId(null);
    }
  };

  const publishExisting = async (post: SocialPost) => {
    setPublishingId(post.id);
    try {
      const res = await publish({ data: { postId: post.id, workspaceId: workspace!.id } });
      const failed = res.results.filter((r) => !r.ok);
      if (res.ok && !failed.length) toast.success('Published');
      else if (res.ok) toast.warning(`Published with errors: ${failed.map((f) => f.channel).join(', ')}`);
      else toast.error(failed.map((f) => `${f.channel}: ${f.error}`).join('; ') || 'Publishing failed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publishing failed');
    } finally {
      setPublishingId(null);
    }
  };

  const submitChannel = async () => {
    try {
      await saveChannel.mutateAsync(channelForm);
      toast.success(channelForm.id ? 'Channel updated' : 'Channel connected');
      setChannelOpen(false);
      setChannelForm({ platform: 'facebook', name: '', external_id: '', username: '', access_token: '' });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save channel');
    }
  };

  const { accent } = useTenantAccent();
  const busy = savePost.isPending || !!publishingId;

  return (
    <>
      <AppTopbar title="Social Studio" />
      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 grid size-9 shrink-0 place-items-center rounded"
              style={{ background: accentTint(accent), color: accent }}
              aria-hidden
            >
              <Share2 className="h-4 w-4" />
            </span>
            <div>
            <h1 className="text-xl font-semibold">Social auto posting</h1>
            <p className="text-sm text-muted-foreground">Compose once, schedule and publish across Facebook, Instagram and LinkedIn.</p>
            </div>
          </div>
          <Button onClick={() => openComposer()}><Plus className="h-4 w-4 mr-2" />New post</Button>
        </div>

        <Tabs defaultValue="posts">
          <TabsList>
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="channels">Channels ({channels.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="posts" className="mt-4 space-y-3">
            {isLoading ? (
              <Card className="p-10 text-center text-muted-foreground">Loading posts…</Card>
            ) : posts.length === 0 ? (
              <Card className="p-10 text-center space-y-3">
                <Share2 className="h-8 w-8 mx-auto" style={{ color: accent }} />
                <p className="font-medium">No posts yet</p>
                <p className="text-sm text-muted-foreground">Create your first post and schedule it across your connected pages.</p>
                <Button onClick={() => openComposer()}><Plus className="h-4 w-4 mr-2" />New post</Button>
              </Card>
            ) : posts.map((post) => (
              <Card key={post.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm whitespace-pre-wrap break-words line-clamp-4">{post.caption || <span className="text-muted-foreground">No caption</span>}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <StatusPill status={post.status} />
                      {post.scheduled_at && <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" />{new Date(post.scheduled_at).toLocaleString()}</span>}
                      {post.published_at && <span>Published {new Date(post.published_at).toLocaleString()}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {(post.social_post_targets ?? []).map((t) => (
                        <Badge key={t.id} variant="secondary" className="text-[11px] gap-1">
                          {t.social_channels?.name ?? 'Channel'}
                          <span className={t.status === 'published' ? 'text-emerald-600' : t.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>· {t.status}</span>
                          {t.permalink && <a href={t.permalink} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /></a>}
                        </Badge>
                      ))}
                    </div>
                    {(post.social_post_targets ?? []).some((t) => t.error) && (
                      <p className="text-xs text-destructive">{(post.social_post_targets ?? []).find((t) => t.error)?.error}</p>
                    )}
                  </div>
                  {post.media_urls?.[0] && (
                    <img src={post.media_urls[0]} alt="Post media preview" className="h-16 w-16 rounded object-cover shrink-0" loading="lazy" />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={publishingId === post.id} onClick={() => publishExisting(post)}>
                    {publishingId === post.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}Publish now
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openComposer(post)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDeletePost(post)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="channels" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => { setChannelForm({ platform: 'facebook', name: '', external_id: '', username: '', access_token: '' }); setChannelOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />Connect channel
              </Button>
            </div>
            {channels.length === 0 ? (
              <Card className="p-10 text-center text-muted-foreground">No channels connected yet.</Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {channels.map((c) => (
                  <Card key={c.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{PLATFORM_LABELS[c.platform]}{c.username ? ` · @${c.username}` : ''}</div>
                      </div>
                      <Badge variant="outline" className="capitalize">{c.status}</Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => { setChannelForm({ id: c.id, platform: c.platform, name: c.name, external_id: c.external_id ?? '', username: c.username ?? '', access_token: '' }); setChannelOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDeleteChannel(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Composer */}
      <Dialog open={composerOpen} onOpenChange={(v) => { if (!busy) setComposerOpen(v); }}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => { if (busy) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>{editingPost ? 'Edit post' : 'New post'}</DialogTitle>
            <DialogDescription>Select channels, write your caption and publish or schedule.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Channels</Label>
              {channels.length === 0 ? (
                <p className="text-sm text-muted-foreground">Connect a channel first from the Channels tab.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {channels.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 rounded border p-2 cursor-pointer">
                      <Checkbox
                        checked={form.channelIds.includes(c.id)}
                        disabled={busy}
                        onCheckedChange={(v) => setForm((f) => ({
                          ...f,
                          channelIds: v ? [...f.channelIds, c.id] : f.channelIds.filter((id) => id !== c.id),
                        }))}
                      />
                      <span className="text-sm truncate">{c.name}</span>
                      <Badge variant="secondary" className="ml-auto text-[10px]">{c.platform}</Badge>
                    </label>
                  ))}
                </div>
              )}
              {errors.channels && <p className="text-xs text-destructive">{errors.channels}</p>}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Caption</Label>
                {limit && <span className={`text-xs ${form.caption.length > limit ? 'text-destructive' : 'text-muted-foreground'}`}>{form.caption.length}/{limit}</span>}
              </div>
              <Textarea rows={6} value={form.caption} disabled={busy} onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value }))} placeholder="What do you want to share?" />
              {errors.caption && <p className="text-xs text-destructive">{errors.caption}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Images</Label>
              <div className="flex gap-2">
                <Input
                  value={mediaInput}
                  disabled={busy}
                  onChange={(e) => setMediaInput(e.target.value)}
                  placeholder="https://…/image.jpg"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && mediaInput.trim()) {
                      e.preventDefault();
                      setForm((f) => ({ ...f, media_urls: [...f.media_urls, mediaInput.trim()] }));
                      setMediaInput('');
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !mediaInput.trim()}
                  onClick={() => { setForm((f) => ({ ...f, media_urls: [...f.media_urls, mediaInput.trim()] })); setMediaInput(''); }}
                >Add</Button>
              </div>
              {form.media_urls.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {form.media_urls.map((url, i) => (
                    <span key={`${url}-${i}`} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs max-w-[220px]">
                      <span className="truncate">{url}</span>
                      <button type="button" disabled={busy} onClick={() => setForm((f) => ({ ...f, media_urls: f.media_urls.filter((_, idx) => idx !== i) }))}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {errors.media && <p className="text-xs text-destructive">{errors.media}</p>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Link (optional)</Label>
                <Input value={form.link_url ?? ''} disabled={busy} onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))} placeholder="https://…" />
              </div>
              <div className="space-y-1.5">
                <Label>Schedule for</Label>
                <Input
                  type="datetime-local"
                  value={form.scheduled_at ?? ''}
                  disabled={busy}
                  onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
                />
                {errors.scheduled_at && <p className="text-xs text-destructive">{errors.scheduled_at}</p>}
              </div>
            </div>
          </div>
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={() => setComposerOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="secondary" onClick={() => submitPost('draft')} disabled={busy}>Save draft</Button>
            <Button variant="secondary" onClick={() => submitPost('scheduled')} disabled={busy}>
              <CalendarClock className="h-4 w-4 mr-2" />Schedule
            </Button>
            <Button onClick={() => submitPost('now')} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}Publish now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Channel dialog */}
      <Dialog open={channelOpen} onOpenChange={(v) => { if (!saveChannel.isPending) setChannelOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{channelForm.id ? 'Edit channel' : 'Connect channel'}</DialogTitle>
            <DialogDescription>Paste the page/profile ID and a long-lived access token. Tokens are used server-side only.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Platform</Label>
              <Select value={channelForm.platform} disabled={saveChannel.isPending} onValueChange={(v) => setChannelForm((f) => ({ ...f, platform: v as SocialPlatform }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PLATFORM_LABELS) as SocialPlatform[]).map((p) => (
                    <SelectItem key={p} value={p}>{PLATFORM_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Display name</Label>
              <Input value={channelForm.name} disabled={saveChannel.isPending} onChange={(e) => setChannelForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Page / account ID</Label>
              <Input value={channelForm.external_id} disabled={saveChannel.isPending} onChange={(e) => setChannelForm((f) => ({ ...f, external_id: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Username (optional)</Label>
              <Input value={channelForm.username} disabled={saveChannel.isPending} onChange={(e) => setChannelForm((f) => ({ ...f, username: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Access token{channelForm.id ? ' (leave blank to keep current)' : ''}</Label>
              <Input type="password" value={channelForm.access_token} disabled={saveChannel.isPending} onChange={(e) => setChannelForm((f) => ({ ...f, access_token: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChannelOpen(false)} disabled={saveChannel.isPending}>Cancel</Button>
            <Button onClick={submitChannel} disabled={saveChannel.isPending}>
              {saveChannel.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDeletePost}
        onOpenChange={(v) => !v && setConfirmDeletePost(null)}
        title="Delete this post?"
        description="The post and its channel results will be removed. Already published posts stay live on the platform."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!confirmDeletePost) return;
          try { await deletePost.mutateAsync(confirmDeletePost.id); toast.success('Post deleted'); }
          catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to delete'); }
          finally { setConfirmDeletePost(null); }
        }}
      />
      <ConfirmDialog
        open={!!confirmDeleteChannel}
        onOpenChange={(v) => !v && setConfirmDeleteChannel(null)}
        title="Disconnect channel?"
        description="Scheduled posts targeting this channel will no longer publish to it."
        confirmLabel="Disconnect"
        destructive
        onConfirm={async () => {
          if (!confirmDeleteChannel) return;
          try { await deleteChannel.mutateAsync(confirmDeleteChannel.id); toast.success('Channel disconnected'); }
          catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to disconnect'); }
          finally { setConfirmDeleteChannel(null); }
        }}
      />
    </>
  );
}
