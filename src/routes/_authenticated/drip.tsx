import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { Zap, Plus, Play, Pause, FileEdit } from "lucide-react";
import { useDripSequences, useMarketingRealtime } from "@/hooks/use-marketing";

export const Route = createFileRoute("/_authenticated/drip")({
  component: DripPage,
});

const statusClass = {
  active: "text-success bg-success/10",
  paused: "text-warning bg-warning/10",
  draft: "text-muted-foreground bg-muted",
  archived: "text-muted-foreground bg-muted opacity-60",
} as const;

const statusIcon = { active: Play, paused: Pause, draft: FileEdit, archived: FileEdit } as const;

function DripPage() {
  useMarketingRealtime();
  const { data: sequences, isLoading } = useDripSequences();

  return (
    <>
      <AppTopbar
        title="Drip Sequences"
        subtitle="Automated multi-step WhatsApp journeys"
        actions={
          <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
            <Plus className="w-4 h-4" /> New sequence
          </button>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading sequences…</div>
        ) : !sequences || sequences.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center">
            <Zap className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
            <div className="font-medium">No drip sequences yet</div>
            <div className="text-sm text-muted-foreground mt-1">
              Build automated welcome, onboarding, and re-engagement flows triggered by segment or event.
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface shadow-sm divide-y divide-border">
            {sequences.map((s) => {
              const Icon = statusIcon[s.status];
              return (
                <div key={s.id} className="p-5 flex flex-wrap items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 text-accent grid place-items-center">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-[220px]">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 capitalize">
                      Trigger: {s.trigger_type.replace("_", " ")} · {s.enrolled_count} enrolled · {s.completed_count} completed
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs font-medium ${statusClass[s.status]}`}>
                    <Icon className="w-3 h-3" />
                    {s.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
