import { Brand } from "@/components/brand";
import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/app/marketing-shell";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About" },
      { name: "description", content: "is built by a distributed team on a mission to make WhatsApp a first-class CRM channel for every business." },
      { property: "og:title", content: `About ${BRAND_NAME}` },
      { property: "og:description", content: "Our mission: make WhatsApp a first-class CRM channel for every business." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <MarketingShell>
      <section className="max-w-3xl mx-auto px-4 py-20">
        <span className="text-xs uppercase tracking-widest text-accent font-medium">About</span>
        <h1 className="mt-2 font-display text-4xl lg:text-5xl font-semibold text-balance">The WhatsApp CRM built for the next billion conversations.</h1>
        <div className="mt-8 space-y-6 text-muted-foreground leading-relaxed">
          <p><Brand /> started with a simple observation: for most of the world, WhatsApp <em>is</em> the customer channel. Yet the tools teams use to manage it are stuck a decade behind email. We're changing that.</p>
          <p>We're a distributed team of engineers, designers, and operators who've built and scaled communication products at companies like Meta, Twilio, Zendesk and HubSpot. We ship weekly and self-host our own stack.</p>
          <p>Our principles: enterprise architecture from day one, honest pricing, no per-seat tax, and every customer owns their data — on our cloud or yours.</p>
        </div>
      </section>
    </MarketingShell>
  );
}
