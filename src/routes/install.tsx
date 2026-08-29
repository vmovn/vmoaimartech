import { Brand } from "@/components/brand";
import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, AlertTriangle, Info, Rocket, ArrowRight, ArrowLeft, Sparkles, ShieldCheck, Database, Package, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  checkSystemRequirements,
  validateEnvironment,
  activateLicense,
  runOneClickInstall,
  bootstrapSuperAdmin,
  type Probe,
  type ProbeStatus,
} from "@/lib/release/installation.functions";
import { getSetupStatus } from "@/lib/setup/setup.functions";
import { APP_VERSION_LABEL } from "@/lib/app-version";

export const Route = createFileRoute("/install")({
  head: () => ({
    meta: [
      { title: `Install ${BRAND_NAME} — CodeCanyon Setup Wizard` },
      { name: "description", content: `One-click installation wizard for ${BRAND_NAME}. Verify requirements, create your administrator account, activate your license, and launch in minutes.` },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async () => {
    try {
      const status = await getSetupStatus();
      if (status.setupComplete) throw redirect({ to: "/auth" });
    } catch (e) {
      if ((e as { isRedirect?: boolean }).isRedirect) throw e;
    }
  },
  component: InstallWizard,
});


type StepKey = "welcome" | "requirements" | "environment" | "admin" | "license" | "install" | "finish";
const STEPS: { key: StepKey; label: string }[] = [
  { key: "welcome", label: "Welcome" },
  { key: "requirements", label: "System" },
  { key: "environment", label: "Environment" },
  { key: "admin", label: "Admin" },
  { key: "license", label: "License" },
  { key: "install", label: "Install" },
  { key: "finish", label: "Finish" },
];


const statusIcon = (s: ProbeStatus) => {
  if (s === "pass") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (s === "warn") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (s === "fail") return <XCircle className="h-4 w-4 text-rose-500" />;
  return <Info className="h-4 w-4 text-sky-500" />;
};

function ProbeList({ probes }: { probes: Probe[] }) {
  return (
    <ul className="space-y-2">
      {probes.map((p) => (
        <li key={p.id} className="flex items-start gap-3 rounded-lg border bg-card/50 p-3">
          <div className="mt-0.5">{statusIcon(p.status)}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{p.label}</span>
              <Badge variant="outline" className="text-[11px] uppercase">{p.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{p.detail}</p>
            {p.fix && <p className="mt-1 text-xs text-amber-600">→ {p.fix}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function InstallWizard() {
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx].key;

  const sysFn = useServerFn(checkSystemRequirements);
  const envFn = useServerFn(validateEnvironment);
  const activateFn = useServerFn(activateLicense);
  const installFn = useServerFn(runOneClickInstall);
  const bootstrapFn = useServerFn(bootstrapSuperAdmin);

  const sys = useQuery({ queryKey: ["install.sys"], queryFn: () => sysFn(), enabled: step === "requirements" });
  const env = useQuery({ queryKey: ["install.env"], queryFn: () => envFn(), enabled: step === "environment" });

  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminMsg, setAdminMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [adminUserId, setAdminUserId] = useState<string | null>(null);

  const [purchase, setPurchase] = useState("");
  const [buyer, setBuyer] = useState("");
  const [seedDemo, setSeedDemo] = useState(true);
  const [licenseMsg, setLicenseMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  const bootstrapMut = useMutation({
    mutationFn: async () => {
      const r = await bootstrapFn({ data: { email: adminEmail, password: adminPassword, full_name: adminName || undefined } });
      if (r.ok) {
        // Sign the new admin in immediately so subsequent steps have a session.
        const { error } = await supabase.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
        if (error) throw new Error(`Admin created but sign-in failed: ${error.message}`);
      }
      return r;
    },
    onSuccess: (r) => {
      setAdminMsg({ ok: r.ok, msg: r.message });
      if (r.ok && r.user_id) setAdminUserId(r.user_id);
    },
    onError: (e: Error) => setAdminMsg({ ok: false, msg: e.message }),
  });

  const activateMut = useMutation({
    mutationFn: () => activateFn({ data: { purchase_code: purchase, buyer } }),
    onSuccess: (r) => setLicenseMsg({ ok: r.active, msg: r.message }),
    onError: (e: Error) => setLicenseMsg({ ok: false, msg: e.message }),
  });

  const installMut = useMutation({
    mutationFn: () => installFn({ data: { seed_demo: seedDemo, admin_user_id: adminUserId } }),
  });

  const canProceed =
    step === "welcome" ||
    (step === "requirements" && sys.data?.overall !== "fail") ||
    (step === "environment" && env.data?.overall !== "fail") ||
    (step === "admin" && !!adminUserId) ||
    (step === "license" && licenseMsg?.ok) ||
    (step === "install" && installMut.data?.ok) ||
    step === "finish";


  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/60 shadow-lg">
            <Rocket className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Install <Brand /></h1>
          <p className="text-muted-foreground">CodeCanyon setup wizard · {APP_VERSION_LABEL}</p>
        </div>

        <div className="mb-6">
          <Progress value={((stepIdx + 1) / STEPS.length) * 100} />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            {STEPS.map((s, i) => (
              <span key={s.key} className={i === stepIdx ? "font-medium text-foreground" : ""}>{s.label}</span>
            ))}
          </div>
        </div>

        <Card>
          {step === "welcome" && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Welcome to <Brand /></CardTitle>
                <CardDescription>
                  Enterprise WhatsApp CRM, marketing automation, sales pipelines, AI assistant, and BI — all in one platform.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { icon: ShieldCheck, label: "Security-first" },
                    { icon: Database, label: "Multi-tenant" },
                    { icon: Package, label: "One-click deploy" },
                  ].map(({ icon: Icon, label }) => (
                    <div key={label} className="rounded-lg border bg-card/40 p-4 text-center">
                      <Icon className="mx-auto mb-2 h-6 w-6 text-primary" />
                      <p className="text-sm font-medium">{label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  This wizard verifies your environment, activates your CodeCanyon license, applies migrations, and optionally seeds sample data.
                </p>
              </CardContent>
            </>
          )}

          {step === "requirements" && (
            <>
              <CardHeader>
                <CardTitle>System Requirements</CardTitle>
                <CardDescription>Verifying runtime, crypto, and network capabilities.</CardDescription>
              </CardHeader>
              <CardContent>
                {sys.isLoading && <p className="text-sm text-muted-foreground">Running checks…</p>}
                {sys.data && <ProbeList probes={sys.data.probes} />}
              </CardContent>
            </>
          )}

          {step === "environment" && (
            <>
              <CardHeader>
                <CardTitle>Environment Validation</CardTitle>
                <CardDescription>Required and optional environment variables.</CardDescription>
              </CardHeader>
              <CardContent>
                {env.isLoading && <p className="text-sm text-muted-foreground">Scanning environment…</p>}
                {env.data && <ProbeList probes={env.data.probes} />}
              </CardContent>
            </>
          )}

          {step === "admin" && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary" /> Create Administrator Account</CardTitle>
                <CardDescription>
                  This is the first superadmin for your <Brand /> install. It's created before license activation so the wizard can continue on a fresh database.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="admin-email">Email</Label>
                  <Input id="admin-email" type="email" autoComplete="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="you@example.com" disabled={!!adminUserId} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="admin-password">Password</Label>
                  <Input id="admin-password" type="password" autoComplete="new-password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="At least 8 characters" disabled={!!adminUserId} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="admin-name">Full name (optional)</Label>
                  <Input id="admin-name" value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Jane Doe" disabled={!!adminUserId} />
                </div>
                <Button
                  onClick={() => bootstrapMut.mutate()}
                  disabled={bootstrapMut.isPending || !adminEmail || adminPassword.length < 8 || !!adminUserId}
                >
                  {adminUserId ? "Administrator ready" : bootstrapMut.isPending ? "Creating…" : "Create administrator"}
                </Button>
                {adminMsg && (
                  <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${adminMsg.ok ? "border-emerald-500/40 bg-emerald-500/10" : "border-rose-500/40 bg-rose-500/10"}`}>
                    {adminMsg.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-rose-500" />}
                    <span>{adminMsg.msg}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  This step is disabled once a superadmin already exists. Sign in with your existing admin account to continue.
                </p>
              </CardContent>
            </>
          )}



          {step === "license" && (
            <>
              <CardHeader>
                <CardTitle>License Activation</CardTitle>
                <CardDescription>Enter the purchase code from your CodeCanyon Downloads page.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="purchase">Purchase code</Label>
                  <Input id="purchase" value={purchase} onChange={(e) => setPurchase(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="buyer">Buyer name (optional)</Label>
                  <Input id="buyer" value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="Your name or company" />
                </div>
                <Button onClick={() => activateMut.mutate()} disabled={activateMut.isPending || !purchase}>
                  {activateMut.isPending ? "Activating…" : "Activate license"}
                </Button>
                {licenseMsg && (
                  <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${licenseMsg.ok ? "border-emerald-500/40 bg-emerald-500/10" : "border-rose-500/40 bg-rose-500/10"}`}>
                    {licenseMsg.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-rose-500" />}
                    <span>{licenseMsg.msg}</span>
                  </div>
                )}
              </CardContent>
            </>
          )}

          {step === "install" && (
            <>
              <CardHeader>
                <CardTitle>One-Click Installation</CardTitle>
                <CardDescription>Apply migrations, verify config, and optionally seed demo data.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={seedDemo} onCheckedChange={(v) => setSeedDemo(!!v)} />
                  Seed sample contacts for exploring the CRM
                </label>
                <Button onClick={() => installMut.mutate()} disabled={installMut.isPending}>
                  {installMut.isPending ? "Installing…" : "Run installation"}
                </Button>
                {installMut.data && (
                  <ul className="space-y-2">
                    {installMut.data.steps.map((s) => (
                      <li key={s.id} className="flex items-start gap-3 rounded-lg border p-3">
                        {statusIcon(s.status)}
                        <div>
                          <p className="font-medium">{s.label}</p>
                          <p className="text-sm text-muted-foreground">{s.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </>
          )}

          {step === "finish" && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-500" /> You're ready to launch</CardTitle>
                <CardDescription><Brand /> is installed and configured. Head to the dashboard or explore the release center.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Link to="/" className="rounded-lg border bg-card/40 p-4 hover:bg-card">
                    <p className="font-medium">Open dashboard</p>
                    <p className="text-sm text-muted-foreground">Go to the app home.</p>
                  </Link>
                  <Link to="/release-center" className="rounded-lg border bg-card/40 p-4 hover:bg-card">
                    <p className="font-medium">Release Center</p>
                    <p className="text-sm text-muted-foreground">Updates, health, optimization, docs.</p>
                  </Link>
                </div>
              </CardContent>
            </>
          )}
        </Card>

        <div className="mt-6 flex justify-between">
          <Button variant="outline" onClick={() => setStepIdx((i) => Math.max(0, i - 1))} disabled={stepIdx === 0}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <Button onClick={() => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))} disabled={!canProceed || stepIdx === STEPS.length - 1}>
            Next <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
