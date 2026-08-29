/**
 * Platform feature flags → app surfaces.
 *
 * Super Admin → Platform Settings → Feature toggles turns whole modules on
 * or off for the entire platform. This module is the single place that maps
 * a flag to the routes it governs, so navigation, the command palette and
 * route guards all agree.
 *
 * Client-safe: no server imports.
 */
import { PLATFORM_FEATURE_DEFAULTS } from "@/lib/admin/platform-runtime.functions";

/** Route prefixes governed by each feature flag. */
export const FEATURE_ROUTE_PREFIXES: Record<string, string[]> = {
  ai_assistant: ["/ai-studio", "/sales-ai", "/ai-"],
  sales_crm: ["/deals", "/sales", "/products", "/quotes", "/invoices", "/activities"],
  marketing: [
    "/marketing",
    "/campaigns",
    "/broadcasts",
    "/campaign-templates",
    "/drip",
    "/scheduling",
    "/audience",
    "/segments",
    "/contact-lists",
    "/social",
  ],
  automations: ["/automations", "/workflows"],
  bi: ["/bi", "/reports", "/analytics", "/insights"],
  kb_rag: ["/knowledge"],
};

/** Flags that only affect in-page behaviour (no dedicated routes). */
export const NON_ROUTE_FEATURES = ["voice_notes", "beta_features"] as const;

export function isFeatureEnabled(features: Record<string, boolean> | undefined, key: string): boolean {
  if (!features) return PLATFORM_FEATURE_DEFAULTS[key] ?? true;
  return features[key] ?? PLATFORM_FEATURE_DEFAULTS[key] ?? true;
}

/**
 * Is a given app path allowed by the current platform feature flags?
 * Paths not governed by any flag are always allowed.
 */
export function isRouteEnabled(features: Record<string, boolean> | undefined, path: string): boolean {
  for (const [flag, prefixes] of Object.entries(FEATURE_ROUTE_PREFIXES)) {
    if (isFeatureEnabled(features, flag)) continue;
    if (prefixes.some((p) => path === p || path.startsWith(p))) return false;
  }
  return true;
}

/** The flag that governs a path, if any (used for the "module disabled" screen). */
export function featureForRoute(path: string): string | null {
  for (const [flag, prefixes] of Object.entries(FEATURE_ROUTE_PREFIXES)) {
    if (prefixes.some((p) => path === p || path.startsWith(p))) return flag;
  }
  return null;
}
