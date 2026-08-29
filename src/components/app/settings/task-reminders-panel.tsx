import { useEffect, useState } from "react";
import { BellRing, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import {
  useTaskReminderSettings,
  useUpsertTaskReminderSettings,
  useRunTaskRemindersNow,
} from "@/hooks/use-task-reminders";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const LEAD_CHOICES: Array<{ value: number; label: string }> = [
  { value: 0, label: "At due time" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 240, label: "4 hours before" },
  { value: 1440, label: "1 day before" },
  { value: 2880, label: "2 days before" },
  { value: 10080, label: "1 week before" },
];

export function TaskRemindersPanel() {
  const { data: settings, isLoading } = useTaskReminderSettings();
  const upsert = useUpsertTaskReminderSettings();
  const runNow = useRunTaskRemindersNow();

  const [enabled, setEnabled] = useState(true);
  const [inapp, setInapp] = useState(true);
  const [notifyOverdue, setNotifyOverdue] = useState(true);
  const [overdueRepeat, setOverdueRepeat] = useState(0);
  const [leadMinutes, setLeadMinutes] = useState<number[]>([1440, 60, 0]);

  useEffect(() => {
    if (!settings) return;
    setEnabled(!!settings.enabled);
    setInapp(!!settings.inapp_enabled);
    setNotifyOverdue(!!settings.notify_overdue);
    setOverdueRepeat(Number(settings.overdue_repeat_minutes ?? 0));
    setLeadMinutes(
      Array.isArray(settings.lead_minutes) ? settings.lead_minutes : [1440, 60, 0]
    );
  }, [settings]);

  const toggleLead = (v: number) => {
    setLeadMinutes((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v].sort((a, b) => b - a)
    );
  };

  const handleSave = async () => {
    try {
      await upsert.mutateAsync({
        enabled,
        lead_minutes: leadMinutes,
        notify_overdue: notifyOverdue,
        overdue_repeat_minutes: overdueRepeat,
        inapp_enabled: inapp,
      });
      toast.success("Task reminders saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    }
  };

  const handleRunNow = async () => {
    try {
      const res = await runNow.mutateAsync();
      toast.success(
        `Scanned ${res.tasks_scanned} · ${res.notifications_created} alerts sent`
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Run failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-2xl flex items-center gap-2">
            <BellRing className="w-5 h-5 text-primary" /> Task reminders
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Get notified before tasks assigned to you (or created by you) are due,
            and when they slip past their due date. Runs every 5 minutes.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRunNow} disabled={runNow.isPending || !enabled}>
          {runNow.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Run scan now
        </Button>
      </div>

      <div className="rounded-sm border p-4 flex items-center justify-between">
        <div>
          <div className="font-medium text-sm">Enable task reminders</div>
          <div className="text-xs text-muted-foreground">
            Master switch. Turn off to pause all task alerts without losing settings.
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} disabled={isLoading} />
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium">Remind me before due</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {LEAD_CHOICES.map((c) => {
            const on = leadMinutes.includes(c.value);
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => toggleLead(c.value)}
                disabled={!enabled}
                className={`text-sm px-3 py-2 rounded-sm border transition-colors text-left ${
                  on ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted border-border"
                } ${!enabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Pick any combination. Leave empty to skip pre-due reminders.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Overdue alerts</Label>
        <div className="rounded-sm border p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Notify when a task is overdue</div>
            <div className="text-xs text-muted-foreground">
              Alerts at 15 min, 1 h, 4 h and 1 day past due (unless you set a repeat interval below).
            </div>
          </div>
          <Switch checked={notifyOverdue} onCheckedChange={setNotifyOverdue} disabled={!enabled} />
        </div>
        <div className="rounded-sm border p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-medium">Repeat every</div>
            <div className="text-xs text-muted-foreground">
              Optional. Minutes between repeated overdue alerts (0 = use defaults above).
            </div>
          </div>
          <Input
            type="number"
            min={0}
            max={20160}
            step={15}
            value={overdueRepeat}
            onChange={(e) => setOverdueRepeat(Math.max(0, Number(e.target.value) || 0))}
            disabled={!enabled || !notifyOverdue}
            className="w-28"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Delivery channels</Label>
        <div className="rounded-sm border p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">In-app notification</div>
            <div className="text-xs text-muted-foreground">
              Shows in the bell menu and notifications page.
            </div>
          </div>
          <Switch checked={inapp} onCheckedChange={setInapp} disabled={!enabled} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={upsert.isPending || isLoading}>
          {upsert.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}
