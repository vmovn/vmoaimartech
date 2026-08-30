import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";
import { z } from "zod";
import { PasswordInput } from "@/components/auth/password-input";
import { usePlatformRuntime } from "@/hooks/use-platform-runtime";
import { usePlatformBranding } from "@/hooks/use-platform-branding";
import swifferLogo from "@/assets/swiffer-logo.png";
import { safeNext, safeNextFromSearch } from "@/lib/auth/next-path";
import { APP_VERSION_LABEL } from "@/lib/app-version";
import { getSetupStatus } from "@/lib/setup/setup.functions";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { next?: string } => {
    if (typeof search.next === "string") return { next: search.next };
    if (typeof search.plan === "string" && /^[a-z0-9_-]{1,40}$/i.test(search.plan)) {
      return { next: `/billing?plan=${encodeURIComponent(search.plan)}` };
    }
    return {};
  },
  head: () => ({
    meta: [
      { title: "Sign in or create an account" },
      { name: "description", content: "Sign in or create your account to manage customer conversations." },
      { property: "og:title", content: "Sign in or create an account" },
      { property: "og:description", content: "Access your customer conversation workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async ({ location, search }) => {
    const setup = await getSetupStatus();
    if (!setup.setupComplete) throw redirect({ to: "/setup" });
    if (typeof window === "undefined") return;
    
    // Use a race to avoid hanging the route transition if Supabase is slow
    const session = await Promise.race([
      supabase.auth.getSession().then(({ data }) => data.session).catch(() => null),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 2500)),
    ]);

    if (session) {
      const raw = safeNextFromSearch(location.searchStr ?? "");
      const target = search.next?.startsWith("/billing?plan=") ? search.next : raw;
      
      // Prevent self-redirect loop if next is /auth
      if (target.startsWith("/auth")) {
        throw redirect({ to: "/dashboard" });
      }
      
      throw redirect({ href: target });
    }
  },
  component: AuthPage,
});

const credsSchema = (min: number) =>
  z.object({
    email: z.string().email("Enter a valid email"),
    password: z.string().min(min, `Password must be at least ${min} characters`),
  });
const magicSchema = z.object({ email: z.string().email("Enter a valid email") });

type Mode = "sign-in" | "sign-up" | "magic-link";

function AuthPage() {
  const brand = usePlatformBranding();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const next = safeNext();
  const { config: platform } = usePlatformRuntime();
  const authCfg = platform.auth;
  const minPassword = platform.security.passwordMinLength;

  const modes = (["sign-in", "magic-link", "sign-up"] as const).filter(
    (m) => (m !== "magic-link" || authCfg.magicLink) && (m !== "sign-up" || authCfg.allowSignups),
  );
  useEffect(() => {
    if (!modes.includes(mode)) setMode("sign-in");
  }, [modes, mode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("platform.remember", remember ? "1" : "0");
  }, [remember]);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    const parsed = credsSchema(mode === "sign-up" ? minPassword : 8).safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      if (mode === "sign-in") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!remember && typeof window !== "undefined" && data.session) {
          const keys = Object.keys(window.localStorage).filter((k) => k.startsWith("sb-"));
          keys.forEach((k) => {
            const v = window.localStorage.getItem(k);
            if (v) window.sessionStorage.setItem(k, v);
            window.localStorage.removeItem(k);
          });
        }
        toast.success("Welcome back!");
        navigate({ href: next, replace: true });
        void import("@/components/app/team/auto-invite-panel")
          .then((m) => m.applyAutoInviteRulesForCurrentUser())
          .then((joined) => {
            if (joined > 0)
              toast.info(`You were added to ${joined} workspace${joined === 1 ? "" : "s"} via domain rules.`);
          })
          .catch(() => 0);
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + next },
        });
        if (error) throw error;
        toast.success("Account created — check your email to verify.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    const parsed = magicSchema.safeParse({ email });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + next },
      });
      if (error) throw error;
      setMagicSent(true);
      toast.success("Magic link sent — check your email.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error instanceof Error ? result.error : new Error(String(result.error));
      if (result.redirected) return;
      navigate({ href: next, replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
      setLoading(false);
    }
  }

  async function handleApple() {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("apple", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error instanceof Error ? result.error : new Error(String(result.error));
      if (result.redirected) return;
      navigate({ href: next, replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Apple sign-in failed");
      setLoading(false);
    }
  }

  function handleFacebook() {
    toast.warning("Facebook sign-in isn't configured", {
      description:
        "The managed auth provider doesn't support Facebook. To enable it, connect a self-hosted Supabase project and turn on the Facebook provider under Authentication → Providers.",
      duration: 8000,
    });
  }

  const isSignUp = mode === "sign-up";
  const isMagic = mode === "magic-link";

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="relative hidden lg:flex flex-col justify-between p-10 bg-gradient-hero text-primary-foreground overflow-hidden">
        <div className="absolute -right-32 top-20 w-96 h-96 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute -left-24 bottom-10 w-80 h-80 rounded-full bg-primary-glow/20 blur-3xl" />
        <Link to="/" className="relative flex items-center gap-2 w-fit">
          <img src={brand.logoUrl ?? swifferLogo} alt="" className="w-9 h-9" />
          <span className="font-bold text-2xl">{brand.platformName}</span>
        </Link>
        <div className="relative max-w-md">
          <h1 className="font-bold text-white text-3xl">{brand.tagline || `The AI-powered WhatsApp CRM for modern teams.`}</h1>
          <p className="mt-3 text-hero-foreground-muted">Sales, support, marketing, and AI automation — self-hosted and multi-tenant from day one.</p>
        </div>
        <p className="relative text-xs text-hero-foreground/90">© {new Date().getFullYear()} {brand.platformName} · {APP_VERSION_LABEL}</p>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex items-center gap-2">
            <img src={brand.logoUrl ?? swifferLogo} alt="" className="w-9 h-9" />
            <span className="font-bold text-2xl">{brand.platformName}</span>
          </div>

          <h2 className="font-display text-2xl font-semibold">
            {isSignUp ? "Create your account" : isMagic ? "Sign in with a magic link" : "Sign in"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isSignUp
              ? `Start your ${brand.platformName} in seconds.`
              : isMagic
              ? "We'll email you a one-click sign-in link."
              : "Welcome back to your workspace."}
          </p>

          <div className="mt-6 inline-flex rounded-md border border-border bg-surface p-1 text-xs">
            {modes.map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setMagicSent(false); }}
                className={`px-3 h-7 rounded-sm font-medium transition-colors ${
                  mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "sign-in" ? "Password" : m === "magic-link" ? "Magic link" : "Sign up"}
              </button>
            ))}
          </div>

          {(authCfg.google || authCfg.apple) && (
          <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${[authCfg.google, authCfg.apple, true].filter(Boolean).length}, minmax(0, 1fr))` }}>
            {authCfg.google && (
            <button
              onClick={handleGoogle}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 h-10 rounded-md border border-input bg-surface hover:bg-muted text-sm font-medium disabled:opacity-50 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
              Google
            </button>
            )}
            {authCfg.apple && (
            <button
              onClick={handleApple}
              disabled={loading}
              aria-label="Sign in with Apple"
              className="inline-flex items-center justify-center gap-2 h-10 rounded-md border border-input bg-surface hover:bg-muted text-sm font-medium disabled:opacity-50 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-foreground" aria-hidden="true"><path d="M16.365 1.43c0 1.14-.42 2.22-1.13 3.02-.76.86-2 1.53-3.02 1.45-.13-1.11.42-2.28 1.09-3.02.76-.86 2.05-1.5 3.06-1.45zM20.5 17.24c-.55 1.27-.82 1.84-1.54 2.96-1 1.57-2.4 3.52-4.15 3.54-1.56.02-1.96-1.02-4.07-1.01-2.11.02-2.55 1.03-4.11 1.01-1.75-.02-3.08-1.78-4.08-3.34C-.24 16.4-1.11 10.5 1.66 6.83c1.55-2.06 3.99-3.28 6.28-3.28 2.35 0 3.83 1.29 5.77 1.29 1.88 0 3.02-1.3 5.74-1.3 2.05 0 4.22 1.12 5.77 3.06-5.07 2.78-4.25 10.04 1.28 10.64z"/></svg>
              Apple
            </button>
            )}
            <button
              onClick={handleFacebook}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 h-10 rounded-md border border-input bg-surface hover:bg-muted text-sm font-medium disabled:opacity-50 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true"><path fill="#1877F2" d="M24 12a12 12 0 1 0-13.88 11.85v-8.38H7.08V12h3.04V9.36c0-3 1.79-4.67 4.53-4.67 1.31 0 2.68.24 2.68.24v2.95h-1.51c-1.49 0-1.96.93-1.96 1.87V12h3.33l-.53 3.47h-2.8v8.38A12 12 0 0 0 24 12z"/></svg>
              Facebook
            </button>
          </div>
          )}

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or with email <div className="h-px flex-1 bg-border" />
          </div>

          {isMagic ? (
            magicSent ? (
              <div className="rounded-md border border-border bg-surface p-4 text-sm">
                <p className="font-medium">Magic link sent</p>
                <p className="text-muted-foreground mt-1">
                  Click the link we just sent to <span className="font-medium text-foreground">{email}</span> to sign in.
                </p>
              </div>
            ) : (
              <form onSubmit={handleMagicLink} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Email</label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required
                    className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-surface text-sm" />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                  {loading ? "Sending…" : "Email me a magic link"}
                </button>
              </form>
            )
          ) : (
            <form onSubmit={handleCredentials} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required
                  className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-surface text-sm" />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Password</label>
                  {!isSignUp && (
                    <Link to="/forgot-password" className="text-xs text-accent font-medium hover:underline">
                      Forgot?
                    </Link>
                  )}
                </div>
                <div className="mt-1">
                  <PasswordInput
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    required
                    minLength={isSignUp ? minPassword : 8}
                    placeholder="••••••••"
                  />
                </div>
                {isSignUp && (
                  <p className="mt-1 text-xs text-muted-foreground">At least {minPassword} characters.</p>
                )}
              </div>

              {!isSignUp && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
                    className="w-4 h-4 rounded border-input accent-accent" />
                  Keep me signed in on this device
                </label>
              )}

              <button type="submit" disabled={loading}
                className="w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                {loading ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
