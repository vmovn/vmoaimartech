import {
  MessageCircle,
  Instagram,
  Facebook,
  Send,
  Mail,
  Phone,
  MessageSquare,
  Globe,
  ChevronDown,
  Check,
  Star,
  Flag,
  Shield,
  Clock,
  AlertTriangle,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useChannelSwitcher, type ChannelOption } from "@/hooks/use-channel-switcher";
import type { ConversationRow, InboxChannel } from "@/hooks/use-conversations";

const ICONS: Record<InboxChannel, typeof MessageCircle> = {
  whatsapp: MessageCircle,
  instagram: Instagram,
  messenger: Facebook,
  telegram: Send,
  email: Mail,
  sms: MessageSquare,
  webchat: Globe,
  voice: Phone,
  other: MessageCircle,
};

function ChannelIcon({ channel, className }: { channel: InboxChannel; className?: string }) {
  const Icon = ICONS[channel] ?? MessageCircle;
  return <Icon className={className} />;
}

function StatusDot({ status }: { status: ChannelOption["status"] }) {
  const cls =
    status === "active"
      ? "bg-emerald-500"
      : status === "degraded"
      ? "bg-amber-500"
      : status === "unavailable"
      ? "bg-destructive"
      : "bg-muted-foreground/50";
  return <span className={cn("inline-block h-1.5 w-1.5 rounded-full", cls)} aria-hidden />;
}

type Props = {
  conversation: ConversationRow;
  align?: "start" | "end";
  className?: string;
};

/**
 * Channel Switcher — lets an agent reply via any linked channel for the contact,
 * all inside the same conversation. Displays availability, verified state,
 * last-used, preferred / primary / fallback markers, and suggests a fallback
 * automatically when the current channel is failing.
 */
export function ChannelSwitcher({ conversation, align = "start", className }: Props) {
  const {
    options,
    currentChannel,
    hasFailure,
    suggestedFallback,
    switchChannel,
    setChannelRole,
    isLoading,
  } = useChannelSwitcher(conversation);

  const current = options.find((o) => o.isCurrent);

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("flex items-center gap-1.5", className)}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 rounded-sm px-2.5"
              aria-label="Switch channel"
              disabled={isLoading}
            >
              {currentChannel ? (
                <>
                  <ChannelIcon channel={currentChannel} className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">{current?.label ?? currentChannel}</span>
                  {current && <StatusDot status={current.status} />}
                </>
              ) : (
                <span className="text-xs">Channel</span>
              )}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align={align} className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Reply via</span>
              <span className="text-[11px] font-normal text-muted-foreground">
                {options.filter((o) => o.canReply).length} available
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {options.length === 0 && (
              <div className="px-2 py-4 text-xs text-muted-foreground">
                No linked channels yet.
              </div>
            )}

            {options.map((opt) => (
              <ChannelRow
                key={opt.channel}
                opt={opt}
                onSelect={() => !opt.isCurrent && opt.canReply && switchChannel.mutate(opt)}
                onRole={(role) => setChannelRole.mutate({ role, channel: opt.channel })}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {hasFailure && suggestedFallback && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                className="h-9 gap-1.5 rounded-sm px-2.5 animate-fade-in"
                onClick={() => switchChannel.mutate(suggestedFallback)}
              >
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs">Try {suggestedFallback.label}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-[220px]">
              Current channel is failing. Retry the message on {suggestedFallback.label}.
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

function ChannelRow({
  opt,
  onSelect,
  onRole,
}: {
  opt: ChannelOption;
  onSelect: () => void;
  onRole: (role: "preferred" | "primary" | "fallback") => void;
}) {
  const disabled = !opt.canReply && !opt.isCurrent;

  return (
    <div
      className={cn(
        "flex items-start gap-2 px-2 py-2 rounded-sm",
        !disabled && "hover:bg-muted cursor-pointer",
        opt.isCurrent && "bg-muted/60"
      )}
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onSelect}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="mt-0.5 h-7 w-7 grid place-items-center rounded-sm bg-background border border-border">
        <ChannelIcon channel={opt.channel} className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium truncate">{opt.label}</span>
          <StatusDot status={opt.status} />
          {opt.isCurrent && <Badge variant="secondary" className="h-4 px-1 text-[11px]">Active</Badge>}
          {opt.isPreferred && (
            <Badge variant="outline" className="h-4 px-1 text-[11px] gap-0.5">
              <Star className="h-2.5 w-2.5" /> Preferred
            </Badge>
          )}
          {opt.isPrimary && !opt.isCurrent && (
            <Badge variant="outline" className="h-4 px-1 text-[11px] gap-0.5">
              <Shield className="h-2.5 w-2.5" /> Primary
            </Badge>
          )}
          {opt.isFallback && (
            <Badge variant="outline" className="h-4 px-1 text-[11px] gap-0.5">
              <Flag className="h-2.5 w-2.5" /> Fallback
            </Badge>
          )}
          {opt.isLastUsed && !opt.isCurrent && (
            <Badge variant="outline" className="h-4 px-1 text-[11px] gap-0.5">
              <Clock className="h-2.5 w-2.5" /> Last used
            </Badge>
          )}
          {opt.verified && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Check className="h-3 w-3 text-emerald-500" aria-label="Verified identity" />
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Verified identity</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground truncate mt-0.5">
          {opt.externalId && <span className="mr-2">{opt.externalId}</span>}
          {opt.lastUsedAt && (
            <span>Last reply {formatDistanceToNow(new Date(opt.lastUsedAt), { addSuffix: true })}</span>
          )}
          {!opt.canReply && !opt.hasAccount && <span>No connected account</span>}
          {opt.statusReason && opt.status !== "active" && (
            <span className="ml-1 text-amber-600">· {opt.statusReason}</span>
          )}
        </div>
      </div>

      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          className="h-6 w-6 p-0 grid place-items-center rounded"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRole("preferred"); }}>
            <Star className="h-3.5 w-3.5" /> Mark as preferred
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRole("primary"); }}>
            <Shield className="h-3.5 w-3.5" /> Set as primary
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRole("fallback"); }}>
            <Flag className="h-3.5 w-3.5" /> Set as fallback
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </div>
  );
}
