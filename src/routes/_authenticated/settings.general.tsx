import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { APP_RELEASE_CHANNEL, APP_VERSION_LABEL } from "@/lib/app-version";
import { docsUrl } from "@/lib/docs/links";
import { useCurrentWorkspace, useUpdateWorkspace, useWorkspaceRole } from "@/hooks/use-workspace";
import { useBrandName } from "@/hooks/use-brand-name";


export const Route = createFileRoute("/_authenticated/settings/general")({
  component: GeneralSettings,
  head: () => ({
    meta: [
      { title: "General Settings — Workspace" },
      { name: "description", content: "Manage workspace name, description, avatar, and notification preferences." },
    ],
  }),
});

function GeneralSettings() {
  const brandName = useBrandName();
  const { data: ws } = useCurrentWorkspace();
  const { data: role } = useWorkspaceRole(ws?.id);
  const canEdit = role === "owner" || role === "admin";
  const update = useUpdateWorkspace(ws?.id);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [notifications, setNotifications] = useState(true);

  useEffect(() => {
    if (!ws) return;
    setName(ws.name ?? "");
    setDescription(ws.description ?? "");
    setAvatarUrl(ws.avatar_url ?? "");
    setNotifications(ws.notifications_enabled);
  }, [ws]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!ws) return;
    if (!name.trim()) { toast.error("Workspace name is required"); return; }
    try {
      await update.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        notifications_enabled: notifications,
      });
      toast.success("Workspace saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <>
      <AppTopbar title="General" subtitle="Workspace details and preferences" />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
            <CardDescription>Basic details about this workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSave} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Workspace name</Label>
                <Input id="name" value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} required maxLength={80} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="slug">Slug</Label>
                <Input id="slug" value={ws?.slug ?? ""} disabled />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="desc">Description</Label>
                <Textarea id="desc" value={description} disabled={!canEdit} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="avatar">Logo URL</Label>
                <Input id="avatar" type="url" value={avatarUrl} disabled={!canEdit} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label htmlFor="notif" className="text-sm">Workspace notifications</Label>
                  <p className="text-xs text-muted-foreground">Send activity emails to workspace members.</p>
                </div>
                <Switch id="notif" checked={notifications} disabled={!canEdit} onCheckedChange={setNotifications} />
              </div>
              <div className="grid gap-2">
                <Label>Plan</Label>
                <Input value={ws?.plan ?? "free"} disabled className="capitalize" />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={!canEdit || update.isPending}>
                  {update.isPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
              {!canEdit && (
                <p className="text-xs text-muted-foreground">Only owners and admins can edit workspace details.</p>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>About {brandName}</CardTitle>
            <CardDescription>Release information for this installation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-muted-foreground">Version</span>
              <span className="flex items-center gap-2 font-medium">
                {APP_VERSION_LABEL}
                <Badge variant="secondary">{APP_RELEASE_CHANNEL}</Badge>
              </span>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-muted-foreground">Product</span>
              <span className="font-medium">{brandName} — Omnichannel CRM</span>
            </div>
            <div className="pt-1">
              <Button asChild variant="outline" size="sm">
                <a href="/api/public/changelog.pdf" download>
                  <Download className="h-4 w-4" />
                  Download release notes (PDF)
                </a>
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <a className="text-accent hover:underline" href={docsUrl()} target="_blank" rel="noopener">Documentation</a>
              <a className="text-accent hover:underline" href={docsUrl("changelog")} target="_blank" rel="noopener">Changelog</a>
              <a className="text-accent hover:underline" href={docsUrl("status")} target="_blank" rel="noopener">System status</a>
              <a className="text-accent hover:underline" href={docsUrl("support")} target="_blank" rel="noopener">Support</a>
            </div>

          </CardContent>
        </Card>
      </main>

    </>
  );
}
