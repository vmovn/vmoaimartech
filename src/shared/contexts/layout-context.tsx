import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type NavMode = "mobile" | "mini" | "full";

type LayoutContextValue = {
  /** Raw user preference for the desktop sidebar (only respected in `full` nav mode). */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean, opts?: { persist?: boolean }) => void;

  /**
   * Responsive nav mode driven by viewport width:
   *  - `mobile`: < 768px  → drawer / offcanvas
   *  - `mini`:  768–1200px → forced 60px icon rail
   *  - `full`:  > 1200px  → user-toggleable full sidebar
   */
  navMode: NavMode;
  /** Effective collapsed state (true in `mini`, or when user collapsed in `full`). */
  effectiveCollapsed: boolean;

  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;

  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;
  toggleCommand: () => void;
};

const LayoutContext = createContext<LayoutContextValue | null>(null);
const SIDEBAR_KEY = "pmai.sidebar.collapsed";

function computeNavMode(width: number): NavMode {
  if (width < 768) return "mobile";
  if (width <= 1200) return "mini";
  return "full";
}

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [navMode, setNavMode] = useState<NavMode>(() =>
    typeof window === "undefined" ? "full" : computeNavMode(window.innerWidth),
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SIDEBAR_KEY);
      if (raw === "1") setSidebarCollapsedState(true);
    } catch { /* noop */ }
  }, []);

  // Track viewport-driven nav mode.
  useEffect(() => {
    const compute = () => setNavMode(computeNavMode(window.innerWidth));
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("orientationchange", compute);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
    };
  }, []);

  // Auto-close mobile drawer when leaving mobile mode.
  useEffect(() => {
    if (navMode !== "mobile" && mobileNavOpen) setMobileNavOpen(false);
  }, [navMode, mobileNavOpen]);

  /**
   * Update the sidebar collapse state. Pass `{ persist: false }` for temporary
   * route-driven collapses so the user's saved preference is not overwritten.
   */
  const setSidebarCollapsed = (v: boolean, opts?: { persist?: boolean }) => {
    setSidebarCollapsedState(v);
    if (opts?.persist === false) return;
    try { window.localStorage.setItem(SIDEBAR_KEY, v ? "1" : "0"); } catch { /* noop */ }
  };

  // Global ⌘K / Ctrl+K to toggle command palette.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const effectiveCollapsed = navMode === "mini" || (navMode === "full" && sidebarCollapsed);

  const value = useMemo<LayoutContextValue>(
    () => ({
      sidebarCollapsed,
      toggleSidebar: () => {
        // In mini mode the width is fixed; toggling only makes sense in full mode.
        if (navMode !== "full") return;
        setSidebarCollapsed(!sidebarCollapsed);
      },
      setSidebarCollapsed,
      navMode,
      effectiveCollapsed,
      mobileNavOpen,
      setMobileNavOpen,
      commandOpen,
      setCommandOpen,
      toggleCommand: () => setCommandOpen((v) => !v),
    }),
    [sidebarCollapsed, mobileNavOpen, commandOpen, navMode, effectiveCollapsed],
  );

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error("useLayout must be used inside LayoutProvider");
  return ctx;
}
