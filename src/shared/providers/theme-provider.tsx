import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Theme = "light" | "dark" | "system";

export const DEFAULT_THEME: Theme = "system";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  /** True until the stored preference has been loaded from the backend. */
  isLoading: boolean;
  setTheme: (t: Theme) => void;
  /** Restore the default appearance (system) and persist it. */
  resetTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isTheme(v: unknown): v is Theme {
  return v === "light" || v === "dark" || v === "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Theme preference is stored per user in the backend (`user_theme_preferences`).
 * Nothing is cached in localStorage — the database is the single source of truth,
 * so the same account gets the same appearance on every device and browser.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [systemDark, setSystemDark] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    setSystemDark(systemPrefersDark());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Load the persisted preference for the signed-in user, and follow auth changes.
  useEffect(() => {
    let cancelled = false;

    const load = async (userId: string | null) => {
      userIdRef.current = userId;
      if (!userId) {
        if (!cancelled) {
          setThemeState(DEFAULT_THEME);
          setIsLoading(false);
        }
        return;
      }
      const { data } = await (supabase as any)
        .from("user_theme_preferences")
        .select("theme_mode")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      setThemeState(isTheme(data?.theme_mode) ? data.theme_mode : DEFAULT_THEME);
      setIsLoading(false);
    };

    void supabase.auth.getSession().then(({ data }) => load(data.session?.user?.id ?? null));

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      void load(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const resolvedTheme: "light" | "dark" = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const persist = useCallback((t: Theme) => {
    setThemeState(t);
    const userId = userIdRef.current;
    if (!userId) return;
    void (supabase as any)
      .from("user_theme_preferences")
      .upsert({ user_id: userId, theme_mode: t }, { onConflict: "user_id" });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      isLoading,
      setTheme: persist,
      resetTheme: () => persist(DEFAULT_THEME),
    }),
    [theme, resolvedTheme, isLoading, persist],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  // Safe fallback for trees rendered outside ThemeProvider (e.g. SSR of
  // marketing routes before the provider hydrates). Prevents a crash and
  // lets the client re-render pick up the real context.
  return {
    theme: DEFAULT_THEME,
    resolvedTheme: "light",
    isLoading: false,
    setTheme: () => {},
    resetTheme: () => {},
  };
}
