import type { LucideIcon } from "lucide-react";
import { MessageCircle, Instagram, MessageSquare, Send, Mail, Phone, MessagesSquare, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChannelKey =
  | "whatsapp" | "instagram" | "messenger" | "telegram"
  | "email" | "sms" | "livechat" | "voice" | "web" | string;

const MAP: Record<string, { label: string; color: string; Icon: LucideIcon }> = {
  whatsapp:  { label: "WhatsApp",   color: "#25D366", Icon: MessageCircle },
  instagram: { label: "Instagram",  color: "#E4405F", Icon: Instagram },
  messenger: { label: "Messenger",  color: "#0084FF", Icon: MessageSquare },
  telegram:  { label: "Telegram",   color: "#26A5E4", Icon: Send },
  email:     { label: "Email",      color: "#A4161A", Icon: Mail },
  sms:       { label: "SMS",        color: "#F59E0B", Icon: MessagesSquare },
  livechat:  { label: "Live Chat",  color: "#6366F1", Icon: Globe },
  voice:     { label: "Voice",      color: "#0F766E", Icon: Phone },
  web:       { label: "Web",        color: "#64748B", Icon: Globe },
};

export function channelMeta(key?: string | null) {
  const k = (key ?? "").toLowerCase();
  return MAP[k] ?? { label: key ?? "Unknown", color: "#64748B", Icon: Globe };
}

export function ChannelIcon({
  channel,
  className,
  iconClassName,
  withDot = false,
}: {
  channel?: string | null;
  className?: string;
  iconClassName?: string;
  withDot?: boolean;
}) {
  const { Icon, color, label } = channelMeta(channel);
  return (
    <span className={cn("inline-flex items-center justify-center", className)} title={label} aria-label={label}>
      {withDot && <span className="h-1.5 w-1.5 rounded-full mr-1" style={{ background: color }} />}
      <Icon className={cn("h-3.5 w-3.5", iconClassName)} style={{ color }} />
    </span>
  );
}
