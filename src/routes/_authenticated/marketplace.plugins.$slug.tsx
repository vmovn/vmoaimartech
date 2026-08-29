import { createFileRoute, Link, useParams } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPluginBySlug, installPlugin, uninstallPlugin, reviewPlugin, listMyInstalledPlugins } from '@/lib/plugins/plugins.functions';
import { AppTopbar } from '@/components/app/app-topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, Package, ExternalLink, Shield, CheckCircle2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

export const Route = createFileRoute('/_authenticated/marketplace/plugins/$slug')({
  staticData: { breadcrumb: 'Plugin Details' },
  component: PluginDetail,
});

function PluginDetail() {
  const { slug } = useParams({ from: '/_authenticated/marketplace/plugins/$slug' });
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['plugin', slug], queryFn: () => getPluginBySlug({ data: { slug } }) });
  const { data: installed } = useQuery({ queryKey: ['plugin-installed'], queryFn: () => listMyInstalledPlugins({}) });
  const install = useMutation({
    mutationFn: (pluginId: string) => installPlugin({ data: { pluginId } }),
    onSuccess: () => { toast.success('Plugin installed'); qc.invalidateQueries({ queryKey: ['plugin-installed'] }); },
    onError: (e: any) => toast.error(e.message ?? 'Install failed'),
  });
  const uninstall = useMutation({
    mutationFn: (pluginId: string) => uninstallPlugin({ data: { pluginId } }),
    onSuccess: () => { toast.success('Plugin removed'); qc.invalidateQueries({ queryKey: ['plugin-installed'] }); },
  });

  if (isLoading || !data) return <div className="p-6 text-muted-foreground">Loading…</div>;
  const { plugin, versions, reviews } = data;
  const latest = versions[0];
  const isInstalled = (installed?.installations ?? []).some((i: any) => i.plugin_id === plugin.id);

  return (
    <>
      <AppTopbar
        title={plugin.name}
        subtitle={plugin.tagline}
        actions={
          <Link to="/marketplace/plugins">
            <Button variant="outline" size="sm"><ArrowLeft className="size-4 mr-2" />Back to marketplace</Button>
          </Link>
        }
      />
      <main className="container mx-auto max-w-6xl p-6 space-y-6">
        <Card>
          <CardContent className="p-6 flex flex-col md:flex-row gap-6">
            {plugin.icon_url ? (
              <img src={plugin.icon_url} alt="" className="size-24 rounded-xl object-cover" />
            ) : (
              <div className="size-24 rounded-xl bg-muted flex items-center justify-center"><Package className="size-10" /></div>
            )}
            <div className="flex-1 space-y-3">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  {plugin.name}
                  {plugin.is_verified && <Badge variant="secondary"><Shield className="size-3 mr-1" />Verified</Badge>}
                </h2>
                <p className="text-muted-foreground mt-1">{plugin.tagline}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  by {plugin.publisher_name ?? 'Community'} · v{latest?.version ?? '—'} · {plugin.install_count.toLocaleString()} installs
                </p>
              </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-amber-500">
                <Star className="size-4 fill-current" />
                <span className="font-semibold">{Number(plugin.rating_avg ?? 0).toFixed(1)}</span>
                <span className="text-muted-foreground text-sm">({plugin.rating_count} reviews)</span>
              </div>
              <Badge variant="outline" className="capitalize">{plugin.pricing_model.replace('_', ' ')}{plugin.price_cents > 0 ? ` · $${(plugin.price_cents / 100).toFixed(2)}` : ''}</Badge>
            </div>
            <div className="flex items-center gap-2">
              {isInstalled ? (
                <Button variant="outline" onClick={() => uninstall.mutate(plugin.id)} disabled={uninstall.isPending}>
                  <CheckCircle2 className="size-4 mr-2 text-green-500" /> Installed — remove
                </Button>
              ) : (
                <Button onClick={() => install.mutate(plugin.id)} disabled={install.isPending}>
                  {install.isPending ? 'Installing…' : 'Install plugin'}
                </Button>
              )}
              {plugin.homepage_url && (
                <a href={plugin.homepage_url} target="_blank" rel="noreferrer">
                  <Button variant="ghost"><ExternalLink className="size-4 mr-2" />Website</Button>
                </a>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {Array.isArray((plugin as any).screenshots) && (plugin as any).screenshots.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Screenshots</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {((plugin as any).screenshots as string[]).map((src, i) => (
                <a key={i} href={src} target="_blank" rel="noreferrer" className="shrink-0">
                  <img
                    src={src}
                    alt={`${plugin.name} screenshot ${i + 1}`}
                    className="h-56 rounded-lg border object-cover hover:opacity-90 transition-opacity"
                  />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>About this plugin</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-wrap text-sm">{plugin.description ?? '—'}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Requested permissions</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {(latest?.permissions ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No special permissions required.</p>
            ) : (
              (latest?.permissions ?? []).map((p: string) => (
                <div key={p} className="flex items-center gap-2 text-sm"><Shield className="size-3.5 text-muted-foreground" />{p}</div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Versions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {versions.map((v: any) => (
            <div key={v.id} className="flex items-start justify-between border-b pb-3 last:border-0 last:pb-0">
              <div>
                <div className="font-medium">v{v.version}{!v.is_stable && <Badge variant="outline" className="ml-2">beta</Badge>}</div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{v.changelog ?? '—'}</p>
              </div>
              <span className="text-xs text-muted-foreground">{new Date(v.published_at).toLocaleDateString()}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <ReviewSection pluginId={plugin.id} reviews={reviews} onReviewed={() => qc.invalidateQueries({ queryKey: ['plugin', slug] })} />
    </main>
    </>
  );
}

function ReviewSection({ pluginId, reviews, onReviewed }: { pluginId: string; reviews: any[]; onReviewed: () => void }) {
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const submit = useMutation({
    mutationFn: () => reviewPlugin({ data: { pluginId, rating, title: title || undefined, body: body || undefined } }),
    onSuccess: () => { toast.success('Review posted'); setTitle(''); setBody(''); onReviewed(); },
    onError: (e: any) => toast.error(e.message ?? 'Failed to post review'),
  });
  return (
    <Card>
      <CardHeader><CardTitle>Reviews</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`}>
                <Star className={`size-6 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
              </button>
            ))}
          </div>
          <Input placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea placeholder="Share your experience…" value={body} onChange={(e) => setBody(e.target.value)} />
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>Post review</Button>
        </div>
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">Be the first to review this plugin.</p>
        ) : (
          reviews.map((r: any) => (
            <div key={r.id} className="border-b pb-3 last:border-0">
              <div className="flex items-center gap-2">
                <div className="flex text-amber-500">
                  {Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="size-3.5 fill-current" />)}
                </div>
                {r.title && <span className="font-medium text-sm">{r.title}</span>}
                <span className="text-xs text-muted-foreground ml-auto">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              {r.body && <p className="text-sm text-muted-foreground mt-1">{r.body}</p>}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
