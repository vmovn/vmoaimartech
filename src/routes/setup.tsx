import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, KeyRound, Rocket, ShieldCheck, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  authorizeSetup,
  completeSetup,
  createSetupSuperAdmin,
  getSetupStatus,
  saveSetupDefaults,
  saveSetupIdentity,
  saveSetupPlatform,
  validateSetupEnvironment,
  type SetupCheck,
} from "@/lib/setup/setup.functions";
import { BRAND_NAME } from "@/lib/branding/brand";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "Product Setup" },
      { name: "description", content: "Secure first-run Product initialization." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  beforeLoad: async () => {
    const status = await getSetupStatus();
    if (status.setupComplete) throw redirect({ to: "/auth" });
  },
  component: ProductSetup,
});

type Step = "system" | "admin" | "identity" | "defaults" | "platform" | "finish";
const STEPS: Array<{ key: Step; label: string }> = [
  { key: "system", label: "System" },
  { key: "admin", label: "Super Admin" },
  { key: "identity", label: "Product" },
  { key: "defaults", label: "Defaults" },
  { key: "platform", label: "Platform" },
  { key: "finish", label: "Finish" },
];

const TIMEZONES = ["UTC", "Asia/Ho_Chi_Minh", "Asia/Singapore", "Asia/Tokyo", "Europe/London", "America/New_York"];
const CURRENCIES = ["USD", "VND", "EUR", "GBP", "SGD", "JPY", "AUD", "CAD"];
const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
];

function CheckList({ checks }: { checks: SetupCheck[] }) {
  return (
    <ul className="space-y-2">
      {checks.map((check) => (
        <li key={check.id} className="flex items-start gap-3 rounded-lg border p-3">
          {check.status === "ready" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          ) : check.required ? (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          )}
          <div className="min-w-0">
            <p className="font-medium">{check.label}</p>
            <p className="break-words text-sm text-muted-foreground">{check.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SecretGate() {
  const queryClient = useQueryClient();
  const authorize = useServerFn(authorizeSetup);
  const [secret, setSecret] = useState("");
  const mutation = useMutation({
    mutationFn: () => authorize({ data: { secret } }),
    onSuccess: async () => {
      setSecret("");
      await queryClient.invalidateQueries({ queryKey: ["product-setup-status"] });
    },
  });
  return (
    <SetupShell progress={0}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Secure Product Setup</CardTitle>
          <CardDescription>Enter the Setup Secret configured by the deployment operator.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="setup-secret">Setup Secret</Label>
            <Input
              id="setup-secret"
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && secret) mutation.mutate();
              }}
            />
          </div>
          <Button className="w-full" disabled={!secret || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Verifying…" : "Unlock setup"}
          </Button>
          {mutation.isError && <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>}
          <p className="text-xs text-muted-foreground">The secret is verified server-side and is never stored in browser-accessible state.</p>
        </CardContent>
      </Card>
    </SetupShell>
  );
}

function ProductSetup() {
  const statusFn = useServerFn(getSetupStatus);
  const status = useQuery({ queryKey: ["product-setup-status"], queryFn: () => statusFn() });
  if (status.isLoading) return <SetupShell progress={0}><p className="text-sm text-muted-foreground">Checking setup state…</p></SetupShell>;
  if (status.isError) return <SetupShell progress={0}><p className="text-sm text-destructive">{(status.error as Error).message}</p></SetupShell>;
  if (!status.data?.setupSecretConfigured) {
    return <SetupShell progress={0}><p className="text-sm text-destructive">SETUP_SECRET is missing or shorter than 24 characters on the server.</p></SetupShell>;
  }
  if (!status.data.authorized) return <SecretGate />;
  return <SetupWizard initialSuperAdmin={status.data.superAdminExists} />;
}

function SetupWizard({ initialSuperAdmin }: { initialSuperAdmin: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex].key;
  const environmentFn = useServerFn(validateSetupEnvironment);
  const createAdminFn = useServerFn(createSetupSuperAdmin);
  const identityFn = useServerFn(saveSetupIdentity);
  const defaultsFn = useServerFn(saveSetupDefaults);
  const platformFn = useServerFn(saveSetupPlatform);
  const finishFn = useServerFn(completeSetup);
  const environment = useQuery({
    queryKey: ["product-setup-environment"],
    queryFn: () => environmentFn(),
    enabled: step === "system" || step === "finish",
  });

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [adminReady, setAdminReady] = useState(initialSuperAdmin);
  const strongPassword = useMemo(
    () => password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password),
    [password],
  );
  const admin = useMutation({
    mutationFn: () => createAdminFn({ data: { full_name: fullName, email, password } }),
    onSuccess: async () => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(`Super Admin created, but sign-in failed: ${error.message}`);
      setAdminReady(true);
      await queryClient.invalidateQueries({ queryKey: ["product-setup-status"] });
    },
  });

  const [appName, setAppName] = useState(BRAND_NAME);
  const [tagline, setTagline] = useState("Customer conversations, unified");
  const [primaryColor, setPrimaryColor] = useState("#B91C1C");
  const [logoUrl, setLogoUrl] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");
  const identity = useMutation({
    mutationFn: () => identityFn({ data: {
      app_name: appName,
      tagline: tagline || null,
      primary_color: primaryColor || null,
      logo_url: logoUrl || null,
      favicon_url: faviconUrl || null,
    } }),
  });

  const [language, setLanguage] = useState("en");
  const [timezone, setTimezone] = useState(typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" : "UTC");
  const [currency, setCurrency] = useState("USD");
  const [dateFormat, setDateFormat] = useState<"MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD">("YYYY-MM-DD");
  const defaults = useMutation({ mutationFn: () => defaultsFn({ data: { language, timezone, currency, date_format: dateFormat } }) });

  const [saasEnabled, setSaasEnabled] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [multiTenant, setMultiTenant] = useState(true);
  const [subscriptionsEnabled, setSubscriptionsEnabled] = useState(false);
  const [defaultPlan, setDefaultPlan] = useState("starter");
  const platform = useMutation({
    mutationFn: () => platformFn({ data: {
      saas_enabled: saasEnabled,
      registration_enabled: registrationEnabled,
      multi_tenant: multiTenant,
      subscriptions_enabled: subscriptionsEnabled,
      default_plan: defaultPlan || null,
    } }),
  });

  const finish = useMutation({
    mutationFn: () => finishFn(),
    onSuccess: () => navigate({ to: "/dashboard" as string as never }),
  });

  const canContinue =
    (step === "system" && environment.data?.ready === true) ||
    (step === "admin" && adminReady) ||
    (step === "identity" && identity.data?.ok === true) ||
    (step === "defaults" && defaults.data?.ok === true) ||
    (step === "platform" && platform.data?.ok === true);

  return (
    <SetupShell progress={((stepIndex + 1) / STEPS.length) * 100} labels={STEPS.map((item) => item.label)} active={stepIndex}>
      <Card>
        {step === "system" && (
          <>
            <CardHeader><CardTitle>System Check</CardTitle><CardDescription>Core services are required. Integrations are optional and can be configured later.</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              {environment.isLoading && <p className="text-sm text-muted-foreground">Checking core services…</p>}
              {environment.data && <><h3 className="font-medium">Required</h3><CheckList checks={environment.data.required} /><h3 className="font-medium">Optional integrations</h3><CheckList checks={environment.data.optional} /></>}
            </CardContent>
          </>
        )}
        {step === "admin" && (
          <>
            <CardHeader><CardTitle>Platform Super Admin</CardTitle><CardDescription>Create the one initial platform-level administrator.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {initialSuperAdmin || adminReady ? (
                <p className="flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Platform Super Admin is ready.</p>
              ) : (
                <>
                  <Field label="Full name"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
                  <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
                  <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
                  <Field label="Confirm password"><Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></Field>
                  <p className="text-xs text-muted-foreground">Use at least 12 characters with uppercase, lowercase, number and symbol.</p>
                  <Button disabled={admin.isPending || !fullName || !email || !strongPassword || password !== confirmPassword} onClick={() => admin.mutate()}>{admin.isPending ? "Creating…" : "Create Platform Super Admin"}</Button>
                  {admin.isError && <p className="text-sm text-destructive">{(admin.error as Error).message}</p>}
                </>
              )}
            </CardContent>
          </>
        )}
        {step === "identity" && (
          <>
            <CardHeader><CardTitle>Product Identity</CardTitle><CardDescription>Set the minimal product identity. Design-system behavior is unchanged.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Product / App name"><Input value={appName} onChange={(e) => setAppName(e.target.value)} /></Field>
              <Field label="Tagline"><Input value={tagline} onChange={(e) => setTagline(e.target.value)} /></Field>
              <Field label="Logo URL"><Input type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" /></Field>
              <Field label="Favicon URL"><Input type="url" value={faviconUrl} onChange={(e) => setFaviconUrl(e.target.value)} placeholder="https://…" /></Field>
              <Field label="Primary brand color"><Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} /></Field>
              <Button disabled={identity.isPending || !appName || !/^#[0-9a-fA-F]{6}$/.test(primaryColor)} onClick={() => identity.mutate()}>{identity.isPending ? "Saving…" : identity.data?.ok ? "Product identity saved" : "Save product identity"}</Button>
              {identity.isError && <p className="text-sm text-destructive">{(identity.error as Error).message}</p>}
            </CardContent>
          </>
        )}
        {step === "defaults" && (
          <>
            <CardHeader><CardTitle>System Defaults</CardTitle><CardDescription>Defaults can be changed later from platform settings.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Default language" value={language} onChange={setLanguage} options={LANGUAGES.map((item) => ({ value: item.code, label: item.label }))} />
              <SelectField label="Timezone" value={timezone} onChange={setTimezone} options={TIMEZONES.map((value) => ({ value, label: value }))} />
              <SelectField label="Currency" value={currency} onChange={setCurrency} options={CURRENCIES.map((value) => ({ value, label: value }))} />
              <SelectField label="Date format" value={dateFormat} onChange={(value) => setDateFormat(value as typeof dateFormat)} options={["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"].map((value) => ({ value, label: value }))} />
              <div className="sm:col-span-2"><Button disabled={defaults.isPending} onClick={() => defaults.mutate()}>{defaults.isPending ? "Saving…" : defaults.data?.ok ? "Defaults saved" : "Save defaults"}</Button></div>
              {defaults.isError && <p className="text-sm text-destructive sm:col-span-2">{(defaults.error as Error).message}</p>}
            </CardContent>
          </>
        )}
        {step === "platform" && (
          <>
            <CardHeader><CardTitle>Platform / SaaS</CardTitle><CardDescription>Integrations are configured later. These switches define basic platform behavior.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <Toggle label="SaaS mode" checked={saasEnabled} onChange={setSaasEnabled} />
              <Toggle label="Public registration" checked={registrationEnabled} onChange={setRegistrationEnabled} />
              <Toggle label="Multi-tenant organizations and workspaces" checked={multiTenant} onChange={setMultiTenant} />
              <Toggle label="Subscriptions / billing" checked={subscriptionsEnabled} onChange={setSubscriptionsEnabled} />
              {(saasEnabled || subscriptionsEnabled) && <Field label="Default plan"><Input value={defaultPlan} onChange={(e) => setDefaultPlan(e.target.value)} /></Field>}
              <Button disabled={platform.isPending} onClick={() => platform.mutate()}>{platform.isPending ? "Saving…" : platform.data?.ok ? "Platform settings saved" : "Save platform settings"}</Button>
              {platform.isError && <p className="text-sm text-destructive">{(platform.error as Error).message}</p>}
            </CardContent>
          </>
        )}
        {step === "finish" && (
          <>
            <CardHeader><CardTitle>Ready to Launch</CardTitle><CardDescription>Critical requirements are rechecked server-side when you launch.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <ul className="divide-y rounded-lg border">
                {["Database", "Auth", "Storage", "Super Admin", "Product", "Platform"].map((label) => (
                  <li key={label} className="flex items-center justify-between p-3 text-sm"><span>{label}</span><span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-4 w-4" /> READY</span></li>
                ))}
              </ul>
              <Button className="w-full" size="lg" disabled={finish.isPending || environment.data?.ready !== true || !adminReady} onClick={() => finish.mutate()}>
                {finish.isPending ? "Finalizing…" : "Launch Application"}
              </Button>
              {finish.isError && <p className="text-sm text-destructive">{(finish.error as Error).message}</p>}
            </CardContent>
          </>
        )}
      </Card>

      <div className="mt-6 flex justify-between">
        <Button variant="outline" disabled={stepIndex === 0 || finish.isPending} onClick={() => setStepIndex((value) => Math.max(0, value - 1))}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
        {step !== "finish" && <Button disabled={!canContinue} onClick={() => setStepIndex((value) => Math.min(STEPS.length - 1, value + 1))}>Next <ArrowRight className="ml-2 h-4 w-4" /></Button>}
      </div>
    </SetupShell>
  );
}

function SetupShell({ children, progress, labels, active }: { children: ReactNode; progress: number; labels?: string[]; active?: number }) {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-background via-background to-muted/30">
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary"><Rocket className="h-7 w-7 text-primary-foreground" /></div>
          <h1 className="text-3xl font-semibold tracking-tight">Product Setup</h1>
          <p className="text-muted-foreground">Secure first-run platform initialization</p>
        </div>
        <Progress value={progress} className="mb-3" />
        {labels && <div className="mb-6 hidden justify-between text-xs text-muted-foreground sm:flex">{labels.map((label, index) => <span key={label} className={index === active ? "font-medium text-foreground" : ""}>{label}</span>)}</div>}
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid gap-2"><Label>{label}</Label>{children}</div>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center justify-between rounded-lg border p-3 text-sm"><span>{label}</span><Switch checked={checked} onCheckedChange={onChange} /></label>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <Field label={label}><Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></Field>;
}
