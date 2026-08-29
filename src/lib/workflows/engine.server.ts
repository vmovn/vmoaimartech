import type { WorkflowGraph, WorkflowRunStatus, StepStatus } from "./types";
import {
  evalIf, evalSwitch, evalBoolean, evalNot, evalAnd, evalOr,
  evalCompareText, evalCompareNumber, evalCompareDate,
  evalContains, evalStartsWith, evalEndsWith, evalRegex,
  evalDecisionTree, evalExpression, coerceReturn,
} from "./logic-eval";
import { AI_NODE_HANDLERS } from "./ai-eval.server";
import { interpolate as sharedInterpolate } from "./variables";

/**
 * Shared workflow execution primitive.
 *
 * Runs a DAG start-to-finish against any Supabase client (RLS user client for
 * manual runs, service-role client for queue workers). Records a `workflow_run`
 * plus one `workflow_run_step` per node, interpolates `{{path}}` variables,
 * and executes the built-in action set.
 */

export type SupabaseLike = {
  from: (table: string) => any;
};

export type ExecuteOptions = {
  supabase: SupabaseLike;
  automation: {
    id: string;
    workspace_id: string;
    version: number | null;
    graph: WorkflowGraph;
    runs_count?: number | null;
  };
  triggerSource: string;
  input: Record<string, unknown>;
  actorUserId?: string | null;
  dryRun?: boolean;
  /** Preallocated queue job id — status of the row will be updated on completion. */
  queueJobId?: string | null;
};

export type ExecuteResult = {
  runId: string;
  status: WorkflowRunStatus;
  error: { message: string; nodeId?: string } | null;
  durationMs: number;
};

export async function executeAutomation(opts: ExecuteOptions): Promise<ExecuteResult> {
  const { supabase, automation, triggerSource, input } = opts;
  const graph = automation.graph ?? { nodes: [], edges: [] };
  const startedAt = Date.now();

  const { data: run, error: runErr } = await supabase
    .from("workflow_runs")
    .insert({
      workspace_id: automation.workspace_id,
      automation_id: automation.id,
      version: automation.version ?? 1,
      status: "running" satisfies WorkflowRunStatus,
      trigger_source: triggerSource,
      input: input as any,
    })
    .select("id")
    .single();

  if (runErr || !run) throw new Error(`Failed to start run: ${runErr?.message}`);

  const ordered = orderNodes(graph);

  // Load scoped variables (global / env / workflow-scoped) for this workspace.
  const { data: varRows } = await supabase
    .from("workflow_variables")
    .select("scope, key, value, is_secret")
    .eq("workspace_id", automation.workspace_id)
    .or(`automation_id.is.null,automation_id.eq.${automation.id}`);
  const { composeBag } = await import("./variables");
  const scopedVars = ((varRows ?? []) as Array<{ scope: never; key: string; value: unknown; is_secret: boolean }>);
  const baseBag = composeBag(scopedVars, {});

  const variables: Record<string, unknown> = {
    ...baseBag,
    trigger: input,
    actor: { userId: opts.actorUserId ?? null },
  };

  let finalStatus: WorkflowRunStatus = "success";
  let runError: { message: string; nodeId?: string } | null = null;

  for (let i = 0; i < ordered.length; i++) {
    const node = ordered[i];
    const stepStart = Date.now();

    const { data: step, error: stepErr } = await supabase
      .from("workflow_run_steps")
      .insert({
        run_id: run.id,
        workspace_id: automation.workspace_id,
        node_id: node.id,
        node_type: node.type,
        status: "running" satisfies StepStatus,
        sort_order: i,
        input: interpolate(node.config, variables) as any,
      })
      .select("id")
      .single();

    if (stepErr || !step) {
      finalStatus = "failed";
      runError = { message: `Step insert failed: ${stepErr?.message}`, nodeId: node.id };
      break;
    }

    // Per-node retry with exponential backoff + per-node timeout.
    //   retry:      { attempts?: number (1-5), backoff_ms?: number }
    //   timeout_ms: hard ceiling per attempt (default 30s, max 60s)
    const retryCfg = (node.config?.retry ?? {}) as { attempts?: number; backoff_ms?: number };
    const maxAttempts = Math.min(5, Math.max(1, Number(retryCfg.attempts ?? 1)));
    const baseBackoff = Math.min(10_000, Math.max(0, Number(retryCfg.backoff_ms ?? 300)));
    const timeoutMs = Math.min(60_000, Math.max(1_000, Number(node.config?.timeout_ms ?? 30_000)));

    let attempt = 0;
    let lastErr: unknown = null;
    while (attempt < maxAttempts) {
      attempt++;
      try {
        const output = await withTimeout(
          executeNode(node, variables, {
            supabase,
            workspaceId: automation.workspace_id,
            dryRun: !!opts.dryRun,
          }),
          timeoutMs,
          `Node ${node.type} timed out after ${timeoutMs}ms`,
        );
        variables[node.id] = output ?? null;

        await supabase
          .from("workflow_run_steps")
          .update({
            status: "success",
            output: (output ?? null) as any,
            duration_ms: Date.now() - stepStart,
            finished_at: new Date().toISOString(),
            attempts: attempt,
          })
          .eq("id", step.id);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts) {
          const wait = baseBackoff * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, Math.min(wait, 5_000)));
        }
      }
    }

    if (lastErr) {
      const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
      await supabase
        .from("workflow_run_steps")
        .update({
          status: "failed",
          error: { message, attempts: attempt },
          duration_ms: Date.now() - stepStart,
          finished_at: new Date().toISOString(),
          attempts: attempt,
        })
        .eq("id", step.id);
      finalStatus = "failed";
      runError = { message, nodeId: node.id };
      break;
    }
  }


  const durationMs = Date.now() - startedAt;

  await supabase
    .from("workflow_runs")
    .update({
      status: finalStatus,
      output: variables as any,
      error: (runError ?? null) as any,
      duration_ms: durationMs,
      finished_at: new Date().toISOString(),
    })
    .eq("id", run.id);

  await supabase
    .from("automations")
    .update({
      last_run_at: new Date().toISOString(),
      last_run_status: finalStatus,
      runs_count: (automation.runs_count ?? 0) + 1,
    })
    .eq("id", automation.id);

  return { runId: run.id as string, status: finalStatus, error: runError, durationMs };
}

function orderNodes(graph: WorkflowGraph) {
  const trigger = graph.nodes.find((n) => n.type.startsWith("trigger."));
  if (!trigger) return graph.nodes;
  const seen = new Set<string>([trigger.id]);
  const ordered = [trigger];
  const queue = [trigger.id];
  while (queue.length) {
    const id = queue.shift()!;
    for (const edge of graph.edges.filter((e) => e.source === id)) {
      if (seen.has(edge.target)) continue;
      const next = graph.nodes.find((n) => n.id === edge.target);
      if (!next) continue;
      seen.add(next.id);
      ordered.push(next);
      queue.push(next.id);
    }
  }
  return ordered;
}

function interpolate(value: unknown, vars: Record<string, unknown>): unknown {
  return sharedInterpolate(value, vars);
}

async function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}


async function executeNode(
  node: { id: string; type: string; config: Record<string, unknown> },
  vars: Record<string, unknown>,
  ctx: { supabase: SupabaseLike; workspaceId: string; dryRun: boolean },
): Promise<unknown> {
  const input = interpolate(node.config, vars) as Record<string, unknown>;
  if (node.type.startsWith("trigger.")) return input;

  if (node.type.startsWith("ai.")) {
    const handler = AI_NODE_HANDLERS[node.type];
    if (!handler) throw new Error(`Unknown AI node: ${node.type}`);
    if (ctx.dryRun) return { skipped: true, ai: true, node: node.type };
    return handler(input, { workspaceId: ctx.workspaceId, dryRun: ctx.dryRun });
  }

  switch (node.type) {
    case "logic.delay": {
      const unit = String(input.unit ?? "seconds");
      const factor = unit === "minutes" ? 60_000 : unit === "hours" ? 3_600_000 : unit === "days" ? 86_400_000 : 1_000;
      const ms = Math.min(Number(input.duration ?? 0) * factor, 5_000);
      await new Promise((r) => setTimeout(r, ms));
      return { delayed_ms: ms };
    }
    case "logic.if":
      return evalIf(input);
    case "logic.switch":
      return evalSwitch(input);
    case "logic.boolean":
      return evalBoolean(input);
    case "logic.not":
      return evalNot(input);
    case "logic.and":
      return evalAnd(input);
    case "logic.or":
      return evalOr(input);
    case "logic.compare_text":
      return evalCompareText(input);
    case "logic.compare_number":
      return evalCompareNumber(input);
    case "logic.compare_date":
      return evalCompareDate(input);
    case "logic.contains":
      return evalContains(input);
    case "logic.starts_with":
      return evalStartsWith(input);
    case "logic.ends_with":
      return evalEndsWith(input);
    case "logic.regex":
      return evalRegex(input);
    case "logic.decision_tree":
      return evalDecisionTree(input);
    case "logic.expression": {
      const raw = evalExpression(String(input.expression ?? ""));
      return { value: coerceReturn(raw, input.type as string | undefined) };
    }
    case "logic.set_variable":
      return { name: String(input.name ?? ""), value: input.value };

    case "action.notify.internal": {
      if (ctx.dryRun) return { skipped: true };
      const { error } = await ctx.supabase.from("notifications").insert({
        workspace_id: ctx.workspaceId,
        user_id: input.user_id ?? null,
        title: String(input.title ?? "Workflow notification"),
        body: input.body ?? null,
        category: "workflow",
      });
      if (error) throw new Error(error.message);
      return { delivered: true };
    }
    case "action.contact.add_tag": {
      if (ctx.dryRun) return { skipped: true };
      const contactId = String(input.contact_id ?? "");
      const tag = String(input.tag ?? "").trim();
      if (!contactId || !tag) throw new Error("contact_id and tag required");
      const { data: contact } = await ctx.supabase
        .from("contacts")
        .select("id, tags")
        .eq("id", contactId)
        .single();
      const nextTags = Array.from(new Set([...(contact?.tags ?? []), tag]));
      const { error } = await ctx.supabase.from("contacts").update({ tags: nextTags }).eq("id", contactId);
      if (error) throw new Error(error.message);
      return { tags: nextTags };
    }
    case "action.http.request": {
      if (ctx.dryRun) return { skipped: true };
      const url = String(input.url ?? "");
      if (!url) throw new Error("url required");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const res = await fetch(url, {
          method: String(input.method ?? "GET"),
          headers: (input.headers as Record<string, string>) ?? undefined,
          body: input.body ? JSON.stringify(input.body) : undefined,
          signal: controller.signal,
        });
        const bodyText = await res.text();
        let parsed: unknown = bodyText;
        try { parsed = JSON.parse(bodyText); } catch { /* keep text */ }
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${bodyText.slice(0, 200)}`);
        return { status: res.status, body: parsed };
      } finally {
        clearTimeout(timeout);
      }
    }

    case "action.livechat.open_widget":
    case "action.livechat.send_message":
    case "action.livechat.start_ai_chat":
    case "action.livechat.assign_agent":
    case "action.livechat.create_lead":
    case "action.livechat.create_task":
    case "action.livechat.trigger_workflow": {
      if (ctx.dryRun) return { skipped: true, node: node.type };
      const { runLivechatAction } = await import("@/lib/livechat/automation-actions.server");
      return runLivechatAction(node.type, input, {
        supabase: ctx.supabase,
        workspaceId: ctx.workspaceId,
        trigger: (vars.trigger ?? {}) as Record<string, unknown>,
      });
    }

    case "action.booking.notify": {
      if (ctx.dryRun) return { skipped: true, node: node.type };
      const apptId = String((input as { appointment_id?: string }).appointment_id ?? "");
      const kind = String((input as { kind?: string }).kind ?? "reminder") as
        | "confirmation" | "reschedule" | "cancellation" | "reminder" | "follow_up" | "review_request";
      if (!apptId) throw new Error("appointment_id required");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sendAppointmentNotification } = await import("@/lib/booking/notifications-engine.server");
      return sendAppointmentNotification(supabaseAdmin, apptId, kind);
    }
    case "action.booking.schedule_reminders": {
      if (ctx.dryRun) return { skipped: true, node: node.type };
      const apptId = String((input as { appointment_id?: string }).appointment_id ?? "");
      if (!apptId) throw new Error("appointment_id required");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { scheduleAppointmentReminders } = await import("@/lib/booking/notifications-engine.server");
      return scheduleAppointmentReminders(supabaseAdmin, apptId);
    }

    default:
      return { simulated: true, input };
  }

}

