import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type HealthStatus = "healthy" | "degraded" | "down" | "unknown";

export type HealthDomain =
  | "application"
  | "database"
  | "realtime"
  | "queue"
  | "webhook"
  | "api"
  | "ai-provider"
  | "whatsapp-provider"
  | "storage"
  | "worker";

export type HealthCheck = {
  id: HealthDomain;
  label: string;
  status: HealthStatus;
  uptimePct: number; // 0..100
  latencyMs: number;
  errorRate: number; // 0..1
  detail: string;
  metrics: { label: string; value: string }[];
};

export type ErrorEvent = {
  id: string;
  message: string;
  service: string;
  level: "error" | "warning" | "fatal";
  count: number;
  firstSeen: string;
  lastSeen: string;
  stack?: string;
};

export type TraceSpan = {
  traceId: string;
  name: string;
  service: string;
  durationMs: number;
  startedAt: string;
  status: "ok" | "error";
  spans: number;
};

export type LogEntry = {
  ts: string;
  level: "debug" | "info" | "warn" | "error";
  service: string;
  message: string;
};

export type AlertRule = {
  id: string;
  name: string;
  domain: HealthDomain | "custom";
  condition: string;
  severity: "critical" | "warning" | "info";
  channel: "email" | "slack" | "webhook" | "pagerduty";
  enabled: boolean;
  triggeredCount: number;
  lastTriggeredAt: string | null;
};

export type MonitoringSnapshot = {
  generatedAt: string;
  overallStatus: HealthStatus;
  healthScore: number;
  checks: HealthCheck[];
  errors: ErrorEvent[];
  traces: TraceSpan[];
  logs: LogEntry[];
  alerts: AlertRule[];
  metrics: {
    requestsPerMin: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    errorRate: number;
    activeUsers: number;
  };
  providers: {
    id: string;
    label: string;
    kind: "monitoring" | "logging" | "tracing" | "alerting";
    connected: boolean;
  }[];
};

function synthChecks(): HealthCheck[] {
  return [
    {
      id: "application",
      label: "Application",
      status: "healthy",
      uptimePct: 99.98,
      latencyMs: 142,
      errorRate: 0.002,
      detail: "SSR + client bundle healthy.",
      metrics: [
        { label: "Uptime 30d", value: "99.98%" },
        { label: "Deploys 24h", value: "3" },
      ],
    },
    {
      id: "database",
      label: "Database",
      status: "healthy",
      uptimePct: 99.99,
      latencyMs: 32,
      errorRate: 0.0,
      detail: "PgBouncer 34% saturation, no deadlocks.",
      metrics: [
        { label: "Connections", value: "34/100" },
        { label: "WAL", value: "142MB" },
      ],
    },
    {
      id: "realtime",
      label: "Realtime",
      status: "healthy",
      uptimePct: 99.95,
      latencyMs: 84,
      errorRate: 0.001,
      detail: "214 channels, 1,420 subscribers.",
      metrics: [
        { label: "Channels", value: "214" },
        { label: "Subscribers", value: "1,420" },
      ],
    },
    {
      id: "queue",
      label: "Queues",
      status: "healthy",
      uptimePct: 99.9,
      latencyMs: 210,
      errorRate: 0.004,
      detail: "Depth 42, throughput 1.24k/min.",
      metrics: [
        { label: "Depth", value: "42" },
        { label: "Failure", value: "0.40%" },
      ],
    },
    {
      id: "webhook",
      label: "Webhooks",
      status: "degraded",
      uptimePct: 99.6,
      latencyMs: 480,
      errorRate: 0.021,
      detail: "Meta webhook retries elevated in last 15m.",
      metrics: [
        { label: "24h delivered", value: "18,204" },
        { label: "Retry rate", value: "2.1%" },
      ],
    },
    {
      id: "api",
      label: "API",
      status: "healthy",
      uptimePct: 99.97,
      latencyMs: 312,
      errorRate: 0.006,
      detail: "REST v1 p95 312ms, gateway limits nominal.",
      metrics: [
        { label: "Req/min", value: "5,420" },
        { label: "5xx", value: "0.6%" },
      ],
    },
    {
      id: "ai-provider",
      label: "AI Providers",
      status: "healthy",
      uptimePct: 99.9,
      latencyMs: 1_140,
      errorRate: 0.008,
      detail: "OpenAI, Gemini, Claude, Lovable AI — all reachable.",
      metrics: [
        { label: "Active providers", value: "4/4" },
        { label: "Tokens 24h", value: "12.4M" },
      ],
    },
    {
      id: "whatsapp-provider",
      label: "WhatsApp Cloud API",
      status: "healthy",
      uptimePct: 99.94,
      latencyMs: 260,
      errorRate: 0.003,
      detail: "Meta Graph API healthy, template sync current.",
      metrics: [
        { label: "Sent 24h", value: "42,180" },
        { label: "Failed", value: "126" },
      ],
    },
    {
      id: "storage",
      label: "Storage",
      status: "healthy",
      uptimePct: 99.99,
      latencyMs: 55,
      errorRate: 0.0,
      detail: "Object storage p95 55ms, 41% capacity.",
      metrics: [
        { label: "Used", value: "412 GB" },
        { label: "Objects", value: "1.82M" },
      ],
    },
    {
      id: "worker",
      label: "Workers",
      status: "healthy",
      uptimePct: 99.95,
      latencyMs: 88,
      errorRate: 0.002,
      detail: "6 workers online, avg CPU 34%.",
      metrics: [
        { label: "Online", value: "6/6" },
        { label: "CPU", value: "34%" },
      ],
    },
  ];
}

function statusRank(s: HealthStatus): number {
  return s === "down" ? 3 : s === "degraded" ? 2 : s === "unknown" ? 1 : 0;
}

export const getMonitoringSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<MonitoringSnapshot> => {
    const checks = synthChecks();
    const worst = checks.reduce<HealthStatus>((acc, c) => (statusRank(c.status) > statusRank(acc) ? c.status : acc), "healthy");
    const healthScore = Math.round(
      checks.reduce((s, c) => s + (c.status === "healthy" ? 100 : c.status === "degraded" ? 70 : c.status === "unknown" ? 60 : 0), 0) /
        checks.length,
    );

    const errors: ErrorEvent[] = [
      {
        id: "e1",
        message: "TypeError: Cannot read properties of undefined (reading 'id')",
        service: "web",
        level: "error",
        count: 14,
        firstSeen: new Date(Date.now() - 3_600_000).toISOString(),
        lastSeen: new Date(Date.now() - 240_000).toISOString(),
        stack: "at CustomerCard (customer-card.tsx:42)",
      },
      {
        id: "e2",
        message: "Meta webhook signature mismatch",
        service: "webhook.meta",
        level: "warning",
        count: 3,
        firstSeen: new Date(Date.now() - 900_000).toISOString(),
        lastSeen: new Date(Date.now() - 60_000).toISOString(),
      },
      {
        id: "e3",
        message: "AI provider rate limit (openai)",
        service: "ai.gateway",
        level: "warning",
        count: 8,
        firstSeen: new Date(Date.now() - 1_800_000).toISOString(),
        lastSeen: new Date(Date.now() - 30_000).toISOString(),
      },
    ];

    const now = Date.now();
    const traces: TraceSpan[] = Array.from({ length: 8 }).map((_, i) => ({
      traceId: `tr_${(now - i * 12000).toString(36)}`,
      name: [
        "POST /api/v1/messages",
        "GET /inbox",
        "workflow.execute",
        "campaign.dispatch",
        "ai.reply.suggest",
        "webhook.meta",
        "GET /contacts",
        "quote.generate",
      ][i],
      service: ["web", "web", "workflow", "marketing", "ai", "webhook", "web", "sales"][i],
      durationMs: 40 + Math.round(Math.random() * 800),
      startedAt: new Date(now - i * 12_000).toISOString(),
      status: i === 4 ? "error" : "ok",
      spans: 3 + Math.round(Math.random() * 12),
    }));

    const logs: LogEntry[] = Array.from({ length: 12 }).map((_, i) => ({
      ts: new Date(now - i * 5_000).toISOString(),
      level: (["info", "info", "warn", "info", "error", "info"] as const)[i % 6],
      service: ["web", "worker", "webhook", "ai", "db", "queue"][i % 6],
      message: [
        "Request completed in 128ms",
        "Worker heartbeat ok",
        "Retrying webhook delivery (attempt 2)",
        "AI provider selected: gemini-2.0",
        "Query exceeded 500ms threshold",
        "Queue drained: campaign_dispatch",
      ][i % 6],
    }));

    const alerts: AlertRule[] = [
      {
        id: "a1",
        name: "API 5xx rate > 2%",
        domain: "api",
        condition: "error_rate > 0.02 for 5m",
        severity: "critical",
        channel: "pagerduty",
        enabled: true,
        triggeredCount: 0,
        lastTriggeredAt: null,
      },
      {
        id: "a2",
        name: "Queue depth > 10k",
        domain: "queue",
        condition: "depth > 10000",
        severity: "warning",
        channel: "slack",
        enabled: true,
        triggeredCount: 2,
        lastTriggeredAt: new Date(now - 3_600_000 * 8).toISOString(),
      },
      {
        id: "a3",
        name: "DB p95 > 250ms",
        domain: "database",
        condition: "p95_latency_ms > 250 for 10m",
        severity: "warning",
        channel: "email",
        enabled: true,
        triggeredCount: 0,
        lastTriggeredAt: null,
      },
      {
        id: "a4",
        name: "Webhook retry rate > 5%",
        domain: "webhook",
        condition: "retry_rate > 0.05",
        severity: "warning",
        channel: "slack",
        enabled: true,
        triggeredCount: 1,
        lastTriggeredAt: new Date(now - 3_600_000 * 26).toISOString(),
      },
      {
        id: "a5",
        name: "AI provider errors spike",
        domain: "ai-provider",
        condition: "error_rate > 0.03 for 5m",
        severity: "critical",
        channel: "pagerduty",
        enabled: true,
        triggeredCount: 0,
        lastTriggeredAt: null,
      },
    ];

    return {
      generatedAt: new Date().toISOString(),
      overallStatus: worst,
      healthScore,
      checks,
      errors,
      traces,
      logs,
      alerts,
      metrics: {
        requestsPerMin: 5_420,
        p50Ms: 84,
        p95Ms: 312,
        p99Ms: 720,
        errorRate: 0.006,
        activeUsers: 1_284,
      },
      providers: [
        { id: "datadog", label: "Datadog", kind: "monitoring", connected: false },
        { id: "sentry", label: "Sentry", kind: "logging", connected: false },
        { id: "grafana", label: "Grafana Cloud", kind: "monitoring", connected: false },
        { id: "newrelic", label: "New Relic", kind: "monitoring", connected: false },
        { id: "otel", label: "OpenTelemetry Collector", kind: "tracing", connected: false },
        { id: "pagerduty", label: "PagerDuty", kind: "alerting", connected: false },
        { id: "opsgenie", label: "Opsgenie", kind: "alerting", connected: false },
      ],
    };
  });
