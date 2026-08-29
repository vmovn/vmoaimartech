import { BRAND_NAME } from "@/lib/branding/brand";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/app/marketing-shell";
import { Cookie, FileText, Scale, Shield, ScrollText } from "lucide-react";
import type { ReactNode } from "react";

const legalPages = [
  {
    to: "/legal/privacy-policy",
    label: "Privacy Policy",
    icon: ScrollText,
    description: "How we collect, use, and protect your data.",
  },
  {
    to: "/legal/privacy",
    label: "Privacy (short)",
    icon: Shield,
    description: "Summary of how we handle your data.",
  },
  {
    to: "/legal/terms-of-service",
    label: "Terms of Service",
    icon: FileText,
    description: `The full rules and conditions for using ${BRAND_NAME}.`,
  },
  {
    to: "/legal/terms",
    label: "Terms (short)",
    icon: FileText,
    description: `Summary of the rules for using ${BRAND_NAME}.`,
  },
  {
    to: "/legal/cookie-policy",
    label: "Cookie Policy",
    icon: Cookie,
    description: "How we use cookies and similar technologies.",
  },
  {
    to: "/legal/dpa",
    label: "Data Processing Agreement",
    icon: Scale,
    description: "How we process personal data on your behalf.",
  },
];

const linkBaseClass =
  "group flex items-start gap-3 rounded-lg border border-transparent px-3 py-3 text-sm transition-colors hover:bg-muted hover:border-border";

const linkActiveClass = "bg-muted border-border font-medium text-foreground";

const linkInactiveClass = "text-muted-foreground";

const iconBaseClass = "mt-0.5 h-4 w-4 shrink-0";

const iconActiveClass = "text-foreground";

const iconInactiveClass = "text-muted-foreground group-hover:text-foreground";

export function LegalPageShell({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
}) {
  const matchRoute = useMatchRoute();

  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-start">
          <nav aria-label="Legal" className="md:w-64 md:shrink-0">
            <div className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Legal
            </div>
            <ul className="space-y-1">
              {legalPages.map((page) => {
                const Icon = page.icon;
                const isActive = !!matchRoute({ to: page.to });
                return (
                  <li key={page.to}>
                    <Link
                      to={page.to}
                      className={linkBaseClass}
                      activeProps={{ className: linkActiveClass }}
                      inactiveProps={{ className: linkInactiveClass }}
                      activeOptions={{ exact: true }}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Icon
                        className={`${iconBaseClass} ${isActive ? iconActiveClass : iconInactiveClass}`}
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="leading-tight">{page.label}</span>
                        <span className="text-xs leading-tight text-muted-foreground">
                          {page.description}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <article className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Legal</p>
            <h1 className="font-display text-3xl font-semibold sm:text-4xl">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            <div className="prose prose-slate mt-8 max-w-none dark:prose-invert">{children}</div>
          </article>
        </div>
      </div>
    </MarketingShell>
  );
}
