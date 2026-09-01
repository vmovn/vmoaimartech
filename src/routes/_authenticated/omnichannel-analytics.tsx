import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Funnel, FunnelChart,
  LabelList, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { Download, RefreshCw, Radio } from "lucide-react";

export const Route = createFileRoute("/_authenticated/omnichannel-analytics")({
  component: OmnichannelAnalyticsPage,
});

// ---------- Mock/demo dataset (frontend-only) ----------
const CHANNELS = ["WhatsApp", "Instagram", "Messenger", "Telegram", "Email", "SMS", "Live Chat"] as const;
const CHANNEL_COLORS: Record<string, string> = {
  WhatsApp: "#25D366", Instagram: "#E4405F", Messenger: "#0084FF", Telegram: "#26A5E4",
  Email: "#a67c00", SMS: "#F59E0B", "Live Chat": "#6366F1",
};

function seedSeries(days = 30) {
  const out: Array<Record<string, number | string>> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const row: Record<string, number | string> = { day: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) };
    let total = 0;
    for (const c of CHANNELS) {
      const v = Math.round(80 + Math.random() * 220 + (c === "WhatsApp" ? 220 : 0));
      row[c] = v; total += v;
    }
    row.total = total;
    row.conversations = Math.round(total / 6);
    row.responseSec = Math.round(60 + Math.random() * 240);
    row.resolutionMin = Math.round(15 + Math.random() * 90);
    row.csat = +(4.2 + Math.random() * 0.7).toFixed(2);
    row.aiTokens = Math.round(20_000 + Math.random() * 60_000);
    row.revenue = Math.round(1_500 + Math.random() * 8_500);
    out.push(row);
  }
  return out;
}

const AGENTS = [
  { name: "Sara Kim", handled: 342, avgResp: "1m 44s", csat: 4.9, resolved: 318 },
  { name: "Diego Ruiz", handled: 289, avgResp: "2m 12s", csat: 4.7, resolved: 260 },
  { name: "Amina Yusuf", handled: 271, avgResp: "1m 58s", csat: 4.8, resolved: 251 },
  { name: "Jonas Berg", handled: 244, avgResp: "3m 05s", csat: 4.5, resolved: 210 },
  { name: "Priya Patel", handled: 228, avgResp: "2m 30s", csat: 4.6, resolved: 205 },
];

const FUNNEL = [
  { name: "Visitors", value: 24_500, fill: "#0B090A" },
  { name: "Engaged", value: 12_300, fill: "#4d3800" },
  { name: "Qualified", value: 6_400, fill: "#a67c00" },
  { name: "Opportunity", value: 2_800, fill: "#c99400" },
  { name: "Customer", value: 940, fill: "#ffc933" },
];

const RETENTION = [
  { cohort: "Wk 0", retained: 100 }, { cohort: "Wk 1", retained: 78 },
  { cohort: "Wk 2", retained: 62 }, { cohort: "Wk 3", retained: 54 },
  { cohort: "Wk 4", retained: 49 }, { cohort: "Wk 6", retained: 41 },
  { cohort: "Wk 8", retained: 37 }, { cohort: "Wk 12", retained: 31 },
];

const JOURNEY = [
  { step: "First touch (Instagram)", customers: 4210 },
  { step: "WhatsApp reply", customers: 2870 },
  { step: "Email nurture", customers: 1980 },
  { step: "Live chat session", customers: 1240 },
  { step: "Purchase", customers: 640 },
  { step: "Repeat purchase", customers: 312 },
];

// ---------- Helpers ----------
function toCSV(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}
function downloadCSV(name: string, rows: Array<Record<string, unknown>>) {
  const blob = new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `${name}.csv`; a.click();
  URL.revokeObjectURL(url);
}

const CHART_TOOLTIP = {
  contentStyle: {
    background: "var(--color-surface-elevated)",
    border: "1px solid var(--color-border)",
    borderRadius: 8, fontSize: 12,
  },
} as const;

function KpiCard({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-display font-semibold mt-1">{value}</div>
      {delta && <div className="text-xs text-muted-foreground mt-1">{delta}</div>}
    </div>
  );
}

function Panel({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-display font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ExportBtn({ name, rows }: { name: string; rows: Array<Record<string, unknown>> }) {
  return (
    <Button size="sm" variant="outline" onClick={() => downloadCSV(name, rows)}>
      <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
    </Button>
  );
}

// ---------- Page ----------
function OmnichannelAnalyticsPage() {
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");
  const [series, setSeries] = useState(() => seedSeries(30));
  const [live, setLive] = useState(false);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;

  useEffect(() => {
    setSeries(seedSeries(range === "7d" ? 7 : range === "90d" ? 90 : 30));
  }, [range]);

  // Realtime: subscribe to messages inserts to tick the last data point + banner
  useEffect(() => {
    if (!workspaceId) return;
    const channel = supabase
      .channel(`omni-analytics:${workspaceId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `workspace_id=eq.${workspaceId}` }, () => {
        setLive(true);
        setLastEvent(new Date().toLocaleTimeString());
        setSeries((prev) => {
          if (!prev.length) return prev;
          const copy = [...prev];
          const last = { ...copy[copy.length - 1] };
          for (const c of CHANNELS) last[c] = ((last[c] as number) ?? 0) + 1;
          last.total = ((last.total as number) ?? 0) + CHANNELS.length;
          copy[copy.length - 1] = last;
          return copy;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Aggregates
  const totals = useMemo(() => {
    const t: Record<string, number> = { total: 0, conversations: 0, revenue: 0, avgResponse: 0, avgResolution: 0, csat: 0, ai: 0 };
    for (const c of CHANNELS) t[c] = 0;
    let respAcc = 0, resAcc = 0, csatAcc = 0, ai = 0;
    for (const row of series) {
      t.total += row.total as number;
      t.conversations += row.conversations as number;
      t.revenue += row.revenue as number;
      respAcc += row.responseSec as number;
      resAcc += row.resolutionMin as number;
      csatAcc += row.csat as number;
      ai += row.aiTokens as number;
      for (const c of CHANNELS) t[c] += row[c] as number;
    }
    const n = series.length || 1;
    t.avgResponse = Math.round(respAcc / n);
    t.avgResolution = Math.round(resAcc / n);
    t.csat = +(csatAcc / n).toFixed(2);
    t.ai = ai;
    return t;
  }, [series]);

  const channelBreakdown = CHANNELS.map((c) => ({ name: c, value: totals[c], fill: CHANNEL_COLORS[c] }));
  const mostUsed = [...channelBreakdown].sort((a, b) => b.value - a.value)[0];
  const conversionRate = ((FUNNEL.at(-1)!.value / FUNNEL[0].value) * 100).toFixed(2);

  return (
    <>
      <AppTopbar title="Omnichannel Analytics" subtitle="Unified reports across every channel" />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Select value={range} onValueChange={(v) => setRange(v as typeof range)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            {live && (
              <Badge variant="outline" className="gap-1.5">
                <Radio className="h-3 w-3 text-[color:var(--color-accent)] animate-pulse" />
                Live · {lastEvent}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setSeries(seedSeries(range === "7d" ? 7 : range === "90d" ? 90 : 30))}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
            </Button>
            <ExportBtn name="omnichannel-volume" rows={series} />
          </div>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <KpiCard label="Messages" value={totals.total.toLocaleString()} delta="+12.4% vs prev" />
          <KpiCard label="Conversations" value={totals.conversations.toLocaleString()} delta="+8.1%" />
          <KpiCard label="Avg. response" value={`${Math.floor(totals.avgResponse / 60)}m ${totals.avgResponse % 60}s`} />
          <KpiCard label="Avg. resolution" value={`${totals.avgResolution}m`} />
          <KpiCard label="CSAT" value={`${totals.csat} / 5`} />
          <KpiCard label="Revenue" value={`$${totals.revenue.toLocaleString()}`} delta={`Conv. ${conversionRate}%`} />
        </div>

        <Tabs defaultValue="messages">
          <TabsList className="flex flex-wrap h-9">
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="volume">Volume</TabsTrigger>
            <TabsTrigger value="channels">Channels</TabsTrigger>
            <TabsTrigger value="response">Response & Resolution</TabsTrigger>
            <TabsTrigger value="csat">CSAT</TabsTrigger>
            <TabsTrigger value="agents">Agents</TabsTrigger>
            <TabsTrigger value="ai">AI Usage</TabsTrigger>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            <TabsTrigger value="journey">Journey</TabsTrigger>
            <TabsTrigger value="funnel">Funnel</TabsTrigger>
            <TabsTrigger value="retention">Retention</TabsTrigger>
          </TabsList>

          {/* MESSAGES */}
          <TabsContent value="messages" className="mt-4">
            <Panel title="Messages by channel" subtitle="Stacked daily volume" action={<ExportBtn name="messages-by-channel" rows={series} />}>
              <div className="h-80">
                <ResponsiveContainer>
                  <BarChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="day" fontSize={11} stroke="var(--color-muted-foreground)" />
                    <YAxis fontSize={11} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {CHANNELS.map((c) => (
                      <Bar key={c} dataKey={c} stackId="a" fill={CHANNEL_COLORS[c]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </TabsContent>

          {/* VOLUME */}
          <TabsContent value="volume" className="mt-4">
            <Panel title="Conversation volume" subtitle="Total conversations opened per day" action={<ExportBtn name="conversation-volume" rows={series} />}>
              <div className="h-80">
                <ResponsiveContainer>
                  <AreaChart data={series}>
                    <defs>
                      <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="day" fontSize={11} stroke="var(--color-muted-foreground)" />
                    <YAxis fontSize={11} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Area type="monotone" dataKey="conversations" stroke="var(--color-accent)" strokeWidth={2} fill="url(#gv)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </TabsContent>

          {/* CHANNELS */}
          <TabsContent value="channels" className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel title="Channel usage" subtitle={`Most used: ${mostUsed.name}`} action={<ExportBtn name="channel-usage" rows={channelBreakdown} />}>
              <div className="h-72">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={channelBreakdown} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100}>
                      {channelBreakdown.map((c) => <Cell key={c.name} fill={c.fill} />)}
                    </Pie>
                    <Tooltip {...CHART_TOOLTIP} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Channel table" subtitle="Sortable, exportable">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground text-left border-b border-border">
                    <tr><th className="py-2">Channel</th><th>Messages</th><th>Share</th></tr>
                  </thead>
                  <tbody>
                    {channelBreakdown.sort((a, b) => b.value - a.value).map((c) => (
                      <tr key={c.name} className="border-b border-border/60">
                        <td className="py-2 flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: c.fill }} />{c.name}
                        </td>
                        <td>{c.value.toLocaleString()}</td>
                        <td>{((c.value / totals.total) * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </TabsContent>

          {/* RESPONSE */}
          <TabsContent value="response" className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel title="Response time" subtitle="Average first response (seconds)" action={<ExportBtn name="response-time" rows={series} />}>
              <div className="h-72">
                <ResponsiveContainer>
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="day" fontSize={11} stroke="var(--color-muted-foreground)" />
                    <YAxis fontSize={11} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Line type="monotone" dataKey="responseSec" stroke="#a67c00" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Resolution time" subtitle="Average time to resolve (minutes)" action={<ExportBtn name="resolution-time" rows={series} />}>
              <div className="h-72">
                <ResponsiveContainer>
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="day" fontSize={11} stroke="var(--color-muted-foreground)" />
                    <YAxis fontSize={11} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Line type="monotone" dataKey="resolutionMin" stroke="#ffc933" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </TabsContent>

          {/* CSAT */}
          <TabsContent value="csat" className="mt-4">
            <Panel title="Customer satisfaction" subtitle="Daily CSAT (0-5)" action={<ExportBtn name="csat" rows={series} />}>
              <div className="h-80">
                <ResponsiveContainer>
                  <AreaChart data={series}>
                    <defs>
                      <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="day" fontSize={11} stroke="var(--color-muted-foreground)" />
                    <YAxis domain={[3.5, 5]} fontSize={11} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Area type="monotone" dataKey="csat" stroke="#22c55e" strokeWidth={2} fill="url(#gc)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </TabsContent>

          {/* AGENTS */}
          <TabsContent value="agents" className="mt-4">
            <Panel title="Agent performance" subtitle="Top agents by handled conversations" action={<ExportBtn name="agent-performance" rows={AGENTS} />}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground text-left border-b border-border">
                    <tr>
                      <th className="py-2">Agent</th><th>Handled</th><th>Resolved</th>
                      <th>Avg. response</th><th>CSAT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {AGENTS.map((a) => (
                      <tr key={a.name} className="border-b border-border/60">
                        <td className="py-2 font-medium">{a.name}</td>
                        <td>{a.handled}</td>
                        <td>{a.resolved}</td>
                        <td>{a.avgResp}</td>
                        <td>{a.csat}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </TabsContent>

          {/* AI USAGE */}
          <TabsContent value="ai" className="mt-4">
            <Panel title="AI usage" subtitle={`Tokens consumed · Total ${totals.ai.toLocaleString()}`} action={<ExportBtn name="ai-usage" rows={series} />}>
              <div className="h-80">
                <ResponsiveContainer>
                  <BarChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="day" fontSize={11} stroke="var(--color-muted-foreground)" />
                    <YAxis fontSize={11} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Bar dataKey="aiTokens" fill="#6366F1" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </TabsContent>

          {/* REVENUE */}
          <TabsContent value="revenue" className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel title="Revenue" subtitle="Attributed to conversations" action={<ExportBtn name="revenue" rows={series} />}>
              <div className="h-72">
                <ResponsiveContainer>
                  <AreaChart data={series}>
                    <defs>
                      <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a67c00" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#a67c00" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="day" fontSize={11} stroke="var(--color-muted-foreground)" />
                    <YAxis fontSize={11} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Area type="monotone" dataKey="revenue" stroke="#a67c00" strokeWidth={2} fill="url(#gr)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Conversion rate" subtitle="End-to-end funnel">
              <div className="flex flex-col items-center justify-center h-72">
                <div className="text-6xl font-display font-semibold">{conversionRate}%</div>
                <div className="text-sm text-muted-foreground mt-2">Visitor → Customer</div>
                <div className="text-xs text-muted-foreground mt-6">Most used channel: <span className="font-medium text-foreground">{mostUsed.name}</span></div>
              </div>
            </Panel>
          </TabsContent>

          {/* JOURNEY */}
          <TabsContent value="journey" className="mt-4">
            <Panel title="Customer journey" subtitle="Cross-channel path to purchase" action={<ExportBtn name="customer-journey" rows={JOURNEY} />}>
              <div className="h-80">
                <ResponsiveContainer>
                  <BarChart data={JOURNEY} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis type="number" fontSize={11} stroke="var(--color-muted-foreground)" />
                    <YAxis type="category" dataKey="step" fontSize={11} width={180} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Bar dataKey="customers" fill="#a67c00" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </TabsContent>

          {/* FUNNEL */}
          <TabsContent value="funnel" className="mt-4">
            <Panel title="Conversion funnel" subtitle="Visitors → Customers" action={<ExportBtn name="funnel" rows={FUNNEL} />}>
              <div className="h-96">
                <ResponsiveContainer>
                  <FunnelChart>
                    <Tooltip {...CHART_TOOLTIP} />
                    <Funnel dataKey="value" data={FUNNEL} isAnimationActive>
                      <LabelList position="right" fill="var(--color-foreground)" stroke="none" dataKey="name" />
                    </Funnel>
                  </FunnelChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </TabsContent>

          {/* RETENTION */}
          <TabsContent value="retention" className="mt-4">
            <Panel title="Retention curve" subtitle="Cohort retention over time" action={<ExportBtn name="retention" rows={RETENTION} />}>
              <div className="h-80">
                <ResponsiveContainer>
                  <LineChart data={RETENTION}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="cohort" fontSize={11} stroke="var(--color-muted-foreground)" />
                    <YAxis domain={[0, 100]} unit="%" fontSize={11} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Line type="monotone" dataKey="retained" stroke="#a67c00" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
