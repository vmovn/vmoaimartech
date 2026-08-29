import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function severityFromLevel(level: string | null | undefined) {
  const l = (level ?? "").toLowerCase();
  if (["critical", "fatal"].includes(l)) return "critical";
  if (["error", "err", "high"].includes(l)) return "error";
  if (["warn", "warning", "medium"].includes(l)) return "warn";
  if (["success", "ok"].includes(l)) return "success";
  return "info";
}

function normalizeLimit(n: number | undefined) {
  return Math.max(1, Math.min(500, n ?? 100));
}

export async function queryLogsInternal(data: any) {
    const limit = normalizeLimit(data.limit);
    const offset = Math.max(0, data.offset ?? 0);
    const q = (data.q ?? "").trim();
    const from = data.from ? new Date(data.from).toISOString() : null;
    const to = data.to ? new Date(data.to).toISOString() : null;

    let rows: any[] = [];

    switch (data.source) {
      case "audit": {
        let query = supabaseAdmin.from("audit_logs").select("*").order("created_at", { ascending: false });
        if (data.workspace_id) query = query.eq("workspace_id", data.workspace_id);
        if (data.organization_id) query = query.eq("organization_id", data.organization_id);
        if (data.actor_id) query = query.eq("actor_id", data.actor_id);
        if (from) query = query.gte("created_at", from);
        if (to) query = query.lte("created_at", to);
        if (q) query = query.or(`action.ilike.%${sanitizeSearchTerm(q)}%,resource_type.ilike.%${sanitizeSearchTerm(q)}%,resource_id.ilike.%${sanitizeSearchTerm(q)}%`);
        query = query.range(offset, offset + limit - 1);
        const { data: r, error } = await query;
        if (error) throw new Error(error.message);
        rows = (r ?? []).map((x: any) => ({
          id: x.id, source: "audit", timestamp: x.created_at,
          severity: "info", actor: x.actor_id, workspace_id: x.workspace_id, organization_id: x.organization_id,
          action: x.action, resource: x.resource_type ? `${x.resource_type}${x.resource_id ? ":" + x.resource_id : ""}` : null,
          ip: x.ip_address, user_agent: x.user_agent, message: null,
          meta: { changes: x.changes, metadata: x.metadata },
        }));
        break;
      }
      case "auth": {
        let query = supabaseAdmin.from("login_history").select("*").order("created_at", { ascending: false });
        if (data.actor_id) query = query.eq("user_id", data.actor_id);
        if (from) query = query.gte("created_at", from);
        if (to) query = query.lte("created_at", to);
        if (q) query = query.or(`event.ilike.%${sanitizeSearchTerm(q)}%,device.ilike.%${sanitizeSearchTerm(q)}%,failure_reason.ilike.%${sanitizeSearchTerm(q)}%,location.ilike.%${sanitizeSearchTerm(q)}%`);
        query = query.range(offset, offset + limit - 1);
        const { data: r, error } = await query;
        if (error) throw new Error(error.message);
        rows = (r ?? []).map((x: any) => ({
          id: x.id, source: "auth", timestamp: x.created_at,
          severity: x.event === "failed" ? "warn" : x.event === "success" ? "success" : "info",
          actor: x.user_id, workspace_id: null, organization_id: null,
          action: x.event, resource: x.device ?? null,
          ip: x.ip_address, user_agent: x.user_agent,
          message: x.failure_reason ?? x.location ?? null,
          meta: { metadata: x.metadata, location: x.location },
        }));
        break;
      }
      // Add other cases as needed...
      default:
        // Basic fallback or error for missing cases
        break;
    }

    return { rows, offset, limit };
}
