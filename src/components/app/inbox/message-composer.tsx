import { useCallback, useEffect, useRef, useState } from "react";
import {
  Paperclip,
  Send,
  Smile,
  Image as ImageIcon,
  FileText,
  ClipboardList,
  MapPin,
  User as UserIcon,
  Mic,
  Square,
  X,
  Reply as ReplyIcon,
  Zap,
  Clock,
  CalendarClock,
  ChevronDown,
  Keyboard,
  BookOpen,
  Command as CommandIcon,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useSendMessage,
  useBroadcastTyping,
  uploadAttachment,
  type MessageRow,
  type MessageMetadata,
} from "@/hooks/use-messages";
import type { InboxChannel } from "@/hooks/use-conversations";
import { channelCan, channelLabel } from "@/lib/inbox/channel-capabilities";
import type { TemplateSendPayload } from "@/lib/messaging/template-send-payload";

import {
  useMessageDraft,
  useSaveDraft,
  useMessageTemplates,
  useScheduledMessages,
  useRegisterTemplateUsage,
  renderTemplate,
  type MessageTemplate,
} from "@/hooks/use-productivity";
import { useAuth } from "@/hooks/use-auth";
import { TemplatePicker } from "@/components/app/inbox/template-picker";
import { WhatsAppFormPicker } from "@/components/app/inbox/whatsapp-form-picker";
import { useContact } from "@/hooks/use-contacts";
import { AIReplyAssistant } from "@/components/app/inbox/ai-reply-assistant";
import { TemplateManager } from "@/components/app/inbox/template-manager";
import { ScheduleDialog } from "@/components/app/inbox/schedule-dialog";
import { EmojiPicker } from "@/components/app/inbox/emoji-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useContactSearch,
  useCreateWorkspaceContact,
  type ContactSearchResult,
} from "@/hooks/use-contact-linking";
import { normalizePhone } from "@/lib/inbox/contact-display";
import { digitsOnly } from "@/lib/messaging/phone-matching";

/* -------------------------------------------------------------------------- */

type PrefillSource = "attachment" | "recipient";
type ContactPrefill = {
  name?: string;
  phone?: string;
  email?: string;
  source?: PrefillSource;
  existingContactId?: string | null;
};

type Props = {
  conversationId: string;
  workspaceId: string;
  replyTo: MessageRow | null;
  onClearReply: () => void;
  disabled?: boolean;
  /** Channel of the conversation — gates unsupported composer affordances. */
  channel?: InboxChannel;
  /** Prefill candidates for the "Share contact" modal, highest priority first. */
  contactPrefill?: ContactPrefill[];
  /** CRM contact linked to the conversation — powers template auto-suggest. */
  contactId?: string | null;
};

const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const mod = IS_MAC ? "⌘" : "Ctrl";

export function MessageComposer({
  conversationId,
  workspaceId,
  replyTo,
  onClearReply,
  disabled,
  channel,
  contactPrefill,
  contactId,
}: Props) {
  const can = (cap: Parameters<typeof channelCan>[1]) => channelCan(channel, cap);

  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [formPickerOpen, setFormPickerOpen] = useState(false);
  const [pickerSeed, setPickerSeed] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", phone: "", email: "" });
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [dupeQuery, setDupeQuery] = useState("");
  const [linkedContactId, setLinkedContactId] = useState<string | null>(null);
  const [dupeDismissed, setDupeDismissed] = useState(false);
  const [prefillIdx, setPrefillIdx] = useState<number>(-1);

  const send = useSendMessage();
  const createContact = useCreateWorkspaceContact(workspaceId);
  const broadcastTyping = useBroadcastTyping(conversationId);
  const { user } = useAuth();
  const { data: draft } = useMessageDraft(conversationId);
  const saveDraft = useSaveDraft();
  const { data: templates = [] } = useMessageTemplates();
  const { data: scheduledPending = [] } = useScheduledMessages(conversationId);
  const registerUsage = useRegisterTemplateUsage();
  const { data: crmContact } = useContact(contactId ?? undefined);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const draftLoadedRef = useRef<string | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* --------------------------- Focus / autosize --------------------------- */

  useEffect(() => {
    textareaRef.current?.focus();
  }, [conversationId, replyTo?.id]);

  // External focus request (keyboard shortcut "r")
  useEffect(() => {
    const onFocus = () => {
      requestAnimationFrame(() => textareaRef.current?.focus());
    };
    window.addEventListener("inbox:focus-composer", onFocus);
    return () => window.removeEventListener("inbox:focus-composer", onFocus);
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 208)}px`;
  }, [text]);

  /* -------------------------------- Drafts -------------------------------- */

  // Load draft when switching conversations
  useEffect(() => {
    if (draftLoadedRef.current === conversationId) return;
    if (draft === undefined) return; // still loading
    draftLoadedRef.current = conversationId;
    setText(draft?.body ?? "");
  }, [conversationId, draft]);

  // Debounced autosave
  useEffect(() => {
    if (draftLoadedRef.current !== conversationId) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      saveDraft.mutate({ conversation_id: conversationId, body: text });
    }, 700);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, conversationId]);

  /* --------------------------- Template resolution ------------------------ */

  const contextVars = {
    agent_name: user?.email?.split("@")[0] ?? "there",
  };

  const applyTemplate = useCallback(
    (rendered: string, template?: MessageTemplate) => {
      setText((t) => (t.trim().length === 0 ? rendered : `${t.trim()} ${rendered}`));
      if (template) registerUsage.mutate(template);
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [registerUsage],
  );

  /** One-click: send a template straight to the conversation. */
  const sendTemplateNow = useCallback(
    async (rendered: string, template: MessageTemplate, payload?: TemplateSendPayload) => {
      const body = rendered.trim();
      if (!body) return;
      onClearReply();
      try {
        const metadata: MessageMetadata = payload
          ? {
              template_name: payload.name,
              template_language: payload.language,
              template_components: payload.components,
            }
          : {};
        await send.mutateAsync({
          conversationId,
          body,
          messageType: payload ? "template" : "text",
          replyToId: replyTo?.id ?? null,
          metadata,
        });
        saveDraft.mutate({ conversation_id: conversationId, body: "" });
      } catch (e) {
        toast.error("Could not send template", {
          description: String((e as Error).message),
        });
        applyTemplate(rendered);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationId, replyTo?.id, send, saveDraft, onClearReply, applyTemplate],
  );


  // Slash-command inline: if the user types /shortcut and hits space or enter, expand
  const tryExpandShortcut = useCallback((): boolean => {
    const match = text.match(/(^|\s)\/([a-z0-9_-]{1,32})$/i);
    if (!match) return false;
    const shortcut = match[2].toLowerCase();
    const found = templates.find(
      (t) => t.shortcut && t.shortcut.toLowerCase() === shortcut,
    );
    if (!found) return false;
    const rendered = renderTemplate(found.body, contextVars);
    const before = text.slice(0, match.index! + match[1].length);
    setText(before + rendered);
    registerUsage.mutate(found);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, templates]);

  /* -------------------------------- Submit -------------------------------- */

  const submit = async () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    void broadcastTyping.stop();
    onClearReply();
    try {
      await send.mutateAsync({
        conversationId,
        body,
        messageType: "text",
        replyToId: replyTo?.id ?? null,
      });
      // Clear draft after send
      saveDraft.mutate({ conversation_id: conversationId, body: "" });
    } catch (e) {
      toast.error("Could not send", { description: String((e as Error).message) });
    }
  };

  /* --------------------------- Keyboard shortcuts ------------------------- */

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const meta = e.metaKey || e.ctrlKey;

    // Cmd/Ctrl + K → open template picker
    if (meta && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      setPickerSeed("");
      setPickerOpen(true);
      return;
    }
    // Cmd/Ctrl + Shift + S → schedule
    if (meta && e.shiftKey && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      if (text.trim()) setScheduleOpen(true);
      return;
    }
    // Cmd/Ctrl + / → help
    if (meta && e.key === "/") {
      e.preventDefault();
      setHelpOpen(true);
      return;
    }
    // Escape → clear reply
    if (e.key === "Escape" && replyTo) {
      e.preventDefault();
      onClearReply();
      return;
    }
    // Space or Enter — try to expand /shortcut
    if ((e.key === " " || (e.key === "Enter" && !e.shiftKey))) {
      if (tryExpandShortcut()) {
        e.preventDefault();
        return;
      }
    }
    // Enter (no shift) → send. Shift+Enter → newline. Cmd/Ctrl+Enter → send.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  // Watch text for the slash marker to open picker as user types "/"
  useEffect(() => {
    const m = text.match(/(^|\s)\/([a-z0-9_-]{0,32})$/i);
    if (m && m[2].length === 0) {
      // User just typed a bare "/" — show hint via inline suggestion; opening dialog is aggressive.
      // Only auto-open on explicit shortcut command via Cmd+K. So do nothing here.
    }
  }, [text]);

  /* -------------------------------- Uploads ------------------------------- */

  const handleUpload = async (
    filesOrFile: FileList | File | null,
    kind: "image" | "video" | "audio" | "document",
  ) => {
    let file: File | null = null;
    if (filesOrFile instanceof File) file = filesOrFile;
    else if (filesOrFile && filesOrFile.length > 0) file = filesOrFile[0];
    if (!file) return;

    setUploading(true);
    try {
      const { url, size, type, path } = await uploadAttachment(
        workspaceId,
        conversationId,
        file,
        file.name,
      );
      const messageType =
        kind === "image" && type.startsWith("image/")
          ? "image"
          : kind === "video" || type.startsWith("video/")
            ? "video"
            : kind === "audio" || type.startsWith("audio/")
              ? "audio"
              : "document";
      await send.mutateAsync({
        conversationId,
        body: kind === "document" ? file.name : text.trim() || undefined,
        messageType,
        mediaUrl: url,
        mediaType: type || null,
        mediaSize: size,
        replyToId: replyTo?.id ?? null,
        metadata: { media_path: path, media_name: file.name },
      });
      setText("");
      onClearReply();
    } catch (e) {
      toast.error("Upload failed", { description: String((e as Error).message) });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const kind = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("audio/")
          ? "audio"
          : "document";
    void handleUpload(file, kind);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const file = e.clipboardData.files?.[0];
    if (file) {
      e.preventDefault();
      const kind = file.type.startsWith("image/") ? "image" : "document";
      void handleUpload(file, kind);
    }
  };

  /* ------------------------------- Recording ------------------------------ */

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // WhatsApp accepts ogg/opus but not webm — prefer ogg where the browser
      // can produce it so voice notes play inline for the recipient.
      const preferred = ["audio/ogg;codecs=opus", "audio/ogg", "audio/mp4"].find(
        (m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m),
      );
      const rec = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
      const recMime = (rec.mimeType || preferred || "audio/webm").split(";")[0]!;
      const ext = recMime.includes("ogg") ? "ogg" : recMime.includes("mp4") ? "m4a" : "webm";
      const fileName = `voice-note.${ext}`;
      audioChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: recMime });
        setUploading(true);
        try {
          const { url, size, type, path } = await uploadAttachment(
            workspaceId,
            conversationId,
            blob,
            fileName,
          );
          await send.mutateAsync({
            conversationId,
            messageType: "audio",
            mediaUrl: url,
            mediaType: type || recMime,
            mediaSize: size,
            replyToId: replyTo?.id ?? null,
            metadata: { media_path: path, media_name: fileName },
          });
        } catch (e) {
          toast.error("Voice note failed", { description: String((e as Error).message) });
        } finally {
          setUploading(false);
        }
      };


      rec.start();
      mediaRecorderRef.current = rec;
      setIsRecording(true);
    } catch {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  };

  /* ------------------------------- Actions -------------------------------- */

  const shareLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const meta: MessageMetadata = {
          location: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            label: "Current location",
          },
        };
        await send.mutateAsync({
          conversationId,
          messageType: "location",
          metadata: meta,
          replyToId: replyTo?.id ?? null,
        });
        onClearReply();
      },
      () => toast.error("Could not get location"),
    );
  };

  const prefillCandidates = (contactPrefill ?? []).filter(
    (c): c is NonNullable<typeof c> => !!(c && (c.name || c.phone || c.email)),
  );

  const normalizePhoneInput = (raw: string | null | undefined): string => {
    if (!raw) return "";
    const trimmed = String(raw).trim();
    if (!trimmed) return "";
    return normalizePhone(trimmed) ?? trimmed;
  };

  const applyPrefill = (idx: number) => {
    const c = prefillCandidates[idx];
    if (!c) return;
    setPrefillIdx(idx);
    setContactForm({
      name: c.name ?? "",
      phone: normalizePhoneInput(c.phone),
      email: c.email ?? "",
    });
    // If this candidate references an existing CRM contact, auto-link to it
    // so the user sees exactly which record will be reused.
    setLinkedContactId(c.existingContactId ?? null);
    setDupeDismissed(false);
  };

  const contactDraftKey = `pmai:contact-draft:${conversationId}`;

  const readContactDraft = (): {
    name: string;
    phone: string;
    email: string;
    linkedContactId?: string | null;
  } | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(contactDraftKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const name = typeof parsed.name === "string" ? parsed.name : "";
      const phone = typeof parsed.phone === "string" ? parsed.phone : "";
      const email = typeof parsed.email === "string" ? parsed.email : "";
      if (!name && !phone && !email) return null;
      return {
        name,
        phone,
        email,
        linkedContactId:
          typeof parsed.linkedContactId === "string" ? parsed.linkedContactId : null,
      };
    } catch {
      return null;
    }
  };

  const clearContactDraft = () => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(contactDraftKey);
    } catch {
      /* ignore */
    }
  };

  const shareContact = () => {
    const draft = readContactDraft();
    if (draft) {
      setPrefillIdx(-1);
      setContactForm({
        name: draft.name,
        phone: draft.phone,
        email: draft.email,
      });
      setLinkedContactId(draft.linkedContactId ?? null);
      setDupeDismissed(false);
      setContactOpen(true);
      return;
    }
    const idx = prefillCandidates.length > 0 ? 0 : -1;
    const best = prefillCandidates[0];
    setPrefillIdx(idx);
    setContactForm({
      name: best?.name ?? "",
      phone: normalizePhoneInput(best?.phone),
      email: best?.email ?? "",
    });
    setLinkedContactId(null);
    setDupeDismissed(false);
    setContactOpen(true);
  };

  // Persist draft while modal is open so closing/reopening keeps values.
  useEffect(() => {
    if (!contactOpen) return;
    if (typeof window === "undefined") return;
    const { name, phone, email } = contactForm;
    if (!name && !phone && !email) {
      clearContactDraft();
      return;
    }
    try {
      window.localStorage.setItem(
        contactDraftKey,
        JSON.stringify({ name, phone, email, linkedContactId }),
      );
    } catch {
      /* quota / disabled — ignore */
    }
    // contactDraftKey/clearContactDraft are derived from conversationId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactOpen, contactForm, linkedContactId, conversationId]);

  // Debounce dupe query from phone/email
  useEffect(() => {
    if (!contactOpen) return;
    const phone = contactForm.phone.trim();
    const email = contactForm.email.trim();
    const key = email || phone;
    const t = setTimeout(() => setDupeQuery(key), 300);
    return () => clearTimeout(t);
  }, [contactForm.phone, contactForm.email, contactOpen]);

  // Reset debounced query + dismissed flag when the modal closes
  useEffect(() => {
    if (!contactOpen) {
      setDupeQuery("");
      setDupeDismissed(false);
      setLinkedContactId(null);
      setPrefillIdx(-1);
    }
  }, [contactOpen]);

  const dupeSearchEnabled = contactOpen && dupeQuery.length >= 3;
  const dupeSearch = useContactSearch(workspaceId, dupeQuery, dupeSearchEnabled);

  const dupeMatches: ContactSearchResult[] = (() => {
    if (!dupeSearchEnabled || !dupeSearch.data) return [];
    const phoneDigits = digitsOnly(contactForm.phone);
    const emailLower = contactForm.email.trim().toLowerCase();
    return dupeSearch.data.filter((c) => {
      if (c.id === linkedContactId) return false;
      if (emailLower && c.email && c.email.toLowerCase() === emailLower) return true;
      if (phoneDigits && phoneDigits.length >= 6) {
        const cp = digitsOnly(c.phone ?? "");
        const cw = digitsOnly(c.whatsapp ?? "");
        if (cp && (cp.endsWith(phoneDigits) || phoneDigits.endsWith(cp))) return true;
        if (cw && (cw.endsWith(phoneDigits) || phoneDigits.endsWith(cw))) return true;
      }
      return false;
    }).slice(0, 3);
  })();

  const useExistingContact = (c: ContactSearchResult) => {
    const displayName =
      c.display_name ||
      c.name ||
      [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
      "";
    setContactForm({
      name: displayName || contactForm.name,
      phone: c.phone || c.whatsapp || contactForm.phone,
      email: c.email || contactForm.email,
    });
    setLinkedContactId(c.id);
    setDupeDismissed(true);
  };



  const submitContact = async () => {
    const name = contactForm.name.trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    const phone = contactForm.phone.trim() || undefined;
    const email = contactForm.email.trim() || undefined;
    setContactSubmitting(true);
    try {
      // Persist a new contact to the workspace when not linked to an existing one.
      let contactId = linkedContactId;
      if (!contactId) {
        try {
          const [first_name, ...rest] = name.split(/\s+/);
          const last_name = rest.join(" ").trim() || null;
          const created = await createContact.mutateAsync({
            first_name: first_name || null,
            last_name,
            display_name: name,
            phone: phone ?? null,
            email: email ?? null,
          });
          contactId = created.id;
        } catch (persistErr) {
          // Non-fatal: still send the card even if persistence fails.
          console.warn("Failed to persist shared contact", persistErr);
        }
      }

      await send.mutateAsync({
        conversationId,
        messageType: "contact",
        body: name,
        metadata: {
          contact_card: { name, phone, email },
          ...(contactId ? { existing_contact_id: contactId } : {}),
        },
        replyToId: replyTo?.id ?? null,
      });
      onClearReply();
      clearContactDraft();
      setContactOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to share contact");
    } finally {
      setContactSubmitting(false);
    }
  };


  /* ---------------------------------- UI ---------------------------------- */

  const showSlashHint = text === "/" || /(^|\s)\/$/.test(text);
  const favorites = templates.filter((t) => t.is_favorite).slice(0, 5);

  return (
    <div
      className={cn(
        "border-t border-border bg-surface relative",
        dragOver && "ring-2 ring-primary ring-inset",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="absolute inset-0 z-20 bg-primary/5 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="rounded-sm border-2 border-dashed border-primary bg-background/90 px-6 py-4 text-center">
            <Paperclip className="h-6 w-6 mx-auto mb-1 text-primary" />
            <p className="text-sm font-medium">Drop to upload</p>
          </div>
        </div>
      )}

      {/* Reply-to preview */}
      {replyTo && (
        <div className="px-4 pt-2 flex items-start gap-2">
          <div className="flex-1 rounded-sm border-l-2 border-primary bg-muted px-3 py-2 min-w-0">
            <div className="text-[11px] font-medium text-primary flex items-center gap-1">
              <ReplyIcon className="h-3 w-3" />
              Replying to {replyTo.direction === "outbound" ? "yourself" : "contact"}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {replyTo.body ?? replyTo.message_type}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClearReply} className="h-7 w-7">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Status ribbon: draft + scheduled */}
      {(draft?.body || scheduledPending.length > 0) && (
        <div className="px-4 pt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
          {draft?.body && (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Draft auto-saved
            </span>
          )}
          {scheduledPending.length > 0 && (
            <button
              type="button"
              className="flex items-center gap-1 hover:text-foreground transition-colors"
              onClick={() => setScheduleOpen(true)}
            >
              <CalendarClock className="h-3 w-3" />
              {scheduledPending.length} scheduled
            </button>
          )}
        </div>
      )}

      {/* Quick favorites strip */}
      {favorites.length > 0 && (
        <div className="px-3 pt-2 flex items-center gap-1 overflow-x-auto no-scrollbar">
          <Zap className="h-3 w-3 text-muted-foreground shrink-0" />
          {favorites.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() =>
                applyTemplate(renderTemplate(t.body, contextVars), t)
              }
              className="text-[11px] px-2 py-0.5 rounded-sm border border-border bg-background hover:bg-muted whitespace-nowrap transition-colors"
              title={t.body}
            >
              {t.name}
            </button>
          ))}
          <TemplateManager
            trigger={
              <button
                type="button"
                className="text-[11px] px-2 py-0.5 rounded-sm border border-dashed border-border text-muted-foreground hover:bg-muted whitespace-nowrap"
              >
                Manage
              </button>
            }
          />
        </div>
      )}

      {/* Slash hint */}
      {showSlashHint && (
        <div className="px-4 pt-2 text-[11px] text-muted-foreground flex items-center gap-1">
          <CommandIcon className="h-3 w-3" />
          Type a shortcut name, or press{" "}
          <kbd className="px-1 rounded bg-muted font-mono">{mod}+K</kbd> to browse
        </div>
      )}

      <div className="p-2 sm:p-3 flex flex-col md:flex-row md:items-end gap-2">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) =>
            handleUpload(
              e.target.files,
              e.target.files?.[0]?.type.startsWith("video/") ? "video" : "image",
            )
          }
        />
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => handleUpload(e.target.files, "document")}
        />

        {/* Textarea — row 1 on mobile, middle column on desktop */}
        <div className="order-1 md:order-2 w-full md:flex-1 min-w-0">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              const next = e.target.value;
              setText(next);
              if (next.trim()) void broadcastTyping();
              else void broadcastTyping.stop();
            }}
            onBlur={() => void broadcastTyping.stop()}
            onKeyDown={onKeyDown}
            onPaste={handlePaste}
            placeholder={
              isRecording
                ? "Recording…"
                : `Type a message. Type / for shortcuts, ${mod}+K for templates.`
            }
            rows={1}
            disabled={disabled || isRecording}
            className={cn(
              "resize-none min-h-[44px] sm:min-h-[40px] max-h-52 rounded-2xl bg-background",
              "focus-visible:ring-1 focus-visible:ring-primary",
            )}
          />
        </div>

        {/*
          Toolbar wrapper — row 2 on mobile/tablet (justify-between splits attach
          cluster from send/mic). On md+ we flatten via `md:contents` so the
          two inner groups become direct flex children of the outer row,
          giving us: [attach] [textarea] [send/mic].
        */}
        <div className="order-2 md:contents flex items-center justify-between gap-1">
          {/* Attach cluster — visually grouped, tight gap */}
          <div className="flex items-center gap-0.5 md:gap-1 shrink-0 md:order-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-full"
                  disabled={disabled || uploading}
                  aria-label="Attach"
                >
                  <Paperclip className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {can("media") && (
                  <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
                    <ImageIcon className="h-4 w-4" /> Photo / Video
                  </DropdownMenuItem>
                )}
                {can("document") && (
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                    <FileText className="h-4 w-4" /> Document
                  </DropdownMenuItem>
                )}
                {can("location") && (
                  <DropdownMenuItem onClick={shareLocation}>
                    <MapPin className="h-4 w-4" /> Location
                  </DropdownMenuItem>
                )}
                {can("contact_card") && (
                  <DropdownMenuItem onClick={shareContact}>
                    <UserIcon className="h-4 w-4" /> Contact
                  </DropdownMenuItem>
                )}
                {!can("media") && !can("document") && !can("location") && !can("contact_card") && (
                  <DropdownMenuItem disabled>
                    {channelLabel(channel)} supports text only
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {channel === "whatsapp" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full"
                disabled={disabled}
                aria-label="Send form"
                title="Send a WhatsApp form"
                onClick={() => setFormPickerOpen(true)}
              >
                <ClipboardList className="h-5 w-5" />
              </Button>
            )}

            {can("templates") && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full"
                disabled={disabled}
                aria-label="Templates"
                title={`Templates (${mod}+K)`}
                onClick={() => {
                  setPickerSeed("");
                  setPickerOpen(true);
                }}
              >
                <BookOpen className="h-5 w-5" />
              </Button>
            )}


            <AIReplyAssistant
              conversationId={conversationId}
              draft={text}
              onApply={(t) => {
                setText(t);
                setTimeout(() => textareaRef.current?.focus(), 0);
              }}
              disabled={disabled}
            />

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-full"
                  disabled={disabled}
                  aria-label="Emoji"
                >
                  <Smile className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-auto" align="start">
                <EmojiPicker
                  onSelect={(e) => {
                    setText((t) => t + e);
                    textareaRef.current?.focus();
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Send / Record — always rightmost */}
          <div className="shrink-0 md:order-3">
            {text.trim() || uploading ? (
              <div className="flex items-center">
                <Button
                  type="button"
                  size="icon"
                  className="h-10 w-10 rounded-full rounded-r-none"
                  onClick={submit}
                  disabled={disabled || uploading || !text.trim()}
                  aria-label="Send"
                  title={`Send (${IS_MAC ? "↵ or ⌘↵" : "↵ or Ctrl+↵"})`}
                >
                  <Send className="h-4 w-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      className="h-10 w-10 rounded-full rounded-l-none border-l border-primary-foreground/20"
                      disabled={disabled || uploading || !text.trim()}
                      aria-label="Send options"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Send
                    </DropdownMenuLabel>
                    <DropdownMenuItem onClick={submit}>
                      <Send className="h-3.5 w-3.5" />
                      Send now
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        ↵
                      </span>
                    </DropdownMenuItem>
                    {can("schedule") && (
                      <DropdownMenuItem onClick={() => setScheduleOpen(true)}>
                        <Clock className="h-3.5 w-3.5" />
                        Schedule…
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {mod}+⇧S
                        </span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setHelpOpen(true)}>
                      <Keyboard className="h-3.5 w-3.5" />
                      Keyboard shortcuts
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : isRecording ? (
              <Button
                type="button"
                size="icon"
                variant="destructive"
                className="h-10 w-10 rounded-full animate-pulse"
                onClick={stopRecording}
                aria-label="Stop recording"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : can("voice_note") ? (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="h-10 w-10 rounded-full"
                onClick={startRecording}
                disabled={disabled}
                aria-label="Record voice note"
              >
                <Mic className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={submit}
                disabled
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}

          </div>
        </div>
      </div>


      {/* Overlays */}
      <TemplatePicker
        contact={crmContact ?? undefined}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(rendered, tpl) => applyTemplate(rendered, tpl)}
        onPickAndSend={(rendered, tpl, payload) => sendTemplateNow(rendered, tpl, payload)}
        contextVars={contextVars}
        initialSearch={pickerSeed}
      />
      <WhatsAppFormPicker
        conversationId={conversationId}
        open={formPickerOpen}
        onOpenChange={setFormPickerOpen}
      />
      <TemplateManager open={manageOpen} onOpenChange={setManageOpen} />
      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        conversationId={conversationId}
        body={text.trim()}
        onScheduled={() => setText("")}
      />
      <ShortcutHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <Dialog open={contactOpen} onOpenChange={(o) => !contactSubmitting && setContactOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share a contact</DialogTitle>
            <DialogDescription>
              Send a contact card in this conversation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {(() => {
              const activeSource =
                prefillIdx >= 0 ? prefillCandidates[prefillIdx]?.source : undefined;
              if (!activeSource || linkedContactId) return null;
              const isAttachment = activeSource === "attachment";
              return (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Prefilled from</span>
                  <Badge variant="secondary" className="h-5 px-2 gap-1">
                    {isAttachment ? (
                      <Paperclip className="h-3 w-3" />
                    ) : (
                      <UserCheck className="h-3 w-3" />
                    )}
                    {isAttachment ? "Shared attachment" : "Current recipient"}
                  </Badge>
                </div>
              );
            })()}
            {prefillCandidates.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="contact-prefill">Prefill from</Label>
                <Select
                  value={prefillIdx >= 0 ? String(prefillIdx) : ""}
                  onValueChange={(v) => applyPrefill(Number(v))}
                >
                  <SelectTrigger id="contact-prefill">
                    <SelectValue placeholder="Choose a shared contact…" />
                  </SelectTrigger>
                  <SelectContent>
                    {prefillCandidates.map((c, i) => {
                      const label =
                        c.name ||
                        c.phone ||
                        c.email ||
                        `Contact ${i + 1}`;
                      const sub = [c.phone, c.email].filter(Boolean).join(" · ");
                      const srcLabel =
                        c.source === "recipient" ? "Recipient" : "Attachment";
                      return (
                        <SelectItem key={i} value={String(i)}>
                          <span className="flex items-center gap-2 truncate">
                            <Badge
                              variant="outline"
                              className="h-4 px-1.5 text-[10px] font-normal shrink-0"
                            >
                              {srcLabel}
                            </Badge>
                            <span className="truncate">
                              {label}
                              {sub && sub !== label && (
                                <span className="text-muted-foreground"> — {sub}</span>
                              )}
                            </span>
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="contact-name">Name</Label>
              <Input
                id="contact-name"
                autoFocus
                value={contactForm.name}
                onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Jane Doe"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-phone">Phone <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="contact-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={contactForm.phone}
                onChange={(e) => {
                  setContactForm((f) => ({ ...f, phone: e.target.value }));
                  setLinkedContactId(null);
                  setDupeDismissed(false);
                }}
                onBlur={(e) => {
                  const normalized = normalizePhoneInput(e.target.value);
                  if (normalized !== e.target.value) {
                    setContactForm((f) => ({ ...f, phone: normalized }));
                  }
                }}
                placeholder="+1 555 123 4567"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-email">Email <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="contact-email"
                type="email"
                value={contactForm.email}
                onChange={(e) => {
                  setContactForm((f) => ({ ...f, email: e.target.value }));
                  setLinkedContactId(null);
                  setDupeDismissed(false);
                }}
                placeholder="jane@example.com"
              />
            </div>
            {linkedContactId && (
              <div className="flex items-start gap-2 rounded-sm border border-primary/30 bg-primary/5 p-2.5 text-xs">
                <UserCheck className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-foreground">
                    Linked to existing contact
                  </div>
                  <div className="text-muted-foreground truncate">
                    {contactForm.name || "Unnamed contact"}
                    {contactForm.phone ? ` · ${contactForm.phone}` : ""}
                  </div>
                  <div
                    className="mt-0.5 font-mono text-[10px] text-muted-foreground/80 truncate"
                    title={linkedContactId}
                  >
                    ID: {linkedContactId}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => {
                    setLinkedContactId(null);
                    setDupeDismissed(false);
                  }}
                >
                  Unlink
                </Button>
              </div>
            )}
            {!linkedContactId && !dupeDismissed && dupeMatches.length > 0 && (
              <div className="rounded-sm border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <UserCheck className="h-4 w-4 text-amber-600" />
                  {dupeMatches.length === 1
                    ? "A matching contact already exists"
                    : `${dupeMatches.length} matching contacts already exist`}
                </div>
                <div className="space-y-1.5">
                  {dupeMatches.map((c) => {
                    const label =
                      c.display_name ||
                      c.name ||
                      [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
                      c.phone ||
                      c.email ||
                      "Contact";
                    const sub = [normalizePhone(c.phone) || c.phone, c.email]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <div
                        key={c.id}
                        className="flex items-center gap-2 rounded-sm bg-background px-2 py-1.5"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{label}</div>
                          {sub && (
                            <div className="text-[11px] text-muted-foreground truncate">{sub}</div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 px-2 text-xs"
                          onClick={() => useExistingContact(c)}
                        >
                          Link
                        </Button>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setDupeDismissed(true)}
                  >
                    Create new instead
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setContactOpen(false)} disabled={contactSubmitting}>
              Cancel
            </Button>
            <Button onClick={submitContact} disabled={contactSubmitting || !contactForm.name.trim()}>
              {contactSubmitting ? "Sending…" : "Share contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Keyboard shortcuts                             */
/* -------------------------------------------------------------------------- */

function ShortcutHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <span aria-hidden className="sr-only" />
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end" side="top">
        <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
          <Keyboard className="h-4 w-4" />
          Keyboard shortcuts
        </div>
        <ul className="space-y-1.5 text-xs">
          <ShortcutRow keys={["↵"]} label="Send message" />
          <ShortcutRow keys={["Shift", "↵"]} label="New line" />
          <ShortcutRow keys={[mod, "K"]} label="Open template picker" />
          <ShortcutRow keys={["/", "shortcut", "Space"]} label="Expand slash command" />
          <ShortcutRow keys={[mod, "⇧", "S"]} label="Schedule / send later" />
          <ShortcutRow keys={["Esc"]} label="Cancel reply" />
          <ShortcutRow keys={[mod, "/"]} label="Show this help" />
        </ul>
        <div className="mt-3 pt-2 border-t border-border text-[11px] text-muted-foreground">
          You can also drag &amp; drop or paste files directly into the composer.
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-0.5">
        {keys.map((k, i) => (
          <Badge
            key={i}
            variant="outline"
            className="h-4 px-1 text-[11px] font-mono"
          >
            {k}
          </Badge>
        ))}
      </span>
    </li>
  );
}
