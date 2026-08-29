import { Link } from "@tanstack/react-router";
import DOMPurify from "dompurify";
import { HeaderSlot } from "@/lib/layout/header-height";
import { useTenantBrand } from "@/hooks/use-tenant-brand";
import { usePlatformBranding } from "@/hooks/use-platform-branding";
import { APP_VERSION_LABEL } from "@/lib/app-version";
import { docsUrl } from "@/lib/docs/links";

const footerLinkClass =
  "rounded-sm px-1 -mx-1 text-white/80 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black";

export function AppFooter() {
  const year = new Date().getFullYear();
  const brand = useTenantBrand();
  const platform = usePlatformBranding();
  return (
    <HeaderSlot
      as="footer"
      border="top"
      tone="surface"
      role="contentinfo"
      aria-label="Application footer"
      className="bg-black text-white border-white/10"
    >

      <div className="flex w-full items-center justify-between gap-4 text-sm text-white/80">
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="flex min-w-0 items-center gap-2"
        >
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-success animate-pulse"
            aria-hidden="true"
          />
          <span className="truncate">All systems operational</span>
          <span className="opacity-40 hidden sm:inline" aria-hidden="true">·</span>
          <span className="hidden sm:inline">{brand.name} · {APP_VERSION_LABEL}</span>
        </div>
        <nav
          aria-label="Footer navigation"
          className="hidden sm:flex items-center gap-x-4 whitespace-nowrap"
        >
          <Link to="/settings" className={footerLinkClass}>
            Settings
          </Link>
          <a
            href={docsUrl()}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Documentation (opens in a new tab)"
            className={`${footerLinkClass} hidden md:inline`}
          >
            Docs
          </a>
          <a
            href={docsUrl("changelog")}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Changelog (opens in a new tab)"
            className={`${footerLinkClass} hidden md:inline`}
          >
            Changelog
          </a>
          <a
            href={docsUrl("status")}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="System status (opens in a new tab)"
            className={`${footerLinkClass} hidden lg:inline`}
          >
            Status
          </a>
          <a
            href={docsUrl("support")}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Support (opens in a new tab)"
            className={`${footerLinkClass} hidden lg:inline`}
          >
            Support
          </a>
          {platform.supportEmail && (
            <a
              href={`mailto:${platform.supportEmail}`}
              className={`${footerLinkClass} hidden lg:inline`}
              aria-label={`Email support at ${platform.supportEmail}`}
            >
              Contact
            </a>
          )}
          {platform.footerHtml && (
            <span
              className="hidden lg:inline text-white/60 [&_a]:underline hover:[&_a]:text-white"
              // Allow-list sanitized server-side, then sanitized again here on render.
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(platform.footerHtml, {
                  ALLOWED_TAGS: ["a", "span", "b", "strong", "i", "em", "u", "small", "br", "p"],
                  ALLOWED_ATTR: ["href", "target", "rel", "title"],
                }),
              }}
            />
          )}
          <span className="text-white/60">&copy; {year} {brand.name}</span>
        </nav>
        <span className="sm:hidden text-white/60">&copy; {year} {brand.name}</span>

      </div>
    </HeaderSlot>
  );
}
