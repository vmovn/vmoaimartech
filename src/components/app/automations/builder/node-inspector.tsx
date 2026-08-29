import * as React from "react";
import { X, Copy, Trash2 } from "lucide-react";
import { NODE_REGISTRY_BY_TYPE, type FieldSchema } from "@/lib/workflows/node-registry";
import type { WorkflowNode } from "@/lib/workflows/types";

export function NodeInspector({
  node,
  onChange,
  onClose,
  onDelete,
  onDuplicate,
  readOnly = false,
  readOnlyReason,
}: {
  node: WorkflowNode;
  onChange: (patch: Partial<WorkflowNode>) => void;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  /** When true every field and destructive action is inert. */
  readOnly?: boolean;
  readOnlyReason?: string;
}) {
  const def = NODE_REGISTRY_BY_TYPE[node.type];
  if (!def) return null;

  const setField = (key: string, value: unknown) =>
    onChange({ config: { ...node.config, [key]: value } });

  return (
    <aside className="w-80 shrink-0 border-l border-border bg-surface flex flex-col h-full animate-slide-in-right">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{def.category}</div>
          <div className="text-sm font-semibold truncate">{def.label}</div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted" aria-label="Close inspector">
          <X className="w-4 h-4" />
        </button>
      </div>
      {readOnly && readOnlyReason ? (
        <p
          data-testid="inspector-readonly-note"
          className="px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 border-b border-amber-500/30"
        >
          {readOnlyReason}
        </p>
      ) : null}
      <fieldset
        disabled={readOnly}
        className="flex-1 min-h-0 flex flex-col disabled:opacity-100"
        aria-disabled={readOnly}
      >
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Label</label>
            <input
              value={node.label ?? ""}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder={def.label}
              className="mt-1 w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
          {(def.inputs ?? []).map((f) => (
            <FieldEditor key={f.key} field={f} value={node.config?.[f.key]} onChange={(v) => setField(f.key, v)} />
          ))}
          {(def.inputs?.length ?? 0) === 0 && (
            <div className="text-xs text-muted-foreground italic">No configuration for this node.</div>
          )}
        </div>
        <div className="p-3 border-t border-border flex gap-2">
          <button
            onClick={onDuplicate}
            title={readOnly ? readOnlyReason : undefined}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-surface text-xs hover:bg-muted transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Copy className="w-3.5 h-3.5" /> Duplicate
          </button>
          <button
            onClick={onDelete}
            title={readOnly ? readOnlyReason : undefined}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 text-rose-600 text-xs hover:bg-rose-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </fieldset>
    </aside>
  );
}


function FieldEditor({ field, value, onChange }: { field: FieldSchema; value: unknown; onChange: (v: unknown) => void }) {
  const label = (
    <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
      {field.label}
      {field.required && <span className="text-rose-500">*</span>}
    </label>
  );
  const cls = "mt-1 w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30";
  const str = value == null ? "" : String(value);

  const control = (() => {
    switch (field.type) {
      case "textarea":
      case "json":
        return (
          <textarea
            value={str}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            rows={field.type === "json" ? 5 : 3}
            className={`${cls} font-mono resize-y`}
          />
        );
      case "number":
        return (
          <input
            type="number"
            value={str}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder={field.placeholder}
            className={cls}
          />
        );
      case "boolean":
        return (
          <label className="mt-1 inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
            <span>{field.helpText ?? "Enabled"}</span>
          </label>
        );
      case "select":
        return (
          <select value={str} onChange={(e) => onChange(e.target.value)} className={cls}>
            <option value="">Select…</option>
            {field.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
      default:
        return (
          <input value={str} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} className={cls} />
        );
    }
  })();

  return (
    <div>
      {label}
      {control}
      {field.helpText && field.type !== "boolean" && (
        <div className="mt-1 text-[11px] text-muted-foreground">{field.helpText}</div>
      )}
    </div>
  );
}
