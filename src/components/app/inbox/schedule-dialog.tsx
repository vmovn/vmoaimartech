import { useMemo, useState } from "react";
import { CalendarClock, Clock, X } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimePicker, toLocalDateTimeString, fromLocalDateTimeString } from "@/shared/components";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  useScheduledMessages,
  useScheduleMessage,
  useCancelScheduledMessage,
} from "@/hooks/use-productivity";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversationId: string;
  body: string;
  onScheduled: () => void;
};

/** Suggested quick times relative to now. */
function useQuickTimes() {
  return useMemo(() => {
    const now = new Date();
    const in1h = new Date(now.getTime() + 60 * 60 * 1000);
    const tomorrow9 = new Date(now);
    tomorrow9.setDate(tomorrow9.getDate() + 1);
    tomorrow9.setHours(9, 0, 0, 0);
    const monday9 = new Date(now);
    const dow = monday9.getDay(); // 0 = Sun
    const delta = ((1 - dow + 7) % 7) || 7;
    monday9.setDate(monday9.getDate() + delta);
    monday9.setHours(9, 0, 0, 0);
    return [
      { label: "In 1 hour", value: in1h },
      { label: "Tomorrow, 9:00 AM", value: tomorrow9 },
      { label: "Monday, 9:00 AM", value: monday9 },
    ];
  }, []);
}

export function ScheduleDialog({
  open,
  onOpenChange,
  conversationId,
  body,
  onScheduled,
}: Props) {
  const quick = useQuickTimes();
  const [custom, setCustom] = useState<string>(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return format(d, "yyyy-MM-dd'T'HH:mm");
  });
  const schedule = useScheduleMessage();
  const cancel = useCancelScheduledMessage();
  const { data: pending = [] } = useScheduledMessages(conversationId);

  const submit = async (when: Date) => {
    if (when.getTime() <= Date.now()) {
      toast.error("Pick a time in the future");
      return;
    }
    try {
      await schedule.mutateAsync({
        conversation_id: conversationId,
        body,
        scheduled_for: when.toISOString(),
      });
      toast.success(`Scheduled for ${format(when, "PPp")}`);
      onScheduled();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Schedule message
          </DialogTitle>
          <DialogDescription>
            Send this message later automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-sm border border-border bg-muted/30 p-3 text-sm max-h-32 overflow-y-auto whitespace-pre-wrap">
            {body || (
              <span className="text-muted-foreground italic">Empty message</span>
            )}
          </div>

          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
              Quick times
            </div>
            <div className="grid grid-cols-1 gap-1">
              {quick.map((q) => (
                <Button
                  key={q.label}
                  variant="outline"
                  className="justify-between h-9"
                  onClick={() => submit(q.value)}
                  disabled={!body.trim()}
                >
                  <span className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5" />
                    {q.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(q.value, "MMM d, h:mm a")}
                  </span>
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sched-custom" className="text-[11px] uppercase tracking-wider">
              Or pick a custom time
            </Label>
            <div className="flex gap-2">
              <DateTimePicker
                value={fromLocalDateTimeString(custom)}
                onChange={(d) => setCustom(toLocalDateTimeString(d))}
                fromDate={new Date()}
              />
              <Button
                onClick={() => submit(new Date(custom))}
                disabled={!body.trim() || !custom}
              >
                Schedule
              </Button>
            </div>
          </div>

          {pending.length > 0 && (
            <>
              <Separator />
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
                  Already scheduled ({pending.length})
                </div>
                <ScrollArea className="max-h-32">
                  <ul className="space-y-1">
                    {pending.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-start gap-2 rounded-sm border border-border p-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium">
                            {format(new Date(m.scheduled_for), "PPp")}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {m.body}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => cancel.mutate(m.id)}
                          aria-label="Cancel"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
