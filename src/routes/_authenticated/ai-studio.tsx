import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { Sparkles, MessageSquare, FileText, Bot, Megaphone } from "lucide-react";
import { useBrandName } from "@/hooks/use-brand-name";

export const Route = createFileRoute("/_authenticated/ai-studio")({
  component: AIStudioPage,
});

const tools = [
  { icon: MessageSquare, title: "Reply suggestions", desc: "Context-aware reply drafting inside every conversation.", cta: "Configure model" },
  { icon: FileText, title: "Auto-summarize threads", desc: "Instant summary + sentiment on any conversation.", cta: "Run on inbox" },
  { icon: Bot, title: "AI chatbot", desc: "24/7 auto-responder with tools + knowledge base grounding.", cta: "Open builder" },
  { icon: Megaphone, title: "Campaign copy generator", desc: "Generate on-brand broadcast copy from a short brief.", cta: "Try it" },
];

function AIStudioPage() {
  const brandName = useBrandName();
  return (
    <>
      <AppTopbar title="AI Studio" subtitle={`${brandName} AI · Premium Credits or workspace BYOK`} />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="rounded-2xl border border-accent/30 bg-gradient-hero text-primary-foreground p-8 shadow-elegant relative overflow-hidden">
          <div className="max-w-2xl relative z-10">
            <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-accent-foreground/90 bg-accent/25 rounded-sm px-3 py-1 backdrop-blur-sm">
              <Sparkles className="w-3 h-3" /> {brandName} AI
            </span>
            <h2 className="mt-4 font-bold text-white">Automate replies, summarize threads, and generate campaigns — all inside your CRM.</h2>
            <p className="mt-3 text-sm text-primary-foreground/80 max-w-lg">Four production-ready AI features, tuned for WhatsApp conversations. Use PM.ai.vn Premium Credits or connect your own provider.</p>
          </div>
          <div className="absolute -right-16 -bottom-16 w-72 h-72 rounded-full bg-accent/40 blur-3xl" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tools.map((t) => (
            <div key={t.title} className="rounded-xl border border-border bg-surface p-5 shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-accent/10 text-accent grid place-items-center"><t.icon className="w-4 h-4" /></div>
              <h3 className="mt-4 font-display font-semibold">{t.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t.desc}</p>
              <button className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90">
                {t.cta}
              </button>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
