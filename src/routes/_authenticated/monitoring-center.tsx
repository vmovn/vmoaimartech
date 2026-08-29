import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Activity, Database, Radio, Workflow, Webhook, Server, Sparkles, MessageSquare,
  HardDrive, Cpu, AlertTriangle, XCircle, CheckCircle2, Bell, ScrollText,
  Waypoints, LineChart, PlugZap, RefreshCcw,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

import {
  getMonitoringSnapshot,
  type HealthCheck,
  type HealthStatus,
} from "@/lib/monitoring/monitoring-center.functions";

export const Route = createFileRoute("/_authenticated/monitoring-center")({
  head: () => ({
    meta: [
      { title: "Monitoring Center" },
      { name: "description", content: "Enterprise monitoring for application, database, realtime, queues, webhooks, APIs, AI, WhatsApp, storage, and workers." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MonitoringCenter,
});

const DOMAIN_ICON: Record<HealthCheck["id"], typeof Activity> = {
  application: Activity,
  database: Database,
  realtime: Radio,
  queue: Workflow,
  webhook: Webhook,
  api: Server,
  "ai-provider": Sparkles,
  "whatsapp-provider": MessageSquare,
  storage: HardDrive,
  worker: Cpu,
};

function statusColor(s: HealthStatus) {
  if (s === "healthy") return "text-emerald-500";
  if (s === "degraded") return "text-amber-500";
  if (s === "down") return "text-red-500";
  return "text-muted-foreground";
}
function statusDot(s: HealthStatus) {
  if (s === "healthy") return "bg-emerald-500";
  if (s === "degraded") return "bg-amber-500";
  if (s === "down") return "bg-red-500";
  return "bg-muted-foreground";
}

function MonitoringCenter() {
  const fetchSnap = useServerFn(getMonitoringSnapshot);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["monitoring-snapshot"],
    queryFn: () => fetchSnap(),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const [logFilter, setLogFilter] = useState("");
  const filteredLogs = useMemo(() => {
    if (!data) return [];
    const q = logFilter.trim().toLowerCase();
    return q ? data.logs.filter((l) => l.message.toLowerCase().includes(q) || l.service.includes(q)) : data.logs;
  }, [data, logFilter]);

  return (
    <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6" /> Monitoring Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time health across every subsystem, plus error tracking, tracing, logs, metrics, and alerts.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCcw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </header>

      {isLoading || !data ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">Loading monitoring snapshot…</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Overall status</CardDescription>
                <CardTitle className={`text-2xl capitalize ${statusColor(data.overallStatus)}`}>
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusDot(data.overallStatus)}`} />
                  {data.overallStatus}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Progress value={data.healthScore} className="h-2" />
                <p className="text-xs text-muted-foreground mt-2">Health score {data.healthScore}/100</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Requests / min</CardDescription>
                <CardTitle className="text-3xl">{data.metrics.requestsPerMin.toLocaleString()}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                p50 {data.metrics.p50Ms}ms · p95 {data.metrics.p95Ms}ms · p99 {data.metrics.p99Ms}ms
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Error rate</CardDescription>
                <CardTitle className="text-3xl">{(data.metrics.errorRate * 100).toFixed(2)}%</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Active users {data.metrics.activeUsers.toLocaleString()}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Alerts</CardDescription>
                <CardTitle className="text-3xl">{data.alerts.filter((a) => a.enabled).length}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {data.alerts.reduce((n, a) => n + a.triggeredCount, 0)} triggered · last 30d
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="health">
            <TabsList>
              <TabsTrigger value="health">Health Checks</TabsTrigger>
              <TabsTrigger value="errors">Errors</TabsTrigger>
              <TabsTrigger value="traces">Traces</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
              <TabsTrigger value="metrics">Metrics</TabsTrigger>
              <TabsTrigger value="alerts">Alerts</TabsTrigger>
              <TabsTrigger value="providers">Providers</TabsTrigger>
            </TabsList>

            <TabsContent value="health" className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.checks.map((c) => {
                const Icon = DOMAIN_ICON[c.id];
                return (
                  <Card key={c.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Icon className="h-4 w-4" /> {c.label}
                        </CardTitle>
                        <span className={`inline-flex items-center gap-1.5 text-xs capitalize ${statusColor(c.status)}`}>
                          <span className={`h-2 w-2 rounded-full ${statusDot(c.status)}`} />
                          {c.status}
                        </span>
                      </div>
                      <CardDescription>{c.detail}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-4 gap-2 text-xs">
                      <div><div className="text-muted-foreground">Uptime</div><div className="font-medium">{c.uptimePct.toFixed(2)}%</div></div>
                      <div><div className="text-muted-foreground">Latency</div><div className="font-medium">{c.latencyMs}ms</div></div>
                      <div><div className="text-muted-foreground">Errors</div><div className="font-medium">{(c.errorRate * 100).toFixed(2)}%</div></div>
                      {c.metrics.slice(0, 1).map((m) => (
                        <div key={m.label}><div className="text-muted-foreground">{m.label}</div><div className="font-medium">{m.value}</div></div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>

            <TabsContent value="errors" className="mt-4 space-y-3">
              {data.errors.map((e) => (
                <Card key={e.id}>
                  <CardContent className="p-4 flex items-start gap-3">
                    {e.level === "warning" ? (
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="font-medium text-sm truncate">{e.message}</span>
                        <Badge variant="outline" className="text-[11px]">{e.service}</Badge>
                        <Badge variant="secondary" className="text-[11px]">×{e.count}</Badge>
                      </div>
                      {e.stack && <pre className="text-xs text-muted-foreground mt-1">{e.stack}</pre>}
                      <p className="text-xs text-muted-foreground mt-1">
                        Last seen {formatDistanceToNow(new Date(e.lastSeen), { addSuffix: true })}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="traces" className="mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><Waypoints className="h-4 w-4" /> Recent traces</CardTitle>
                  <CardDescription>OpenTelemetry-compatible sample traces.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.traces.map((t) => (
                    <div key={t.traceId} className="flex items-center justify-between p-2 border rounded-md text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`h-2 w-2 rounded-full ${t.status === "ok" ? "bg-emerald-500" : "bg-red-500"}`} />
                        <span className="font-mono text-xs text-muted-foreground">{t.traceId}</span>
                        <span className="font-medium truncate">{t.name}</span>
                        <Badge variant="outline" className="text-[11px]">{t.service}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0 flex gap-3">
                        <span>{t.spans} spans</span>
                        <span className="font-medium">{t.durationMs}ms</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="logs" className="mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><ScrollText className="h-4 w-4" /> Log viewer</CardTitle>
                  <div className="pt-2">
                    <Input placeholder="Filter by message or service…" value={logFilter} onChange={(e) => setLogFilter(e.target.value)} />
                  </div>
                </CardHeader>
                <CardContent className="font-mono text-xs space-y-1 max-h-[420px] overflow-auto">
                  {filteredLogs.map((l, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-muted-foreground shrink-0">{new Date(l.ts).toLocaleTimeString()}</span>
                      <Badge
                        variant="outline"
                        className={`text-[11px] ${l.level === "error" ? "border-red-500 text-red-500" : l.level === "warn" ? "border-amber-500 text-amber-500" : ""}`}
                      >{l.level}</Badge>
                      <span className="text-muted-foreground shrink-0">{l.service}</span>
                      <span className="truncate">{l.message}</span>
                    </div>
                  ))}
                  {filteredLogs.length === 0 && <div className="text-muted-foreground">No logs match filter.</div>}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="metrics" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><LineChart className="h-4 w-4" /> Metrics</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Metric label="Req/min" value={data.metrics.requestsPerMin.toLocaleString()} />
                  <Metric label="p50" value={`${data.metrics.p50Ms}ms`} />
                  <Metric label="p95" value={`${data.metrics.p95Ms}ms`} />
                  <Metric label="p99" value={`${data.metrics.p99Ms}ms`} />
                  <Metric label="Error rate" value={`${(data.metrics.errorRate * 100).toFixed(2)}%`} />
                  <Metric label="Active users" value={data.metrics.activeUsers.toLocaleString()} />
                  <Metric label="Health score" value={`${data.healthScore}/100`} />
                  <Metric label="Uptime" value="99.97%" />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="alerts" className="mt-4 space-y-3">
              {data.alerts.map((a) => (
                <Card key={a.id}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <Bell className={`h-4 w-4 ${a.severity === "critical" ? "text-red-500" : a.severity === "warning" ? "text-amber-500" : "text-blue-500"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{a.name}</span>
                        <Badge variant="outline" className="text-[11px]">{a.domain}</Badge>
                        <Badge variant="secondary" className="text-[11px] capitalize">{a.severity}</Badge>
                        <Badge variant="outline" className="text-[11px]">{a.channel}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{a.condition}</p>
                    </div>
                    <div className="text-xs text-muted-foreground text-right shrink-0">
                      {a.lastTriggeredAt ? (
                        <>Last fired {formatDistanceToNow(new Date(a.lastTriggeredAt), { addSuffix: true })}</>
                      ) : (
                        <span className="text-emerald-500 inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Clear</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="providers" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><PlugZap className="h-4 w-4" /> External monitoring providers</CardTitle>
                  <CardDescription>Connect a third-party observability provider. Adapters use a shared provider abstraction so new backends can be added without app-code changes.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {data.providers.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-3 border rounded-md">
                      <div>
                        <div className="font-medium text-sm">{p.label}</div>
                        <div className="text-xs text-muted-foreground capitalize">{p.kind}</div>
                      </div>
                      <Badge variant={p.connected ? "default" : "outline"}>
                        {p.connected ? "Connected" : "Not connected"}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <p className="text-xs text-muted-foreground text-right">
            Generated {new Date(data.generatedAt).toLocaleString()}
          </p>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-md border">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
