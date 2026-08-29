/**
 * Security Issues scanner.
 *
 * Produces an actionable list of security findings for the current workspace
 * plus the live status of every protected surface (cron hooks, webhook
 * endpoints, access policies). Read-only: it never mutates configuration.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type IssueSeverity = "critical" | "high" | "medium" | "low" | "info";
export type IssueStatus = "action_required" | "monitor" | "passing";

export type SecurityIssue = {
  id: string;
  title: string;
  detail: string;
  category: string;
  severity: IssueSeverity;
  status: IssueStatus;
  /** Short factual evidence for why this finding fired (or passed). */
  evidence: string;
  /** What to do about it. */
  remediation: string;
};

export type SurfaceStatus = {
  id: string;
  name: string;
  kind: "hook" | "policy" | "endpoint";
  /** Human-readable protection mechanism. */
  guard: string;
  status: "protected" | "unprotected" | "degraded";
  note: string;
};

export type SecurityScan = {
  generated_at: string;
  summary: {
    total: number;
    action_required: number;
    monitor: number;
    passing: number;
    critical: number;
    high: number;
    protected_surfaces: number;
    unprotected_surfaces: number;
  };
  issues: SecurityIssue[];
  surfaces: SurfaceStatus[];
};

/** Every internal cron hook route guarded by `guardCronRequest`. */
const CRON_HOOKS = [
  "analyze-conversations",
  "billing.automation",
  "billing.rollup",
  "birthday-reminders",
  "campaign-dispatch",
  "cleanup-media",
  "dispatch-activity-reminders",
  "drip-tick",
  "flush-scheduled-messages",
  "process-exports",
  "process-outbox",
  "process-scheduled",
  "process-webhooks",
  "run-scheduled-syncs",
  "sla-scan",
  "task-reminders",
  "workflow-queue",
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeCount(supabase: any, table: string, tune: (q: any) => any) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await tune(supabase.from(table).select("*", { count: "exact", head: true }));
    return count ?? 0;
  } catch {
    return 0;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeSelect(supabase: any, table: string, cols: string, tune: (q: any) => any) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await tune(supabase.from(table).select(cols));
    if (error) return [] as any[];
    return (data ?? []) as any[];
  } catch {
    return [] as any[];
  }
}

export const getSecurityScan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SecurityScan> => {
    const { supabase, userId } = context;
    const now = new Date();
    const iso = (ms: number) => new Date(now.getTime() - ms).toISOString();
    const d1 = iso(24 * 3600_000);
    const d7 = iso(7 * 24 * 3600_000);
    const d90 = iso(90 * 24 * 3600_000);

    const { data: ws } = await supabase
      .from("workspace_members").select("workspace_id")
      .eq("user_id", userId).limit(1).maybeSingle();
    const workspaceId = (ws?.workspace_id as string) ?? null;
    const scopeWs = <T,>(q: T) => {
      if (!workspaceId) return q;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { return (q as any).eq("workspace_id", workspaceId); } catch { return q; }
    };

    // --- Environment guards (server-only, read inside handler) ---
    const cronTokenSet = Boolean(process.env.INTERNAL_CRON_TOKEN);
    const metaAppSecretSet = Boolean(process.env.META_APP_SECRET);

    // --- Signals ---
    const [
      apiKeys,
      ipAllowlistRules,
      retentionPolicies,
      lockedAccounts,
      failed24,
      highSevEvents7,
      webhookFailures24,
      apiErrors24,
      verifyTokens,
      gdprOpen,
    ] = await Promise.all([
      safeSelect(supabase, "api_keys", "id, name, scopes, revoked_at, last_used_at, created_at, allowed_ips",
        (q) => scopeWs(q).limit(200)),
      safeCount(supabase, "ip_allowlists", (q) => scopeWs(q)),
      safeCount(supabase, "data_retention_policies", (q) => scopeWs(q)),
      safeCount(supabase, "account_lockouts", (q) => q.gte("locked_until", now.toISOString())),
      safeCount(supabase, "login_history", (q) => q.eq("event", "failed").gte("created_at", d1)),
      safeCount(supabase, "security_events", (q) =>
        scopeWs(q).in("severity", ["high", "critical"]).gte("created_at", d7)),
      safeCount(supabase, "webhook_deliveries", (q) => q.eq("success", false).gte("created_at", d1)),
      safeCount(supabase, "api_gateway_logs", (q) => q.gte("status_code", 400).gte("created_at", d1)),
      safeCount(supabase, "webhook_verify_tokens", (q) => scopeWs(q)),
      safeCount(supabase, "gdpr_requests", (q) => scopeWs(q).eq("status", "pending")),
    ]);

    const { data: policyRow } = await supabase
      .from("password_policy").select("*").limit(1).maybeSingle();

    const activeKeys = apiKeys.filter((k) => !k.revoked_at);
    const keysWithoutScopes = activeKeys.filter(
      (k) => !Array.isArray(k.scopes) || k.scopes.length === 0,
    );
    const staleKeys = activeKeys.filter((k) => (k.created_at ?? "") < d90);
    const unusedKeys = activeKeys.filter((k) => !k.last_used_at);

    const issues: SecurityIssue[] = [];
    const add = (i: SecurityIssue) => issues.push(i);

    add({
      id: "cron-token",
      title: "Internal cron token configured",
      detail: "All /api/public/hooks/* endpoints require the x-cron-token header and fail closed when the secret is missing.",
      category: "Secrets",
      severity: "critical",
      status: cronTokenSet ? "passing" : "action_required",
      evidence: cronTokenSet
        ? "INTERNAL_CRON_TOKEN is present in the server environment."
        : "INTERNAL_CRON_TOKEN is NOT set — every scheduled job is rejected with 401.",
      remediation: cronTokenSet
        ? "No action needed. Rotate the token periodically."
        : "Add the INTERNAL_CRON_TOKEN secret and update the pg_cron job headers to match.",
    });

    add({
      id: "meta-app-secret",
      title: "Meta webhook signature secret",
      detail: "Inbound WhatsApp/Messenger webhooks are verified with an HMAC signature derived from META_APP_SECRET.",
      category: "Webhooks",
      severity: "high",
      status: metaAppSecretSet ? "passing" : "action_required",
      evidence: metaAppSecretSet
        ? "META_APP_SECRET is configured; payload signatures are verified."
        : "META_APP_SECRET is missing; signature verification cannot run.",
      remediation: metaAppSecretSet
        ? "No action needed."
        : "Add META_APP_SECRET so inbound webhook payloads can be signature-verified.",
    });

    add({
      id: "api-key-scopes",
      title: "API keys without scopes",
      detail: "Keys with an empty scope list cannot be constrained by the gateway's permission checks.",
      category: "API access",
      severity: "high",
      status: keysWithoutScopes.length > 0 ? "action_required" : "passing",
      evidence: keysWithoutScopes.length > 0
        ? `${keysWithoutScopes.length} active key(s) have no scopes: ${keysWithoutScopes.map((k) => k.name ?? k.id).slice(0, 5).join(", ")}.`
        : `${activeKeys.length} active key(s), all with explicit scopes.`,
      remediation: "Edit each key in Settings → API keys and assign the minimum scopes it needs.",
    });

    add({
      id: "api-key-rotation",
      title: "API keys older than 90 days",
      detail: "Long-lived credentials increase blast radius if leaked.",
      category: "API access",
      severity: "medium",
      status: staleKeys.length > 0 ? "monitor" : "passing",
      evidence: staleKeys.length > 0
        ? `${staleKeys.length} active key(s) created more than 90 days ago.`
        : "No active key is older than 90 days.",
      remediation: "Use the Rotate action on each aged key and update the consuming integration.",
    });

    add({
      id: "api-key-unused",
      title: "Never-used API keys",
      detail: "Unused credentials should be revoked rather than left active.",
      category: "API access",
      severity: "low",
      status: unusedKeys.length > 0 ? "monitor" : "passing",
      evidence: unusedKeys.length > 0
        ? `${unusedKeys.length} active key(s) have never made a request.`
        : "Every active key has been used at least once.",
      remediation: "Revoke keys that are no longer needed.",
    });

    add({
      id: "ip-allowlist",
      title: "IP allowlist rules",
      detail: "Restricting API and admin access by source IP blocks credential reuse from unknown networks.",
      category: "Network",
      severity: "medium",
      status: ipAllowlistRules > 0 ? "passing" : "monitor",
      evidence: ipAllowlistRules > 0
        ? `${ipAllowlistRules} allowlist rule(s) configured.`
        : "No IP allowlist rules configured for this workspace.",
      remediation: "Add allowlist entries for your office/CI egress IPs under Security settings.",
    });

    add({
      id: "password-policy",
      title: "Password policy",
      detail: "Minimum length, complexity, and lockout thresholds for password sign-in.",
      category: "Authentication",
      severity: "high",
      status: policyRow ? "passing" : "action_required",
      evidence: policyRow
        ? `Configured: min length ${policyRow.min_length ?? "—"}, lockout after ${policyRow.max_failed_attempts ?? "—"} failed attempts.`
        : "No password policy row found — platform defaults apply.",
      remediation: "Define an explicit password policy including a lockout threshold.",
    });

    add({
      id: "brute-force",
      title: "Failed sign-in volume (24h)",
      detail: "Sustained failures indicate credential stuffing or brute-force attempts.",
      category: "Threat detection",
      severity: failed24 >= 50 ? "high" : "medium",
      status: failed24 >= 50 ? "action_required" : failed24 > 0 ? "monitor" : "passing",
      evidence: `${failed24} failed sign-in attempt(s) in the last 24 hours; ${lockedAccounts} account(s) currently locked.`,
      remediation: "Review the Security Center threat tab and block offending IPs via the allowlist.",
    });

    add({
      id: "high-sev-events",
      title: "High-severity security events (7d)",
      detail: "Events recorded by the platform with high or critical severity.",
      category: "Threat detection",
      severity: "high",
      status: highSevEvents7 > 0 ? "action_required" : "passing",
      evidence: `${highSevEvents7} high/critical event(s) in the last 7 days.`,
      remediation: "Triage each event in the Security Center audit timeline.",
    });

    add({
      id: "webhook-failures",
      title: "Failed webhook deliveries (24h)",
      detail: "Repeated delivery failures can hide rejected or tampered payloads.",
      category: "Webhooks",
      severity: "medium",
      status: webhookFailures24 > 10 ? "action_required" : webhookFailures24 > 0 ? "monitor" : "passing",
      evidence: `${webhookFailures24} failed delivery attempt(s) in the last 24 hours.`,
      remediation: "Inspect the dead-letter queue and re-drive or disable the failing endpoint.",
    });

    add({
      id: "api-errors",
      title: "API gateway 4xx/5xx responses (24h)",
      detail: "A spike in rejected API calls often maps to abuse or a misconfigured integration.",
      category: "API access",
      severity: "low",
      status: apiErrors24 > 100 ? "monitor" : "passing",
      evidence: `${apiErrors24} error response(s) in the last 24 hours.`,
      remediation: "Correlate with the gateway logs to confirm the caller and scope.",
    });

    add({
      id: "retention",
      title: "Data retention policies",
      detail: "Retention windows limit how long personal data is stored (GDPR art. 5).",
      category: "Compliance",
      severity: "medium",
      status: retentionPolicies > 0 ? "passing" : "action_required",
      evidence: retentionPolicies > 0
        ? `${retentionPolicies} retention policy/policies defined.`
        : "No retention policies defined for this workspace.",
      remediation: "Define retention windows under Compliance → Data retention.",
    });

    add({
      id: "gdpr-requests",
      title: "Pending GDPR requests",
      detail: "Subject access and erasure requests must be answered within 30 days.",
      category: "Compliance",
      severity: "medium",
      status: gdprOpen > 0 ? "action_required" : "passing",
      evidence: `${gdprOpen} pending request(s).`,
      remediation: "Process pending requests in the Compliance Center.",
    });

    const surfaces: SurfaceStatus[] = [
      ...CRON_HOOKS.map<SurfaceStatus>((h) => ({
        id: `hook-${h}`,
        name: `/api/public/hooks/${h}`,
        kind: "hook",
        guard: "guardCronRequest · x-cron-token",
        status: cronTokenSet ? "protected" : "unprotected",
        note: cronTokenSet
          ? "Fails closed on missing/invalid token (401)."
          : "INTERNAL_CRON_TOKEN unset — endpoint rejects all callers (401) and the job will not run.",
      })),
      {
        id: "endpoint-whatsapp-webhook",
        name: "/api/public/webhooks/whatsapp",
        kind: "endpoint",
        guard: "Meta HMAC signature + verify token",
        status: metaAppSecretSet ? "protected" : "degraded",
        note: metaAppSecretSet
          ? `Signature verification active · ${verifyTokens} verify token(s) registered.`
          : "META_APP_SECRET missing — payload signatures cannot be verified.",
      },
      {
        id: "endpoint-gateway",
        name: "/api/v1/* (API gateway)",
        kind: "endpoint",
        guard: "Bearer API key + scope enforcement + IP allowlist",
        status: keysWithoutScopes.length > 0 ? "degraded" : "protected",
        note: keysWithoutScopes.length > 0
          ? `${keysWithoutScopes.length} active key(s) carry no scopes.`
          : `${activeKeys.length} active key(s), all scoped.`,
      },
      {
        id: "policy-rls",
        name: "Row Level Security (workspace isolation)",
        kind: "policy",
        guard: "RLS policies scoped to workspace membership",
        status: workspaceId ? "protected" : "degraded",
        note: workspaceId
          ? "All reads in this scan executed as the signed-in user under RLS."
          : "No workspace membership resolved for the current user.",
      },
      {
        id: "policy-password",
        name: "Password & lockout policy",
        kind: "policy",
        guard: "password_policy table",
        status: policyRow ? "protected" : "unprotected",
        note: policyRow ? "Custom policy active." : "Using platform defaults.",
      },
      {
        id: "policy-ip",
        name: "IP allowlisting",
        kind: "policy",
        guard: "ip_allowlists table",
        status: ipAllowlistRules > 0 ? "protected" : "degraded",
        note: `${ipAllowlistRules} rule(s) configured.`,
      },
      {
        id: "policy-retention",
        name: "Data retention",
        kind: "policy",
        guard: "data_retention_policies table",
        status: retentionPolicies > 0 ? "protected" : "unprotected",
        note: `${retentionPolicies} policy/policies configured.`,
      },
    ];

    const summary = {
      total: issues.length,
      action_required: issues.filter((i) => i.status === "action_required").length,
      monitor: issues.filter((i) => i.status === "monitor").length,
      passing: issues.filter((i) => i.status === "passing").length,
      critical: issues.filter((i) => i.status !== "passing" && i.severity === "critical").length,
      high: issues.filter((i) => i.status !== "passing" && i.severity === "high").length,
      protected_surfaces: surfaces.filter((s) => s.status === "protected").length,
      unprotected_surfaces: surfaces.filter((s) => s.status !== "protected").length,
    };

    const order: Record<IssueStatus, number> = { action_required: 0, monitor: 1, passing: 2 };
    const sevOrder: Record<IssueSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    issues.sort((a, b) => order[a.status] - order[b.status] || sevOrder[a.severity] - sevOrder[b.severity]);

    return { generated_at: now.toISOString(), summary, issues, surfaces };
  });
