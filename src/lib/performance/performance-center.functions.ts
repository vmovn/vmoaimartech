import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PerfRecommendation = {
  id: string;
  category:
    | "lazy-loading"
    | "code-splitting"
    | "images"
    | "caching"
    | "database"
    | "realtime"
    | "virtualization"
    | "pagination"
    | "background-jobs"
    | "queues"
    | "api"
    | "bundle"
    | "memory"
    | "cwv";
  title: string;
  detail: string;
  severity: "critical" | "warning" | "info" | "ok";
  impact: "high" | "medium" | "low";
};

export type PerfSnapshot = {
  score: number;
  cwv: {
    lcp: number; // seconds
    cls: number;
    inp: number; // ms
    ttfb: number; // ms
    fid: number; // ms
  };
  bundle: {
    initialKb: number;
    totalKb: number;
    largestChunkKb: number;
    codeSplitRatio: number; // 0..1
  };
  runtime: {
    memoryMb: number;
    longTasks: number;
    cacheHitRate: number;
    apiP95Ms: number;
    dbP95Ms: number;
  };
  realtime: {
    channels: number;
    subscribers: number;
    droppedMessages: number;
  };
  queues: {
    depth: number;
    processedPerMin: number;
    failureRate: number;
  };
  recommendations: PerfRecommendation[];
  generatedAt: string;
};

function scoreFrom(snap: Omit<PerfSnapshot, "score" | "recommendations" | "generatedAt">): number {
  let s = 100;
  if (snap.cwv.lcp > 2.5) s -= 12;
  if (snap.cwv.lcp > 4) s -= 8;
  if (snap.cwv.cls > 0.1) s -= 8;
  if (snap.cwv.inp > 200) s -= 10;
  if (snap.cwv.ttfb > 800) s -= 6;
  if (snap.bundle.initialKb > 250) s -= 10;
  if (snap.bundle.largestChunkKb > 500) s -= 6;
  if (snap.runtime.cacheHitRate < 0.7) s -= 6;
  if (snap.runtime.apiP95Ms > 500) s -= 6;
  if (snap.runtime.dbP95Ms > 200) s -= 6;
  if (snap.queues.failureRate > 0.02) s -= 4;
  if (snap.runtime.memoryMb > 512) s -= 4;
  return Math.max(0, Math.min(100, Math.round(s)));
}

function buildRecommendations(
  snap: Omit<PerfSnapshot, "score" | "recommendations" | "generatedAt">,
): PerfRecommendation[] {
  const recs: PerfRecommendation[] = [];
  const push = (r: PerfRecommendation) => recs.push(r);

  // CWV
  push({
    id: "cwv-lcp",
    category: "cwv",
    title: `LCP ${snap.cwv.lcp.toFixed(2)}s`,
    detail:
      snap.cwv.lcp <= 2.5
        ? "Excellent LCP — preload hero image, keep critical CSS inlined."
        : "Preload the LCP image with `<link rel=preload as=image fetchpriority=high>` in the leaf route head, ship AVIF/WebP variants, and defer non-critical scripts.",
    severity: snap.cwv.lcp <= 2.5 ? "ok" : snap.cwv.lcp <= 4 ? "warning" : "critical",
    impact: "high",
  });
  push({
    id: "cwv-inp",
    category: "cwv",
    title: `INP ${Math.round(snap.cwv.inp)}ms`,
    detail:
      snap.cwv.inp <= 200
        ? "Interaction latency is within target."
        : "Break up long tasks with `startTransition`, debounce input handlers, and move heavy work to Web Workers or server functions.",
    severity: snap.cwv.inp <= 200 ? "ok" : snap.cwv.inp <= 500 ? "warning" : "critical",
    impact: "high",
  });
  push({
    id: "cwv-cls",
    category: "cwv",
    title: `CLS ${snap.cwv.cls.toFixed(3)}`,
    detail:
      snap.cwv.cls <= 0.1
        ? "Layout shift is minimal."
        : "Reserve dimensions for media, avoid injecting above-the-fold banners, and use `font-display: optional` for custom fonts.",
    severity: snap.cwv.cls <= 0.1 ? "ok" : "warning",
    impact: "medium",
  });

  // Lazy loading & code splitting
  push({
    id: "lazy-routes",
    category: "lazy-loading",
    title: "Route-level code splitting",
    detail:
      "TanStack Start auto-splits route components. Keep loaders in the critical chunk, move heavy panels behind `React.lazy` + `<Suspense>`, and preload on hover with `<Link preload=\"intent\">`.",
    severity: "info",
    impact: "high",
  });
  push({
    id: "component-split",
    category: "code-splitting",
    title: "Component splitting",
    detail:
      "Split rich editors, chart libraries, PDF renderers, and emoji pickers into dynamic imports. Never import them at module scope in `__root.tsx`.",
    severity: snap.bundle.largestChunkKb > 500 ? "warning" : "info",
    impact: "high",
  });

  // Images
  push({
    id: "img-formats",
    category: "images",
    title: "Image optimization",
    detail:
      "Use `vite-imagetools` for bundled images (AVIF/WebP variants), lazy-load below-the-fold with `loading=\"lazy\" decoding=\"async\"`, and route dynamic images through Cloudflare Image Resizing.",
    severity: "info",
    impact: "medium",
  });

  // Caching
  push({
    id: "cache-hit",
    category: "caching",
    title: `Cache hit rate ${(snap.runtime.cacheHitRate * 100).toFixed(0)}%`,
    detail:
      snap.runtime.cacheHitRate >= 0.85
        ? "Cache utilization is healthy."
        : "Increase TanStack Query `staleTime` for read-heavy queries, enable HTTP cache headers on `/api/public/*`, and use Cloudflare edge caching for public GETs.",
    severity: snap.runtime.cacheHitRate >= 0.7 ? "info" : "warning",
    impact: "high",
  });

  // Database
  push({
    id: "db-indexes",
    category: "database",
    title: `DB p95 ${Math.round(snap.runtime.dbP95Ms)}ms`,
    detail:
      "Ensure indexes on `tenant_id`, `created_at`, `conversation_id`, `assignee_id`, and foreign keys used by RLS. Use `pg_stat_statements` to hunt regressions.",
    severity: snap.runtime.dbP95Ms <= 200 ? "ok" : "warning",
    impact: "high",
  });

  // Realtime
  push({
    id: "rt-channels",
    category: "realtime",
    title: `Realtime channels ${snap.realtime.channels}`,
    detail:
      "Consolidate per-row channels into per-conversation or per-tenant channels, tear down on unmount, and gate high-fanout events through server-side filters.",
    severity: snap.realtime.channels > 500 ? "warning" : "info",
    impact: "medium",
  });

  // Virtualization
  push({
    id: "virt-tables",
    category: "virtualization",
    title: "Virtualized tables",
    detail:
      "Use `@tanstack/react-virtual` for inbox lists, contacts, activities, and audit logs — render only visible rows.",
    severity: "info",
    impact: "high",
  });

  // Pagination / infinite scroll
  push({
    id: "infinite-scroll",
    category: "pagination",
    title: "Infinite scroll",
    detail:
      "Prefer `useInfiniteQuery` with keyset pagination (`created_at < cursor`) over `offset` — stable and O(log n).",
    severity: "info",
    impact: "medium",
  });

  // Background jobs / queues
  push({
    id: "bg-jobs",
    category: "background-jobs",
    title: `Queue depth ${snap.queues.depth}`,
    detail:
      snap.queues.depth < 1000
        ? "Queues drained healthily."
        : "Scale worker concurrency, batch dispatch, and add priority lanes for interactive vs. bulk work.",
    severity: snap.queues.depth < 5000 ? "info" : "warning",
    impact: "high",
  });
  push({
    id: "queue-fail",
    category: "queues",
    title: `Queue failure rate ${(snap.queues.failureRate * 100).toFixed(2)}%`,
    detail:
      "Add exponential backoff, dead-letter isolation, and idempotency keys for provider webhooks.",
    severity: snap.queues.failureRate > 0.02 ? "warning" : "ok",
    impact: "medium",
  });

  // API
  push({
    id: "api-p95",
    category: "api",
    title: `API p95 ${Math.round(snap.runtime.apiP95Ms)}ms`,
    detail:
      "Batch server functions where possible, project only needed columns, and stream long responses.",
    severity: snap.runtime.apiP95Ms <= 500 ? "ok" : "warning",
    impact: "high",
  });

  // Bundle
  push({
    id: "bundle-size",
    category: "bundle",
    title: `Initial bundle ${snap.bundle.initialKb}KB`,
    detail:
      "Target < 200KB gz for the initial route. Audit with `vite build --report`, drop moment/lodash-full for `date-fns`/`lodash-es`, and tree-shake icon libraries.",
    severity: snap.bundle.initialKb <= 250 ? "ok" : "warning",
    impact: "high",
  });

  // Memory
  push({
    id: "memory",
    category: "memory",
    title: `Client memory ${snap.runtime.memoryMb}MB`,
    detail:
      "Detach event listeners in `useEffect` cleanup, cap in-memory caches, and avoid retaining large blobs after upload.",
    severity: snap.runtime.memoryMb > 512 ? "warning" : "ok",
    impact: "medium",
  });

  return recs;
}

export const getPerformanceSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<PerfSnapshot> => {
    // Synthetic-but-realistic metrics. Real integrations (RUM, pg_stat_statements,
    // queue tables) can back these later — the shape is stable.
    const base = {
      cwv: { lcp: 1.9, cls: 0.04, inp: 148, ttfb: 320, fid: 22 },
      bundle: { initialKb: 218, totalKb: 1_860, largestChunkKb: 412, codeSplitRatio: 0.78 },
      runtime: {
        memoryMb: 236,
        longTasks: 4,
        cacheHitRate: 0.86,
        apiP95Ms: 312,
        dbP95Ms: 118,
      },
      realtime: { channels: 214, subscribers: 1_420, droppedMessages: 0 },
      queues: { depth: 42, processedPerMin: 1_240, failureRate: 0.004 },
    };
    const score = scoreFrom(base);
    const recommendations = buildRecommendations(base);
    return { ...base, score, recommendations, generatedAt: new Date().toISOString() };
  });
