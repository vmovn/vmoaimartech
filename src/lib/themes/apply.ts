/**
 * Runtime theme application — merge theme tokens + overrides into :root.
 * Called from the White Label / Theme provider once the workspace loads.
 */
export type ThemeTokens = Record<string, string>;

/**
 * Last value written for each custom property. Writing to `style` invalidates
 * style/layout for the whole document, so re-applying an identical token is a
 * wasted repaint — providers re-run on every render and would otherwise touch
 * `:root` continuously.
 */
const applied = new Map<string, string>();

export function applyThemeTokens(tokens: ThemeTokens | null | undefined, overrides?: ThemeTokens | null) {
  if (typeof document === 'undefined') return;
  const merged = { ...(tokens ?? {}), ...(overrides ?? {}) };
  const root = document.documentElement;
  for (const [k, v] of Object.entries(merged)) {
    if (!v) continue;
    const name = k.startsWith('--') ? k : `--${k}`;
    const value = String(v);
    if (applied.get(name) === value) continue;
    applied.set(name, value);
    root.style.setProperty(name, value);
  }
}

export function clearThemeTokens(tokens: ThemeTokens | null | undefined) {
  if (typeof document === 'undefined' || !tokens) return;
  const root = document.documentElement;
  for (const k of Object.keys(tokens)) {
    const name = k.startsWith('--') ? k : `--${k}`;
    applied.delete(name);
    root.style.removeProperty(name);
  }
}
