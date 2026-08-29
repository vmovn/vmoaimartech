import * as React from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import * as Icons from "lucide-react";
import { NODE_REGISTRY_BY_TYPE } from "@/lib/workflows/node-registry";

export type WFNodeData = {
  type: string;
  label?: string;
  config: Record<string, unknown>;
  hasError?: boolean;
};

const KIND_STYLES: Record<string, string> = {
  trigger: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/40 text-emerald-600",
  action: "from-sky-500/20 to-sky-500/5 border-sky-500/40 text-sky-600",
  logic: "from-amber-500/20 to-amber-500/5 border-amber-500/40 text-amber-600",
  ai: "from-fuchsia-500/20 to-fuchsia-500/5 border-fuchsia-500/40 text-fuchsia-600",
};

export const CustomNode = React.memo(function CustomNode({ data, selected }: NodeProps<WFNodeData>) {
  const def = NODE_REGISTRY_BY_TYPE[data.type];
  const Icon = (def?.icon && (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[def.icon]) || Icons.Box;
  const kind = def?.kind ?? "action";
  const isTrigger = kind === "trigger";
  const tone = KIND_STYLES[kind];

  return (
    <div
      className={[
        "group relative w-[220px] rounded-xl border bg-surface shadow-sm transition-all duration-200",
        "hover:shadow-lg",
        selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg" : "",
        data.hasError ? "border-rose-500/60" : "border-border",
      ].join(" ")}
    >
      <div className={`absolute inset-x-0 -top-px h-1 rounded-t-xl bg-gradient-to-r ${tone.split(" ").filter(c=>c.startsWith("from-")||c.startsWith("to-")).join(" ")}`} />
      <div className="p-3 flex items-start gap-2.5">
        <div className={`w-8 h-8 rounded-lg grid place-items-center bg-gradient-to-br border ${tone}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{def?.category ?? kind}</div>
          <div className="text-sm font-semibold truncate">{data.label || def?.label || data.type}</div>
        </div>
      </div>
      {def?.inputs?.slice(0, 2).map((f) => {
        const v = data.config?.[f.key];
        if (v === undefined || v === null || v === "") return null;
        return (
          <div key={f.key} className="px-3 pb-1 text-[11px] text-muted-foreground truncate">
            <span className="font-medium text-foreground/80">{f.label}:</span> {String(v)}
          </div>
        );
      })}
      <div className="px-3 pb-2.5 text-[11px] text-muted-foreground/70 flex items-center gap-1">
        {data.hasError && <Icons.AlertCircle className="w-3 h-3 text-rose-500" />}
        <span className="truncate">{def?.description}</span>
      </div>

      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-primary !border-2 !border-background"
        />
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background"
      />
    </div>
  );
});
