import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Gauge, Zap, ImageIcon, Database, Radio, List, Infinity as InfinityIcon,
  Workflow, Cpu, HardDrive, Package, Server, CheckCircle2, AlertTriangle,
  XCircle, RefreshCcw, TrendingUp,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppTopbar } from "@/components/app/app-topbar";


import {
  getPerformanceSnapshot,
  type PerfRecommendation,
} from "@/lib/performance/performance-center.functions";

export const Route = createFileRoute("/_authenticated/performance-center")({
  head: () => ({
    meta: [
      { title: "Performance Center" },
      { name: "description", content: `Enterprise performance monitoring, Core Web Vitals, and optimization recommendations for ${BRAND_NAME}.` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PerformanceCenter,
});

const CATEGORY_META: Record<
  PerfRecommendation["category"],
  { label: string; icon: typeof Gauge }
> = {
  "lazy-loading": { label: "Lazy Loading", icon: Zap },
  "code-splitting": { label: "Code Splitting", icon: Package },
  images: { label: "Images", icon: ImageIcon },
  caching: { label: "Caching", icon: HardDrive },
  database: { label: "Database", icon: Database },
  realtime: { label: "Realtime", icon: Radio },
  virtualization: { label: "Virtualization", icon: List },
  pagination: { label: "Infinite Scroll", icon: InfinityIcon },
  "background-jobs": { label: "Background Jobs", icon: Workflow },
  queues: { label: "Queue", icon: Workflow },
  api: { label: "API", icon: Server },
  bundle: { label: "Bundle", icon: Package },
  memory: { label: "Memory", icon: Cpu },
  cwv: { label: "Core Web Vitals", icon: Gauge },
};

function SeverityIcon({ severity }: { severity: PerfRecommendation["severity"] }) {
  if (severity === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (severity === "warning") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (severity === "critical") return <XCircle className="h-4 w-4 text-red-500" />;
  return <TrendingUp className="h-4 w-4 text-blue-500" />;
}

function scoreColor(score: number) {
  if (score >= 90) return "text-emerald-500";
  if (score >= 75) return "text-amber-500";
  return "text-red-500";
}

function PerformanceCenter() {
  const fetchSnap = useServerFn(getPerformanceSnapshot);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["performance-snapshot"],
    queryFn: () => fetchSnap(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const grouped = useMemo(() => {
    if (!data) return new Map<PerfRecommendation["category"], PerfRecommendation[]>();
    const m = new Map<PerfRecommendation["category"], PerfRecommendation[]>();
    for (const r of data.recommendations) {
      const list = m.get(r.category) ?? [];
      list.push(r);
      m.set(r.category, list);
    }
    return m;
  }, [data]);

  return (
    <>
      <AppTopbar
        title="Performance Center"
        subtitle="Core Web Vitals, runtime metrics, and optimization recommendations across the entire platform."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">


      {isLoading || !data ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">Loading snapshot…</CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Performance Score</CardDescription>
                <CardTitle className={`text-4xl ${scoreColor(data.score)}`}>{data.score}</CardTitle>
              </CardHeader>
              <CardContent>
                <Progress value={data.score} className="h-2" />
                <p className="text-xs text-muted-foreground mt-2">
                  Weighted across CWV, bundle, cache, API, DB & queues.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>LCP</CardDescription>
                <CardTitle className="text-3xl">{data.cwv.lcp.toFixed(2)}s</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                INP {Math.round(data.cwv.inp)}ms · CLS {data.cwv.cls.toFixed(3)} · TTFB {Math.round(data.cwv.ttfb)}ms
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Bundle</CardDescription>
                <CardTitle className="text-3xl">{data.bundle.initialKb}KB</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Total {(data.bundle.totalKb / 1024).toFixed(2)}MB · split ratio {(data.bundle.codeSplitRatio * 100).toFixed(0)}%
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Runtime</CardDescription>
                <CardTitle className="text-3xl">{Math.round(data.runtime.apiP95Ms)}ms</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                API p95 · DB p95 {Math.round(data.runtime.dbP95Ms)}ms · cache {(data.runtime.cacheHitRate * 100).toFixed(0)}%
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="recommendations">
            <TabsList>
              <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
              <TabsTrigger value="cwv">Core Web Vitals</TabsTrigger>
              <TabsTrigger value="runtime">Runtime</TabsTrigger>
              <TabsTrigger value="queues">Queues & Realtime</TabsTrigger>
            </TabsList>

            <TabsContent value="recommendations" className="space-y-4 mt-4">
              {Array.from(grouped.entries()).map(([cat, recs]) => {
                const meta = CATEGORY_META[cat];
                const Icon = meta.icon;
                return (
                  <Card key={cat}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Icon className="h-4 w-4" /> {meta.label}
                        <Badge variant="secondary" className="ml-2">{recs.length}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {recs.map((r) => (
                        <div key={r.id} className="flex gap-3 items-start p-3 rounded-md border">
                          <SeverityIcon severity={r.severity} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{r.title}</span>
                              <Badge variant="outline" className="text-[11px] uppercase">
                                {r.impact} impact
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{r.detail}</p>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>

            <TabsContent value="cwv" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Core Web Vitals — targets</CardTitle>
                  <CardDescription>Field metrics vs. Google's "good" thresholds.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <Metric label="LCP" value={`${data.cwv.lcp.toFixed(2)}s`} target="≤ 2.5s" ok={data.cwv.lcp <= 2.5} />
                  <Metric label="INP" value={`${Math.round(data.cwv.inp)}ms`} target="≤ 200ms" ok={data.cwv.inp <= 200} />
                  <Metric label="CLS" value={data.cwv.cls.toFixed(3)} target="≤ 0.1" ok={data.cwv.cls <= 0.1} />
                  <Metric label="TTFB" value={`${Math.round(data.cwv.ttfb)}ms`} target="≤ 800ms" ok={data.cwv.ttfb <= 800} />
                  <Metric label="FID" value={`${Math.round(data.cwv.fid)}ms`} target="≤ 100ms" ok={data.cwv.fid <= 100} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="runtime" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Runtime & Infrastructure</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Metric label="Memory" value={`${data.runtime.memoryMb}MB`} target="≤ 512MB" ok={data.runtime.memoryMb <= 512} />
                  <Metric label="Long tasks" value={`${data.runtime.longTasks}/min`} target="≤ 10" ok={data.runtime.longTasks <= 10} />
                  <Metric label="Cache hit" value={`${(data.runtime.cacheHitRate * 100).toFixed(0)}%`} target="≥ 85%" ok={data.runtime.cacheHitRate >= 0.85} />
                  <Metric label="API p95" value={`${Math.round(data.runtime.apiP95Ms)}ms`} target="≤ 500ms" ok={data.runtime.apiP95Ms <= 500} />
                  <Metric label="DB p95" value={`${Math.round(data.runtime.dbP95Ms)}ms`} target="≤ 200ms" ok={data.runtime.dbP95Ms <= 200} />
                  <Metric label="Bundle (initial)" value={`${data.bundle.initialKb}KB`} target="≤ 250KB" ok={data.bundle.initialKb <= 250} />
                  <Metric label="Largest chunk" value={`${data.bundle.largestChunkKb}KB`} target="≤ 500KB" ok={data.bundle.largestChunkKb <= 500} />
                  <Metric label="Split ratio" value={`${(data.bundle.codeSplitRatio * 100).toFixed(0)}%`} target="≥ 70%" ok={data.bundle.codeSplitRatio >= 0.7} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="queues" className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Queues</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                  <Metric label="Depth" value={String(data.queues.depth)} target="< 5k" ok={data.queues.depth < 5000} />
                  <Metric label="Throughput" value={`${data.queues.processedPerMin}/min`} target="—" ok />
                  <Metric label="Failure rate" value={`${(data.queues.failureRate * 100).toFixed(2)}%`} target="≤ 2%" ok={data.queues.failureRate <= 0.02} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Realtime</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                  <Metric label="Channels" value={String(data.realtime.channels)} target="< 500" ok={data.realtime.channels < 500} />
                  <Metric label="Subscribers" value={String(data.realtime.subscribers)} target="—" ok />
                  <Metric label="Dropped" value={String(data.realtime.droppedMessages)} target="0" ok={data.realtime.droppedMessages === 0} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <p className="text-xs text-muted-foreground text-right">
            Generated {new Date(data.generatedAt).toLocaleString()}
          </p>
        </>
      )}
      </main>
    </>

  );
}

function Metric({ label, value, target, ok }: { label: string; value: string; target: string; ok: boolean }) {
  return (
    <div className="p-3 rounded-md border">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${ok ? "text-emerald-500" : "text-amber-500"}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1">Target {target}</div>
    </div>
  );
}
