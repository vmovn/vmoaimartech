/**
 * Compact handoff toolbar for the conversation header:
 *  - State badge (AI / Agent / Queued)
 *  - "Take Over" button when AI is handling
 *  - "Resume AI" button when a human owns the conversation
 *  - "Transfer" opens the HandoffDialog
 */
import { useState } from "react";
import { Bot, Hand, ArrowRightLeft, Loader2, PlayCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HandoffDialog } from "./handoff-dialog";
import { useTakeOver, useResumeAi } from "@/hooks/use-handoff";

type HandoffState = "ai" | "human" | "queued";

type Props = {
  conversationId: string;
  handoffState: HandoffState;
  aiEnabled: boolean;
  className?: string;
};

export function HandoffToolbar({ conversationId, handoffState, aiEnabled, className }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const takeOver = useTakeOver(conversationId);
  const resume = useResumeAi(conversationId);

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
      {handoffState === "ai" ? (
        <Badge variant="secondary" className="gap-1"><Bot className="h-3 w-3" /> AI</Badge>
      ) : handoffState === "queued" ? (
        <Badge variant="outline" className="gap-1"><Users className="h-3 w-3" /> Queued</Badge>
      ) : (
        <Badge variant="default" className="gap-1"><Hand className="h-3 w-3" /> Human</Badge>
      )}

      {handoffState !== "human" ? (
        <Button
          size="icon"
          variant="outline"
          onClick={() => takeOver.mutate()}
          disabled={takeOver.isPending}
          aria-label="Take Over"
        >
          {takeOver.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hand className="h-3.5 w-3.5" />}
        </Button>
      ) : (
        !aiEnabled ? null : (
          <Button
            size="icon"
            variant="outline"
            onClick={() => resume.mutate(undefined)}
            disabled={resume.isPending}
            aria-label="Resume AI"
          >
            {resume.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
          </Button>
        )
      )}

      <Button size="icon" variant="outline" onClick={() => setDialogOpen(true)} aria-label="Transfer">
        <ArrowRightLeft className="h-3.5 w-3.5" />
      </Button>

      <HandoffDialog
        conversationId={conversationId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
