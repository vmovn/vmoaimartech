import { Brand } from "@/components/brand";
import { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { IntegrationProvider } from "@/lib/integrations/core";
import { useInstalledIntegrations } from "@/lib/integrations/installed-store";

export function DisconnectIntegrationDialog({
  provider, open, onOpenChange, onConfirmed,
}: {
  provider: IntegrationProvider | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirmed?: () => void;
}) {
  const { remove } = useInstalledIntegrations();
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  if (!provider) return null;

  const confirm = () => {
    remove(provider.id, reason || undefined);
    toast.success(`${provider.name} disconnected`, {
      description: reason ? `Reason: ${reason}` : undefined,
    });
    setReason("");
    setAcknowledged(false);
    onOpenChange(false);
    onConfirmed?.();
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) { setReason(""); setAcknowledged(false); } onOpenChange(o); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Disconnect {provider.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This revokes <Brand />'s access to {provider.vendor} and stops syncing data.
            Workflows or agents using {provider.name} will pause until it's reconnected.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 text-sm">
          <div>
            <Label htmlFor="disconnect-reason" className="text-xs">
              Reason (optional, for audit trail)
            </Label>
            <Textarea
              id="disconnect-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Rotating credentials, switching providers, no longer needed…"
            />
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox checked={acknowledged} onCheckedChange={(v) => setAcknowledged(v === true)} className="mt-0.5" />
            <span className="text-xs">
              I understand that connected workflows and automations may stop working.
            </span>
          </label>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!acknowledged}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={confirm}
          >
            Disconnect
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
