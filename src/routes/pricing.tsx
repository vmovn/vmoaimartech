import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Star, Loader2 } from "lucide-react";

import { MarketingShell } from "@/components/app/marketing-shell";
import { PlanComparisonTable } from "@/components/app/marketing/plan-comparison-table";
import {
  CurrentPlanBanner,
  CurrentPlanPill,
  isCurrentPlan,
} from "@/components/app/marketing/current-plan-badge";
import {
  formatPlanPrice,
  isContactSalesPlan,
  monthlyEquivalent,
  planBullets,
  useMyPlanSummary,
  usePublicPlans,
} from "@/lib/billing/public-plans";
import { ctaAttrs, trackMarketing, trackPricingClick } from "@/lib/analytics/events";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing" },
      { name: "description", content: "Simple, transparent pricing for teams of every size. Monthly and yearly plans, plus lifetime Enterprise." },
      { property: "og:title", content: "Pricing" },
      { property: "og:description", content: "Simple, transparent pricing. Monthly or yearly. Cancel anytime." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const {
    plans: visible,
    interval,
    setInterval,
    savingsPct,
    hasYearly,
    maxTrialDays,
    isLoading,
  } = usePublicPlans("month");
  const { subscription } = useMyPlanSummary();



  return (
    <MarketingShell>
      <section className="container-marketing py-20">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-xs uppercase tracking-widest text-accent font-medium">Pricing</span>
          <h1 className="mt-2 font-display text-4xl lg:text-5xl font-semibold">Simple pricing. No per-agent tax.</h1>
          <p className="mt-4 text-muted-foreground">
            Start with a free trial. Upgrade when you're ready. Cancel anytime.
            {maxTrialDays > 0 && ` Paid plans include a ${maxTrialDays}-day free trial.`}
          </p>

          {hasYearly && (
            <div className="mt-6 inline-flex items-center rounded-full border border-border bg-surface p-1 text-sm">
              <button
                type="button"
                aria-pressed={interval === "month"}
                onClick={() => {
                  setInterval("month");
                  trackMarketing("cta_click", { cta_id: "billing-interval", location: "pricing", label: "month" });
                }}
                className={`px-4 py-1.5 rounded-sm transition ${interval === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Monthly
              </button>
              <button
                type="button"
                aria-pressed={interval === "year"}
                onClick={() => {
                  setInterval("year");
                  trackMarketing("cta_click", { cta_id: "billing-interval", location: "pricing", label: "year" });
                }}
                className={`px-4 py-1.5 rounded-sm transition ${interval === "year" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Yearly <span className="ml-1 text-[11px] uppercase tracking-wide text-accent">Save {savingsPct}%</span>
              </button>
            </div>
          )}

          <CurrentPlanBanner subscription={subscription} />
        </div>

        {isLoading ? (
          <div className="mt-16 flex items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading plans…
          </div>
        ) : (
          <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {visible.map((p) => {
              const isCustom = isContactSalesPlan(p);
              const perMonth = monthlyEquivalent(p);
              const current = isCurrentPlan(p.code, subscription);
              return (
                <div
                  key={p.id}
                  className={`relative rounded-2xl p-6 border ${current ? "border-accent ring-2 ring-accent/30 bg-surface" : p.highlight ? "border-accent bg-surface shadow-elegant" : "border-border bg-surface"}`}
                >
                  {p.badge && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] uppercase tracking-widest bg-accent text-accent-foreground px-2 py-0.5 rounded-sm flex items-center gap-1">
                      <Star className="w-3 h-3" /> {p.badge}
                    </span>
                  )}
                  {current && (
                    <div className="mb-2">
                      <CurrentPlanPill subscription={subscription} />
                    </div>
                  )}
                  <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-4xl font-display font-semibold">
                      {p.price_cents === 0 ? "Free" : formatPlanPrice(p.price_cents, p.currency)}
                    </span>
                    {p.price_cents > 0 && p.interval !== "lifetime" && (
                      <span className="text-muted-foreground text-sm">/ {p.interval === "year" ? "year" : "month"}</span>
                    )}
                    {p.interval === "lifetime" && (
                      <span className="text-muted-foreground text-sm">one-time</span>
                    )}
                  </div>
                  {perMonth && (
                    <p className="mt-1 text-xs text-muted-foreground">{perMonth} / month, billed yearly</p>
                  )}
                  {(p.tagline || p.description) && (
                    <p className="mt-2 text-sm text-muted-foreground">{p.tagline ?? p.description}</p>
                  )}
                  {p.trial_days > 0 && !isCustom && (
                    <p className="mt-1 text-xs text-accent">{p.trial_days}-day free trial</p>
                  )}
                  <ul className="mt-5 space-y-2 text-sm">
                    {planBullets(p, 8).map((b) => (
                      <li key={b} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-accent mt-0.5 shrink-0" /> {b}
                      </li>
                    ))}
                  </ul>

                  {isCustom ? (
                    <a
                      href="mailto:sales@pm.ai.vn?subject=Enterprise%20inquiry"
                      {...ctaAttrs(`plan-${p.code}`, "pricing", "pricing_click", p.cta_label ?? "Contact sales")}
                      className="mt-6 w-full inline-flex justify-center px-4 py-2 rounded-md text-sm font-medium border border-border hover:bg-muted"
                    >
                      {p.cta_label ?? "Contact sales"}
                    </a>
                  ) : current ? (
                    <Link
                      to="/billing"
                      className="mt-6 w-full inline-flex justify-center px-4 py-2 rounded-md text-sm font-medium border border-accent text-accent hover:bg-accent/10"
                    >
                      Manage your plan
                    </Link>
                  ) : (
                    <Link
                      to={subscription ? "/billing" : "/auth"}
                      search={{ plan: p.code } as never}

                      onClick={() =>
                        trackPricingClick(p.code, "pricing", {
                          plan_name: p.name,
                          interval: p.interval,
                          price_cents: p.price_cents,
                          currency: p.currency,
                          highlight: p.highlight,
                        })
                      }
                      className={`mt-6 w-full inline-flex justify-center px-4 py-2 rounded-md text-sm font-medium ${p.highlight ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-border hover:bg-muted"}`}
                    >
                      {p.cta_label ?? (p.price_cents === 0 ? "Get started" : "Start free trial")}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!isLoading && <PlanComparisonTable plans={visible} />}



        <p className="mt-10 text-center text-xs text-muted-foreground">
          All prices in USD. Yearly plans billed annually. Need something bigger? <a href="mailto:sales@pm.ai.vn" className="text-accent hover:underline" {...ctaAttrs("talk-to-sales", "pricing-footer")}>Talk to sales</a>.
        </p>
      </section>
    </MarketingShell>
  );
}
