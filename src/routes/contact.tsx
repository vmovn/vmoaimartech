import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { Mail, MessageCircle, Building2 } from "lucide-react";
import { MarketingShell } from "@/components/app/marketing-shell";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact" },
      { name: "description", content: `Talk to sales, get support, or partner with ${BRAND_NAME}. We reply within one business day.` },
      { property: "og:title", content: `Contact ${BRAND_NAME}` },
      { property: "og:description", content: "Talk to sales, get support, or partner with us." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <MarketingShell>
      <section className="max-w-4xl mx-auto px-4 py-20">
        <span className="text-xs uppercase tracking-widest text-accent font-medium">Contact</span>
        <h1 className="mt-2 font-display text-4xl lg:text-5xl font-semibold text-balance">Let's talk.</h1>
        <p className="mt-4 text-muted-foreground max-w-xl">Pick the channel that fits — we reply within one business day.</p>
        <div className="mt-10 grid md:grid-cols-3 gap-4">
          {[
            { icon: MessageCircle, title: "Support", desc: "Existing customer? File a ticket.", cta: "support@pm.ai.vn" },
            { icon: Building2, title: "Sales", desc: "10+ agents or enterprise use case.", cta: "sales@pm.ai.vn" },
            { icon: Mail, title: "General", desc: "Everything else.", cta: "hello@pm.ai.vn" },
          ].map((c) => (
            <a key={c.title} href={`mailto:${c.cta}`} className="rounded-xl border border-border bg-surface p-6 hover:shadow-md transition">
              <div className="w-10 h-10 rounded-lg bg-accent/10 text-accent grid place-items-center"><c.icon className="w-4 h-4" /></div>
              <h3 className="mt-4 font-display font-semibold">{c.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{c.desc}</p>
              <span className="mt-4 block text-sm font-medium text-accent">{c.cta}</span>
            </a>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
