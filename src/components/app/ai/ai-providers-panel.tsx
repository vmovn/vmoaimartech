import { useState } from "react";
import {
  CheckCircle2, KeyRound, Loader2, Plus, RefreshCw, Trash2, Unplug,
} from "lucide-react";
import { toast } from "sonner";
import { useCurrentWorkspace, useWorkspaceRole } from "@/hooks/use-workspace";
import {
  useAIProviders, useDeleteAIProvider, useRemoveAIProviderCredential,
  useSyncAIProviderModels, useTestAIProvider, useUpsertAIProvider,
} from "@/hooks/use-ai-providers";
import type { AIProviderRow } from "@/lib/ai/config.functions";
import type { AIProviderKind } from "@/lib/ai/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const BYOK_KINDS: { id: AIProviderKind; label: string }[] = [
  { id: "gemini", label: "Google Gemini" },
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "custom_openai", label: "Custom OpenAI-compatible" },
];

function kindLabel(kind: string): string {
  return BYOK_KINDS.find((k) => k.id === kind)?.label ?? kind;
}

type Draft = {
  id?: string;
  kind: AIProviderKind;
  name: string;
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  isDefault: boolean;
  platformManaged: boolean;
  hasCredential: boolean;
  last4: string | null;
  priority: number;
};

function emptyDraft(): Draft {
  return {
    kind: "gemini",
    name: "Google Gemini",
    apiKey: "",
    baseUrl: "",
    enabled: true,
    isDefault: false,
    platformManaged: false,
    hasCredential: false,
    last4: null,
    priority: 100,
  };
}

function fromRow(p: AIProviderRow): Draft {
  return {
    id: p.id,
    kind: p.kind,
    name: p.name,
    apiKey: "",
    baseUrl: p.base_url ?? "",
    enabled: p.enabled,
    isDefault: p.is_default,
    platformManaged: Boolean(p.platform_managed),
    hasCredential: Boolean(p.has_credential),
    last4: p.credential_last4 ?? null,
    priority: p.priority ?? 100,
  };
}

export function AiProvidersPanel() {
  const ws = useCurrentWorkspace();
  const workspaceId = ws.data?.id;
  const roleQ = useWorkspaceRole(workspaceId);
  const canManage = roleQ.data === "owner" || roleQ.data === "admin";
  const providersQ = useAIProviders();
  const upsert = useUpsertAIProvider();
  const remove = useDeleteAIProvider();
  const removeKey = useRemoveAIProviderCredential();
  const test = useTestAIProvider();
  const sync = useSyncAIProviderModels();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AIProviderRow | null>(null);
  const [confirmRemoveKey, setConfirmRemoveKey] = useState<AIProviderRow | null>(null);

  const rows = providersQ.data ?? [];

  async function onSave() {
    if (!draft) return;
    try {
      await upsert.mutateAsync({
        id: draft.id,
        kind: draft.kind,
        name: draft.name.trim() || kindLabel(draft.kind),
        baseUrl: draft.baseUrl.trim() || null,
        enabled: draft.enabled,
        isDefault: draft.isDefault,
        priority: draft.priority,
        apiKey: draft.apiKey.trim() || undefined,
        config: {},
      });
      toast.success(draft.id ? "Provider saved" : "Provider added");
      setDraft(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function onTest() {
    if (!draft) return;
    const key = draft.apiKey.trim();
    try {
      const result = await test.mutateAsync({
        id: draft.id,
        kind: draft.kind,
        name: draft.name,
        apiKey: key || undefined,
        baseUrl: draft.baseUrl.trim() || null,
      });
      if (result.ok) toast.success(`Connected (${result.latency_ms} ms)`);
      else toast.error(result.error || "Connection failed");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm">AI providers</h3>
          <p className="text-sm text-muted-foreground">
            Connect Gemini, OpenAI, DeepSeek and other keys for this workspace. Keys are encrypted and never shown again.
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setDraft(emptyDraft())}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add provider
          </Button>
        )}
      </div>

      <div className="grid gap-3">
        {providersQ.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading providers…
          </div>
        )}
        {rows.map((p) => (
          <div key={p.id} className="rounded-md border border-border p-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-sm">{p.platform_managed ? "Platform Local AI" : p.name}</span>
                <Badge variant="outline">{kindLabel(p.kind)}</Badge>
                {p.is_default && <Badge>Default</Badge>}
                {!p.enabled && <Badge variant="secondary">Disabled</Badge>}
                {p.platform_managed && <Badge variant="secondary">Platform</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                {p.credential_source === "keyless"
                  ? "No API key required"
                  : p.has_credential
                    ? (canManage && p.credential_last4
                      ? `Connected · key ending •••• ${p.credential_last4}`
                      : "Connected")
                    : p.credential_source === "platform_env"
                      ? "Platform environment credential"
                      : "No API key saved"}
              </p>
            </div>
            {canManage && (
              <div className="flex flex-wrap gap-2">
                {!p.platform_managed && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => sync.mutate(p.id)} disabled={sync.isPending}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Sync models
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDraft(fromRow(p))}>
                      <KeyRound className="h-3.5 w-3.5 mr-1.5" /> Edit
                    </Button>
                    {p.has_credential && p.credential_source === "workspace_encrypted" && (
                      <Button variant="ghost" size="sm" onClick={() => setConfirmRemoveKey(p)}>
                        <Unplug className="h-3.5 w-3.5 mr-1.5" /> Remove key
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(p)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {!providersQ.isLoading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No providers in this workspace yet.</p>
        )}
      </div>

      <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open) setDraft(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit provider" : "Add provider"}</DialogTitle>
            <DialogDescription>
              Paste an API key to test and save. The key is never shown again after save.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Provider</Label>
                <Select
                  value={draft.kind}
                  disabled={Boolean(draft.id) || draft.platformManaged}
                  onValueChange={(v) => {
                    const kind = v as AIProviderKind;
                    setDraft({
                      ...draft,
                      kind,
                      name: draft.id ? draft.name : kindLabel(kind),
                    });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BYOK_KINDS.map((k) => (
                      <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={draft.name}
                  disabled={draft.platformManaged}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              {draft.kind === "custom_openai" && (
                <div className="space-y-1.5">
                  <Label>Base URL</Label>
                  <Input
                    value={draft.baseUrl}
                    placeholder="https://api.example.com/v1"
                    onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
                  />
                </div>
              )}
              {!draft.platformManaged && (
                <div className="space-y-1.5">
                  <Label>API key</Label>
                  {draft.hasCredential && draft.last4 && !draft.apiKey && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Connected · key ending •••• {draft.last4}. Leave blank to keep.
                    </p>
                  )}
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder={draft.hasCredential ? "Paste a new key to replace" : "Paste API key"}
                    value={draft.apiKey}
                    onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
                  />
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="ai-prov-enabled">Enabled</Label>
                <Switch
                  id="ai-prov-enabled"
                  checked={draft.enabled}
                  onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
                />
              </div>
              {!draft.platformManaged && (
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="ai-prov-default">Set as workspace default</Label>
                  <Switch
                    id="ai-prov-default"
                    checked={draft.isDefault}
                    onCheckedChange={(v) => setDraft({ ...draft, isDefault: v })}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => void onTest()} disabled={test.isPending || !draft}>
              {test.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              Test connection
            </Button>
            <Button onClick={() => void onSave()} disabled={upsert.isPending || !draft || draft.platformManaged}>
              {upsert.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(confirmDelete)} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this provider?</AlertDialogTitle>
            <AlertDialogDescription>
              The encrypted key is removed with the provider. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmDelete) return;
                remove.mutate(confirmDelete.id, {
                  onSuccess: () => toast.success("Provider deleted"),
                  onError: (e) => toast.error(e.message),
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(confirmRemoveKey)} onOpenChange={(o) => { if (!o) setConfirmRemoveKey(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the saved API key?</AlertDialogTitle>
            <AlertDialogDescription>
              The provider stays, but it cannot call the vendor until you save a new key.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmRemoveKey) return;
                removeKey.mutate(confirmRemoveKey.id, {
                  onSuccess: () => toast.success("API key removed"),
                  onError: (e) => toast.error(e.message),
                });
              }}
            >
              Remove key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
