import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAcceptInvitation, useInvitationByToken } from "@/hooks/use-workspace";

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const { data: inv, isLoading } = useInvitationByToken(token);
  const accept = useAcceptInvitation();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAuthed(!!s?.user));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onAccept() {
    try {
      await accept.mutateAsync(token);
      toast.success("Welcome to the workspace!");
      navigate({ to: "/dashboard" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not accept invitation");
    }
  }

  return (
    <main className="min-h-screen grid place-items-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-lg">
        {isLoading || authed === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading invitation…
          </div>
        ) : !inv ? (
          <Empty title="Invitation not found" desc="This link is invalid or has been removed." />
        ) : inv.status !== "pending" ? (
          <Empty title={`Invitation ${inv.status}`} desc={`This invitation is ${inv.status} and can no longer be used.`} />
        ) : new Date(inv.expires_at) < new Date() ? (
          <Empty title="Invitation expired" desc="Ask the workspace owner for a fresh invitation link." />
        ) : (
          <div className="space-y-5 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-xl bg-gradient-accent text-2xl font-display font-semibold text-accent-foreground">
              {inv.workspace?.name?.slice(0, 1).toUpperCase() ?? "W"}
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold">Join {inv.workspace?.name ?? "workspace"}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                You've been invited to join as <span className="font-medium">{inv.role}</span>.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Invited email: {inv.email}</p>
            </div>
            {authed ? (
              <Button onClick={onAccept} disabled={accept.isPending} className="w-full">
                {accept.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Accept invitation
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Sign in to accept this invitation.</p>
                <Button asChild className="w-full">
                  <Link to="/auth" search={{ redirect: `/invite/${token}` } as never}>Sign in to accept</Link>
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function Empty({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="text-center space-y-3">
      <XCircle className="mx-auto h-10 w-10 text-muted-foreground" />
      <h1 className="font-display text-lg font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{desc}</p>
      <Button asChild variant="outline"><Link to="/">Back to home</Link></Button>
      <CheckCircle2 className="hidden" />
    </div>
  );
}
