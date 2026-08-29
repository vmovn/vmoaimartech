import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Link2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FAQ_CATEGORIES, LANDING_FAQS, type Faq } from "@/lib/marketing/landing-content";

/**
 * Searchable, filterable FAQ with accordion rows and per-question anchors.
 *
 * - typing filters across question + answer text
 * - category chips narrow the list
 * - every row owns a `#faq-<id>` anchor: landing on one opens and scrolls to it,
 *   and the link button copies the deep link
 */
export function FaqSection() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const f of LANDING_FAQS) map[f.category] = (map[f.category] ?? 0) + 1;
    return map;
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LANDING_FAQS.filter((f) => {
      if (category !== "all" && f.category !== category) return false;
      if (!q) return true;
      return `${f.q} ${f.a}`.toLowerCase().includes(q);
    });
  }, [query, category]);

  // Deep link support: /#faq-<id> opens the matching question.
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash.startsWith("faq-")) return;
      const id = hash.slice(4);
      if (!LANDING_FAQS.some((f) => f.id === id)) return;
      setQuery("");
      setCategory("all");
      setOpen(id);
      window.requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  const copyLink = useCallback(async (id: string) => {
    const url = `${window.location.origin}${window.location.pathname}#faq-${id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard can be blocked; the hash update below still gives a shareable URL.
    }
    window.history.replaceState(null, "", `#faq-${id}`);
    setCopied(id);
    window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
  }, []);

  return (
    <section id="faq" className="section-marketing bg-surface" ref={containerRef}>
      <div className="container-marketing grid gap-12 lg:grid-cols-3">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <span className="text-marketing-eyebrow">FAQ</span>
          <h2 className="text-marketing-title mt-2">Answers before you ask.</h2>
          <p className="text-marketing-lede mt-4">
            Search {LANDING_FAQS.length} answers or filter by topic. Still curious? The full developer
            documentation covers every module in depth.
          </p>

          <div className="relative mt-6">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search questions…"
              aria-label="Search frequently asked questions"
              className="pl-9 pr-9"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <CategoryChip
              active={category === "all"}
              onClick={() => setCategory("all")}
              label="All"
              count={LANDING_FAQS.length}
            />
            {FAQ_CATEGORIES.map((c) => (
              <CategoryChip
                key={c.id}
                active={category === c.id}
                onClick={() => setCategory(category === c.id ? "all" : c.id)}
                label={c.label}
                count={counts[c.id] ?? 0}
              />
            ))}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="divide-y divide-border border-y border-border">
            {results.map((f) => (
              <FaqRow
                key={f.id}
                faq={f}
                open={open === f.id}
                copied={copied === f.id}
                onToggle={() => setOpen(open === f.id ? null : f.id)}
                onCopy={() => copyLink(f.id)}
                query={query}
              />
            ))}
          </div>

          {results.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-10 text-center">
              <p className="font-display font-semibold text-foreground">No answers match “{query}”.</p>
              <p className="text-marketing-card-body mt-2">
                Try a different keyword, or reach out and we'll answer directly.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setQuery("");
                  setCategory("all");
                }}
              >
                Reset filters
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function CategoryChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {label}
      <span className={cn("tabular-nums", active ? "opacity-80" : "opacity-60")}>{count}</span>
    </button>
  );
}

function FaqRow({
  faq,
  open,
  copied,
  onToggle,
  onCopy,
  query,
}: {
  faq: Faq;
  open: boolean;
  copied: boolean;
  onToggle: () => void;
  onCopy: () => void;
  query: string;
}) {
  const categoryLabel = FAQ_CATEGORIES.find((c) => c.id === faq.category)?.label ?? faq.category;
  return (
    <div id={`faq-${faq.id}`} className="scroll-mt-28 py-5">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`faq-panel-${faq.id}`}
          className="flex flex-1 items-center justify-between gap-4 text-left"
        >
          <span className="font-display font-semibold text-foreground">
            <Highlight text={faq.q} query={query} />
          </span>
          <span
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-transform",
              open && "rotate-45",
            )}
          >
            +
          </span>
        </button>
        <button
          type="button"
          onClick={onCopy}
          aria-label={`Copy link to “${faq.q}”`}
          title="Copy link to this answer"
          className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {copied ? <Check className="size-3.5 text-primary" /> : <Link2 className="size-3.5" />}
        </button>
      </div>

      {open && (
        <div id={`faq-panel-${faq.id}`} className="mt-3 pr-10">
          <p className="text-marketing-card-body">
            <Highlight text={faq.a} query={query} />
          </p>
          <span className="mt-3 inline-flex rounded-full border border-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            {categoryLabel}
          </span>
        </div>
      )}
    </div>
  );
}

/** Highlights the active search term inside a string. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-primary/15 text-foreground">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}
