/**
 * ThemeApplier — mounts the active theme + white-label tokens into :root.
 * Handles colors, typography, dark/light mode, favicon, custom CSS + JS.
 * Drops into any authenticated shell; no-op when nothing is configured.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getActiveTheme } from '@/lib/themes/themes.functions';
import { getWhiteLabel } from '@/lib/white-label/white-label.functions';
import { applyThemeTokens } from '@/lib/themes/apply';

const CSS_ID = 'swiffer-white-label-css';
const JS_ID = 'swiffer-white-label-js';
const DARK_TOKENS_ID = 'swiffer-white-label-dark-tokens';

export function ThemeApplier() {
  // Theme/branding is never cached: the saved values are the single source of
  // truth, so every mount re-reads them instead of painting a stale theme.
  const noCache = { staleTime: 0, gcTime: 0, refetchOnMount: 'always' as const };
  const { data: theme } = useQuery({ queryKey: ['active-theme'], queryFn: () => getActiveTheme({}), ...noCache });
  const { data: wl } = useQuery({ queryKey: ['white-label'], queryFn: () => getWhiteLabel({}), ...noCache });

  useEffect(() => {
    const themeTokens = (theme?.installation as any)?.themes?.tokens ?? {};
    const overrides = (theme?.installation as any)?.overrides ?? {};
    const tokens: Record<string, string> = { ...themeTokens, ...overrides };
    const c: any = wl?.config;
    const active = c?.is_active;

    if (active) {
      // Base colors
      if (c.primary_color) tokens['--primary'] = c.primary_color;
      if (c.secondary_color) tokens['--secondary'] = c.secondary_color;
      if (c.accent_color) tokens['--accent'] = c.accent_color;
      if (c.background_color) tokens['--background'] = c.background_color;

      // Sidebar theme
      if (c.sidebar_background) tokens['--sidebar-background'] = c.sidebar_background;
      if (c.sidebar_foreground) tokens['--sidebar-foreground'] = c.sidebar_foreground;
      if (c.sidebar_accent) tokens['--sidebar-accent'] = c.sidebar_accent;

      // Dashboard theme
      if (c.dashboard_background) tokens['--dashboard-background'] = c.dashboard_background;
      if (c.dashboard_accent) tokens['--dashboard-accent'] = c.dashboard_accent;

      // Typography
      if (c.font_family_sans) tokens['--font-sans'] = c.font_family_sans;
      if (c.font_family_heading) tokens['--font-heading'] = c.font_family_heading;
      if (c.font_family_mono) tokens['--font-mono'] = c.font_family_mono;
      if (c.font_size_base) tokens['--font-size-base'] = c.font_size_base;

      // Radius + icons
      if (c.border_radius) tokens['--radius'] = c.border_radius;
      if (c.icon_stroke_width != null) tokens['--icon-stroke'] = String(c.icon_stroke_width);
    }

    applyThemeTokens(tokens);

    // Color-mode preference — apply to <html> for Tailwind dark mode
    if (active && c.default_color_mode) {
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      if (c.default_color_mode === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.classList.add(prefersDark ? 'dark' : 'light');
      } else {
        root.classList.add(c.default_color_mode);
      }
      root.setAttribute('data-color-mode', c.default_color_mode);
    }

    // Dark-mode overrides — emit a scoped CSS block so tokens flip under .dark
    upsertStyle(DARK_TOKENS_ID, active ? buildDarkOverrides(c) : '');

    // Custom CSS
    upsertStyle(CSS_ID, active && c?.custom_css ? c.custom_css : '');

    // Custom JS — sandboxed via script tag; re-runs when content changes
    upsertScript(JS_ID, active && c?.custom_js ? c.custom_js : '');

    // Favicon + title
    if (active) {
      if (c.meta_title) document.title = c.meta_title;
      if (c.favicon_url) setFavicon(c.favicon_url);
    }

    // Body class for icon style — used by app to switch icon variants
    if (active && c.icon_style) {
      document.documentElement.setAttribute('data-icon-style', c.icon_style);
    }
  }, [theme, wl]);

  return null;
}

function buildDarkOverrides(c: any): string {
  if (!c) return '';
  const rules: string[] = [];
  if (c.dark_primary_color) rules.push(`--primary: ${c.dark_primary_color};`);
  if (c.dark_background_color) rules.push(`--background: ${c.dark_background_color};`);
  if (c.dark_accent_color) rules.push(`--accent: ${c.dark_accent_color};`);
  if (!rules.length) return '';
  return `.dark, [data-color-mode="dark"] { ${rules.join(' ')} }`;
}

function upsertStyle(id: string, content: string) {
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!content) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    document.head.appendChild(el);
  }
  if (el.textContent !== content) el.textContent = content;
}

function upsertScript(id: string, content: string) {
  const prev = document.getElementById(id);
  if (prev) prev.remove();
  if (!content) return;
  const s = document.createElement('script');
  s.id = id;
  s.type = 'text/javascript';
  s.textContent = content;
  document.body.appendChild(s);
}

function setFavicon(href: string) {
  let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = href;
}
