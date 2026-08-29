import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { getWhiteLabel, upsertWhiteLabel, verifyCustomDomain } from '@/lib/white-label/white-label.functions';
import { AppTopbar } from '@/components/app/app-topbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Palette, Globe, ImageIcon, Type, LayoutDashboard, Sidebar, Moon, Sun,
  LogIn, Loader2, Sparkles, Mail, Code, ShieldCheck, CheckCircle2,
} from 'lucide-react';
import { useActiveOrganization } from '@/hooks/use-organization';
import { ImageDropUpload } from '@/components/branding/image-drop-upload';
import type { BrandingScope } from '@/lib/branding/upload';
import { useBrandName } from "@/hooks/use-brand-name";


export const Route = createFileRoute('/_authenticated/settings/white-label')({
  staticData: { breadcrumb: 'White Label' },
  head: () => ({ meta: [{ title: 'White Label & Theme Engine' }] }),
  component: WhiteLabelSettings,
});

const empty: any = {
  brand_name: '', logo_url: '', logo_dark_url: '', favicon_url: '',
  primary_color: '', secondary_color: '', accent_color: '', background_color: '',
  sidebar_background: '', sidebar_foreground: '', sidebar_accent: '',
  dashboard_background: '', dashboard_accent: '',
  font_family_sans: '', font_family_heading: '', font_family_mono: '', font_size_base: '',
  default_color_mode: 'system', dark_primary_color: '', dark_background_color: '', dark_accent_color: '',
  login_background_url: '', login_headline: '', login_subheadline: '', login_layout: 'centered',
  loader_url: '', loader_style: 'spinner',
  icon_style: 'outline', icon_stroke_width: 2, border_radius: '',
  email_logo_url: '', email_from_name: '', email_primary_color: '', email_header_color: '', custom_email_footer: '',
  custom_domain: '', support_email: '', support_url: '', meta_title: '', meta_description: '',
  remove_lovable_branding: false, custom_css: '', custom_js: '', is_active: false,
};

function WhiteLabelSettings() {
  const brandName = useBrandName();
  const qc = useQueryClient();
  const { active } = useActiveOrganization();
  const { data, isLoading } = useQuery({ queryKey: ['white-label'], queryFn: () => getWhiteLabel({}) });
  const [form, setForm] = useState<any>(empty);
  useEffect(() => { if (data?.config) setForm({ ...empty, ...data.config }); }, [data?.config]);
  const brandScope: BrandingScope = active?.id ? { kind: 'org', orgId: active.id } : { kind: 'platform' };


  const save = useMutation({
    mutationFn: () => upsertWhiteLabel({ data: sanitize(form) }),
    onSuccess: () => { toast.success('White label saved — changes are live'); qc.invalidateQueries({ queryKey: ['white-label'] }); qc.invalidateQueries({ queryKey: ['active-theme'] }); },
    onError: (e: any) => toast.error(e.message ?? 'Save failed'),
  });

  const verify = useMutation({
    mutationFn: () => verifyCustomDomain({}),
    onSuccess: () => { toast.success('Domain verified'); qc.invalidateQueries({ queryKey: ['white-label'] }); },
    onError: (e: any) => toast.error(e.message ?? 'Verification failed'),
  });

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  if (isLoading) return (
    <>
      <AppTopbar
        title="Theme Engine & White Label"
        subtitle="Fully brand your workspace — logos, colors, fonts, dark mode, login page, emails, custom domain, and more."
      />
      <main className="container mx-auto max-w-7xl p-6 text-muted-foreground">Loading…</main>
    </>
  );

  const verified = (data?.config as any)?.custom_domain_verified;

  return (
    <>
      <AppTopbar
        title="Theme Engine & White Label"
        subtitle="Fully brand your workspace — logos, colors, fonts, dark mode, login page, emails, custom domain, and more."
        actions={
          <div className="flex items-center gap-2">
            <Switch checked={form.is_active} onCheckedChange={(v) => set('is_active', v)} id="active-toggle" />
            <label htmlFor="active-toggle" className="text-sm font-medium">
              {form.is_active ? <Badge variant="default">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
            </label>
          </div>
        }
      />
      <main className="mx-auto max-w-6xl w-full p-6 space-y-6 pb-24">

      <Tabs defaultValue="brand" className="space-y-6">
        <TabsList className="grid grid-cols-3 md:grid-cols-9 h-9 flex-wrap">
          <TabsTrigger value="brand"><ImageIcon className="size-4 mr-1" />Brand</TabsTrigger>
          <TabsTrigger value="colors"><Palette className="size-4 mr-1" />Colors</TabsTrigger>
          <TabsTrigger value="typography"><Type className="size-4 mr-1" />Typography</TabsTrigger>
          <TabsTrigger value="layout"><LayoutDashboard className="size-4 mr-1" />Layout</TabsTrigger>
          <TabsTrigger value="modes"><Moon className="size-4 mr-1" />Themes</TabsTrigger>
          <TabsTrigger value="login"><LogIn className="size-4 mr-1" />Login</TabsTrigger>
          <TabsTrigger value="email"><Mail className="size-4 mr-1" />Email</TabsTrigger>
          <TabsTrigger value="domain"><Globe className="size-4 mr-1" />Domain</TabsTrigger>
          <TabsTrigger value="advanced"><Code className="size-4 mr-1" />Advanced</TabsTrigger>
        </TabsList>

        {/* BRAND */}
        <TabsContent value="brand" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Brand identity</CardTitle><CardDescription>Logo, favicon, and brand name shown across the app.</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Brand name"><Input value={form.brand_name ?? ''} onChange={(e) => set('brand_name', e.target.value)} placeholder="Acme Inc" /></Field>
              <Field label="Support email"><Input value={form.support_email ?? ''} onChange={(e) => set('support_email', e.target.value)} placeholder="help@acme.com" /></Field>
              <ImageDropUpload label="Logo (light)" value={form.logo_url} onChange={(v) => set('logo_url', v)} scope={brandScope} slot="logo-light" />
              <ImageDropUpload label="Logo (dark)" value={form.logo_dark_url} onChange={(v) => set('logo_dark_url', v)} scope={brandScope} slot="logo-dark" dark />
              <ImageDropUpload label="Favicon" value={form.favicon_url} onChange={(v) => set('favicon_url', v)} scope={brandScope} slot="favicon" hint="Square PNG, SVG or ICO" />

              <Field label="Support URL"><Input value={form.support_url ?? ''} onChange={(e) => set('support_url', e.target.value)} placeholder="https://acme.com/help" /></Field>
              <Field label="Meta title" className="md:col-span-2"><Input value={form.meta_title ?? ''} onChange={(e) => set('meta_title', e.target.value)} placeholder="Acme — Customer Platform" /></Field>
              <Field label="Meta description" className="md:col-span-2"><Textarea rows={2} value={form.meta_description ?? ''} onChange={(e) => set('meta_description', e.target.value)} /></Field>
            </CardContent>
          </Card>
          {form.logo_url ? (
            <Card><CardHeader><CardTitle className="text-sm">Preview</CardTitle></CardHeader>
              <CardContent className="flex items-center gap-4">
                <img src={form.logo_url} alt="Logo preview" className="h-10" />
                {form.brand_name && <span className="font-semibold">{form.brand_name}</span>}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* COLORS */}
        <TabsContent value="colors" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Brand colors</CardTitle><CardDescription>HSL or hex values applied as CSS design tokens.</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ColorField label="Primary" value={form.primary_color ?? ''} onChange={(v) => set('primary_color', v)} />
              <ColorField label="Secondary" value={form.secondary_color ?? ''} onChange={(v) => set('secondary_color', v)} />
              <ColorField label="Accent" value={form.accent_color ?? ''} onChange={(v) => set('accent_color', v)} />
              <ColorField label="Background" value={form.background_color ?? ''} onChange={(v) => set('background_color', v)} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* TYPOGRAPHY */}
        <TabsContent value="typography" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Typography</CardTitle><CardDescription>Font families and base size. Load the fonts via a link tag or system stack.</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Sans font family"><Input value={form.font_family_sans ?? ''} onChange={(e) => set('font_family_sans', e.target.value)} placeholder="Inter, system-ui, sans-serif" /></Field>
              <Field label="Heading font family"><Input value={form.font_family_heading ?? ''} onChange={(e) => set('font_family_heading', e.target.value)} placeholder="Cal Sans, Inter, sans-serif" /></Field>
              <Field label="Mono font family"><Input value={form.font_family_mono ?? ''} onChange={(e) => set('font_family_mono', e.target.value)} placeholder="JetBrains Mono, monospace" /></Field>
              <Field label="Base font size"><Input value={form.font_size_base ?? ''} onChange={(e) => set('font_size_base', e.target.value)} placeholder="16px" /></Field>
            </CardContent>
          </Card>
        </TabsContent>

        {/* LAYOUT (sidebar/dashboard/icons/radius) */}
        <TabsContent value="layout" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Sidebar className="size-4" />Sidebar theme</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ColorField label="Sidebar background" value={form.sidebar_background ?? ''} onChange={(v) => set('sidebar_background', v)} />
              <ColorField label="Sidebar foreground" value={form.sidebar_foreground ?? ''} onChange={(v) => set('sidebar_foreground', v)} />
              <ColorField label="Sidebar accent" value={form.sidebar_accent ?? ''} onChange={(v) => set('sidebar_accent', v)} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><LayoutDashboard className="size-4" />Dashboard theme</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ColorField label="Dashboard background" value={form.dashboard_background ?? ''} onChange={(v) => set('dashboard_background', v)} />
              <ColorField label="Dashboard accent" value={form.dashboard_accent ?? ''} onChange={(v) => set('dashboard_accent', v)} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="size-4" />Icons & radius</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Icon style">
                <Select value={form.icon_style ?? 'outline'} onValueChange={(v) => set('icon_style', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outline">Outline</SelectItem>
                    <SelectItem value="solid">Solid</SelectItem>
                    <SelectItem value="duotone">Duotone</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Icon stroke width"><Input type="number" step="0.25" min="0.5" max="4" value={form.icon_stroke_width ?? 2} onChange={(e) => set('icon_stroke_width', Number(e.target.value))} /></Field>
              <Field label="Border radius"><Input value={form.border_radius ?? ''} onChange={(e) => set('border_radius', e.target.value)} placeholder="0.75rem" /></Field>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DARK / LIGHT */}
        <TabsContent value="modes" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Sun className="size-4" />/<Moon className="size-4" />Dark & Light</CardTitle><CardDescription>Default mode and dark-mode color overrides.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Default color mode">
                <Select value={form.default_color_mode ?? 'system'} onValueChange={(v) => set('default_color_mode', v)}>
                  <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">Follow system</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ColorField label="Dark primary" value={form.dark_primary_color ?? ''} onChange={(v) => set('dark_primary_color', v)} />
                <ColorField label="Dark background" value={form.dark_background_color ?? ''} onChange={(v) => set('dark_background_color', v)} />
                <ColorField label="Dark accent" value={form.dark_accent_color ?? ''} onChange={(v) => set('dark_accent_color', v)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* LOGIN */}
        <TabsContent value="login" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><LogIn className="size-4" />Login page</CardTitle><CardDescription>Customize the sign-in experience for your tenant.</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Layout">
                <Select value={form.login_layout ?? 'centered'} onValueChange={(v) => set('login_layout', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="centered">Centered card</SelectItem>
                    <SelectItem value="split">Split screen</SelectItem>
                    <SelectItem value="minimal">Minimal</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Background image URL"><Input value={form.login_background_url ?? ''} onChange={(e) => set('login_background_url', e.target.value)} /></Field>
              <Field label="Headline" className="md:col-span-2"><Input value={form.login_headline ?? ''} onChange={(e) => set('login_headline', e.target.value)} placeholder="Welcome back to Acme" /></Field>
              <Field label="Subheadline" className="md:col-span-2"><Textarea rows={2} value={form.login_subheadline ?? ''} onChange={(e) => set('login_subheadline', e.target.value)} /></Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Loader2 className="size-4" />Loader</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Loader style">
                <Select value={form.loader_style ?? 'spinner'} onValueChange={(v) => set('loader_style', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spinner">Spinner</SelectItem>
                    <SelectItem value="dots">Dots</SelectItem>
                    <SelectItem value="bar">Progress bar</SelectItem>
                    <SelectItem value="logo">Animated logo</SelectItem>
                    <SelectItem value="custom">Custom image</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Loader image URL (for custom / logo)"><Input value={form.loader_url ?? ''} onChange={(e) => set('loader_url', e.target.value)} /></Field>
            </CardContent>
          </Card>
        </TabsContent>

        {/* EMAIL */}
        <TabsContent value="email" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Mail className="size-4" />Email branding</CardTitle><CardDescription>Applied to every transactional and marketing email.</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="From name"><Input value={form.email_from_name ?? ''} onChange={(e) => set('email_from_name', e.target.value)} placeholder="Acme Team" /></Field>
              <ImageDropUpload label="Email logo" value={form.email_logo_url} onChange={(v) => set('email_logo_url', v)} scope={brandScope} slot="email-logo" />
              <ColorField label="Email primary color" value={form.email_primary_color ?? ''} onChange={(v) => set('email_primary_color', v)} />
              <ColorField label="Email header color" value={form.email_header_color ?? ''} onChange={(v) => set('email_header_color', v)} />
              <Field label="Email footer (HTML allowed)" className="md:col-span-2">
                <Textarea rows={4} value={form.custom_email_footer ?? ''} onChange={(e) => set('custom_email_footer', e.target.value)} />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DOMAIN */}
        <TabsContent value="domain" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Globe className="size-4" />Custom domain</CardTitle><CardDescription>Serve the tenant on your own domain.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Custom domain"><Input value={form.custom_domain ?? ''} onChange={(e) => set('custom_domain', e.target.value)} placeholder="app.acme.com" /></Field>
              {form.custom_domain ? (
                <div className="rounded-md border border-border p-4 text-sm space-y-2 bg-muted/40">
                  <p className="font-medium flex items-center gap-2">DNS setup {verified ? <Badge className="gap-1"><CheckCircle2 className="size-3" />Verified</Badge> : <Badge variant="secondary">Pending</Badge>}</p>
                  <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                    <li>Add an A record for <code className="font-mono">{form.custom_domain}</code> pointing to <code className="font-mono">185.158.133.1</code>.</li>
                    <li>Add a TXT record <code className="font-mono">_swiffer</code> with a workspace verification token.</li>
                  </ul>
                  <Button size="sm" variant="outline" onClick={() => verify.mutate()} disabled={verify.isPending}>
                    <ShieldCheck className="size-4 mr-2" />{verify.isPending ? 'Verifying…' : 'Verify domain'}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ADVANCED */}
        <TabsContent value="advanced" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>White label controls</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Remove {brandName} branding</p>
                  <p className="text-sm text-muted-foreground">Hides "Powered by" watermarks tenant-wide.</p>
                </div>
                <Switch checked={form.remove_lovable_branding} onCheckedChange={(v) => set('remove_lovable_branding', v)} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Code className="size-4" />Custom CSS</CardTitle><CardDescription>Injected globally when the theme is active.</CardDescription></CardHeader>
            <CardContent>
              <Textarea rows={10} className="font-mono text-xs" value={form.custom_css ?? ''} onChange={(e) => set('custom_css', e.target.value)} placeholder=":root { --radius: 12px; } .app-shell { … }" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Code className="size-4" />Custom JavaScript</CardTitle><CardDescription>Runs after page load. Use responsibly — this is executed in every tenant session.</CardDescription></CardHeader>
            <CardContent>
              <Textarea rows={10} className="font-mono text-xs" value={form.custom_js ?? ''} onChange={(e) => set('custom_js', e.target.value)} placeholder="// analytics, chat widgets, etc." />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="fixed bottom-4 right-6 flex gap-2">
        <Button size="lg" onClick={() => save.mutate()} disabled={save.isPending} className="shadow-lg">
          {save.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </main>
    </>
  );
}

/** Strip empty strings so nullable DB columns don't reject empty values. */
function sanitize(form: any) {
  const out: any = {};
  for (const [k, v] of Object.entries(form)) {
    if (v === '' || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`space-y-1.5 block ${className}`}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const isHex = /^#[0-9a-f]{3,8}$/i.test(value);
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" value={isHex ? value : '#000000'} onChange={(e) => onChange(e.target.value)} className="h-10 w-14 rounded-md border border-input bg-background cursor-pointer" aria-label={`${label} color picker`} />
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="#111827 or 220 90% 56%" className="flex-1 font-mono text-sm" />
      </div>
    </Field>
  );
}
