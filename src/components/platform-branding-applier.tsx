/**
 * PlatformBrandingApplier — applies Super Admin → Platform Settings to the
 * running app: favicon, the base `--primary` design token, and the document
 * language from Platform Settings → Localization.
 *
 * Per-workspace white-label still wins: `TenantAccentProvider` and the
 * white-label config are applied after this and override the same tokens.
 */
import { useEffect } from "react";
import { usePlatformBranding } from "@/hooks/use-platform-branding";
import { usePlatformRuntime } from "@/hooks/use-platform-runtime";
import { isRtlLanguage } from "@/lib/i18n/locale-data";

const FAVICON_ID = "platform-branding-favicon";

export function PlatformBrandingApplier() {
  const brand = usePlatformBranding();
  const { config } = usePlatformRuntime();
  const lang = config.localization.defaultLanguage;
  const rtlAuto = config.localization.rtlAuto;

  useEffect(() => {
    if (typeof document === "undefined" || !lang) return;
    document.documentElement.lang = lang;
    document.documentElement.dir = rtlAuto && isRtlLanguage(lang) ? "rtl" : "ltr";
  }, [lang, rtlAuto]);

  // `--primary` / `--accent` are owned by TenantAccentProvider, which already
  // falls back to Platform Settings → Branding colours when the workspace has
  // no white-label override. Writing them here too would race with it.



  useEffect(() => {
    if (typeof document === "undefined" || !brand.faviconUrl) return;
    let link = document.getElementById(FAVICON_ID) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = FAVICON_ID;
      link.rel = "icon";
      document.head.appendChild(link);
    }
    if (link.href !== brand.faviconUrl) link.href = brand.faviconUrl;
  }, [brand.faviconUrl]);

  return null;
}
