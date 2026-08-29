/**
 * Task due-date reminder runner. For every open task with a due_at, checks
 * each recipient's (assignee + creator) `task_reminder_settings.lead_minutes`
 * plus their overdue flag, and creates in-app notifications guarded by a
 * unique log row so each (task, user, kind, offset, due) fires exactly once.
 *
 * Server-only.
 */

export type RunResult = {
  tasks_scanned: number;
  notifications_created: number;
  errors: string[];
};

const DEFAULT_LEAD = [1440, 60, 0];
const OVERDUE_SLOTS = [15, 60, 240, 1440]; // 15m, 1h, 4h, 1d after due

export async function runTaskReminders(opts: { now?: Date } = {}): Promise<RunResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const now = opts.now ?? new Date();
  const result: RunResult = { tasks_scanned: 0, notifications_created: 0, errors: [] };

  // Look 25h ahead (largest default lead 1440m = 24h) + all overdue in last 48h
  const horizonAhead = new Date(now.getTime() + 25 * 60 * 60 * 1000);
  const horizonBehind = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const { data: tasks, error: tErr } = await admin
    .from("tasks")
    .select("id, title, workspace_id, assigned_to, created_by, due_at, status")
    .not("due_at", "is", null)
    .is("deleted_at", null)
    .in("status", ["open", "in_progress"])
    .gte("due_at", horizonBehind.toISOString())
    .lte("due_at", horizonAhead.toISOString())
    .limit(2000);
  if (tErr) {
    result.errors.push(`tasks: ${tErr.message}`);
    return result;
  }

  const list = (tasks ?? []) as Array<{
    id: string;
    title: string;
    workspace_id: string;
    assigned_to: string | null;
    created_by: string | null;
    due_at: string;
    status: string;
  }>;
  if (!list.length) return result;

  // Load all relevant users' settings in one shot
  const userIds = Array.from(
    new Set(list.flatMap((t) => [t.assigned_to, t.created_by]).filter((x): x is string => !!x))
  );
  const { data: settingsRows } = await admin
    .from("task_reminder_settings")
    .select("user_id, enabled, lead_minutes, notify_overdue, overdue_repeat_minutes, inapp_enabled")
    .in("user_id", userIds);
  const settingsMap = new Map<string, {
    enabled: boolean; lead_minutes: number[]; notify_overdue: boolean;
    overdue_repeat_minutes: number; inapp_enabled: boolean;
  }>();
  for (const r of (settingsRows ?? []) as any[]) settingsMap.set(r.user_id, r);

  for (const t of list) {
    result.tasks_scanned++;
    const dueMs = new Date(t.due_at).getTime();
    const deltaMin = Math.round((dueMs - now.getTime()) / 60000); // + = future, - = overdue
    const recipients = Array.from(new Set([t.assigned_to, t.created_by].filter((x): x is string => !!x)));

    for (const uid of recipients) {
      const s = settingsMap.get(uid) ?? {
        enabled: true,
        lead_minutes: DEFAULT_LEAD,
        notify_overdue: true,
        overdue_repeat_minutes: 0,
        inapp_enabled: true,
      };
      if (!s.enabled || !s.inapp_enabled) continue;

      // Fire lead reminders: any lead offset whose window we've crossed
      // and haven't logged yet. Window = [offset - 5min, offset].
      if (deltaMin >= -1) {
        for (const off of s.lead_minutes) {
          if (!Number.isInteger(off) || off < 0 || off > 20160) continue;
          if (deltaMin <= off && deltaMin > off - 6) {
            await fireReminder(admin, t, uid, off === 0 ? "due" : "lead", off, result);
          }
        }
      }

      // Overdue: fire once per configured slot (default 15/60/240/1440 min past due)
      if (s.notify_overdue && deltaMin < 0) {
        const overdueMin = -deltaMin;
        const slots = s.overdue_repeat_minutes > 0
          ? [s.overdue_repeat_minutes] // simple periodic bucket
          : OVERDUE_SLOTS;
        for (const slot of slots) {
          const bucket = s.overdue_repeat_minutes > 0
            ? Math.floor(overdueMin / slot) * slot
            : slot;
          if (overdueMin >= bucket && overdueMin < bucket + 6 && bucket > 0) {
            await fireReminder(admin, t, uid, "overdue", bucket, result);
          }
        }
      }
    }
  }

  return result;
}

async function fireReminder(
  admin: any,
  t: { id: string; title: string; due_at: string; workspace_id: string },
  userId: string,
  kind: "lead" | "due" | "overdue",
  offsetMinutes: number,
  result: RunResult
) {
  const { error: logErr } = await admin.from("task_reminder_log").insert({
    task_id: t.id,
    user_id: userId,
    kind,
    offset_minutes: offsetMinutes,
    due_at: t.due_at,
  });
  if (logErr) {
    if (!String(logErr.message).includes("duplicate")) {
      result.errors.push(`log ${t.id}/${userId}/${kind}/${offsetMinutes}: ${logErr.message}`);
    }
    return; // already sent
  }

  const title =
    kind === "overdue"
      ? `Overdue: ${t.title}`
      : kind === "due"
      ? `Due now: ${t.title}`
      : `Upcoming task: ${t.title}`;
  const body =
    kind === "overdue"
      ? `This task is ${formatMinutes(offsetMinutes)} past its due date.`
      : kind === "due"
      ? `This task is due now.`
      : `Due in ${formatMinutes(offsetMinutes)}.`;

  const { error: nErr } = await admin.from("notifications").insert({
    user_id: userId,
    organization_id: t.workspace_id,
    channel: "in_app",
    status: "unread",
    title,
    body,
    action_url: `/tasks`,
    category: "task",
    data: { task_id: t.id, kind, offset_minutes: offsetMinutes, due_at: t.due_at },
  });
  if (nErr) {
    result.errors.push(`notify ${t.id}/${userId}: ${nErr.message}`);
  } else {
    result.notifications_created++;
  }
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  if (m < 1440) {
    const h = Math.round(m / 60);
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  const d = Math.round(m / 1440);
  return `${d} day${d === 1 ? "" : "s"}`;
}
