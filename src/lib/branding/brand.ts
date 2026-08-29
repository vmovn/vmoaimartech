/**
 * Deploy-time brand name.
 *
 * Static contexts that cannot call React hooks — route `head()` metadata,
 * server notifications, iCal producers, sample payloads — must read the brand
 * from here instead of hardcoding the product name, so a white-label deploy
 * only has to set `VITE_BRAND_NAME`.
 *
 * Rendered React copy should prefer `useBrandName()` / `<Brand />`, which also
 * honour per-workspace white-label overrides.
 */
const fromEnv =
  (typeof import.meta !== "undefined" ? (import.meta as any).env?.VITE_BRAND_NAME : undefined) ??
  (typeof process !== "undefined" ? process.env?.["VITE_BRAND_NAME"] : undefined);

export const BRAND_NAME: string = (typeof fromEnv === "string" && fromEnv.trim()) || "Swiffer";
