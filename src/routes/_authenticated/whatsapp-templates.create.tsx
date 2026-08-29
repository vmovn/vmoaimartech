import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ArrowLeft, ArrowRight, Check, FileText, Image, Video, FileDown, MapPin, Type,
  MessageSquare, MousePointerClick, Braces, Eye, Save, Send, Layers, ShoppingBag, Trash2, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/whatsapp-templates/create")({
  staticData: { breadcrumb: "Create" },
  head: () => ({
    meta: [
      { title: "Create Meta Template" },
      { name: "description", content: "Build and submit WhatsApp message templates for your campaigns." },
    ],
  }),
  component: CreateMetaTemplatePage,
});

type TemplateType = "STANDARD" | "CAROUSEL" | "CATALOG";
type HeaderType = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";
type Category = "MARKETING" | "UTILITY" | "AUTHENTICATION";
type ButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "COPY_CODE";

type BtnRow =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string }
  | { type: "PHONE_NUMBER"; text: string; phone: string }
  | { type: "COPY_CODE"; example: string };

const LANGUAGES = [
  { code: "en_US", name: "English (US)" },
  { code: "en_GB", name: "English (UK)" },
  { code: "es", name: "Spanish" },
  { code: "es_MX", name: "Spanish (Mexico)" },
  { code: "pt_BR", name: "Portuguese (BR)" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "nl", name: "Dutch" },
  { code: "nb", name: "Norwegian" },
  { code: "sv", name: "Swedish" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "id", name: "Indonesian" },
  { code: "zh_CN", name: "Chinese (Simplified)" },
  { code: "ja", name: "Japanese" },
];

const STEPS = [
  { id: "basic", label: "Basic Info", icon: FileText },
  { id: "header", label: "Header", icon: Image },
  { id: "body", label: "Body", icon: MessageSquare },
  { id: "buttons", label: "Buttons", icon: MousePointerClick },
  { id: "variables", label: "Variables", icon: Braces },
  { id: "review", label: "Review & Submit", icon: Eye },
] as const;

const NAME_RE = /^[a-z0-9_]+$/;
const URL_RE = /^https:\/\/[^\s]+$/i;
const PHONE_RE = /^\+[1-9]\d{6,14}$/; // E.164
const MAX_BODY_VARS = 10;
const MAX_BUTTONS = 10;
const MAX_URL_BUTTONS = 2;
const MAX_PHONE_BUTTONS = 1;
const MAX_COPY_CODE_BUTTONS = 1;

function CreateMetaTemplatePage() {
  const navigate = useNavigate();
  const { active: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id ?? null;

  const [step, setStep] = useState(0);
  // Basic
  const [templateType, setTemplateType] = useState<TemplateType>("STANDARD");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en_US");
  const [category, setCategory] = useState<Category>("MARKETING");
  const [channelAccountId, setChannelAccountId] = useState<string>("");
  // Header
  const [headerType, setHeaderType] = useState<HeaderType>("NONE");
  const [headerText, setHeaderText] = useState("");
  const [headerMediaUrl, setHeaderMediaUrl] = useState("");
  // Body
  const [bodyText, setBodyText] = useState("");
  const [footerText, setFooterText] = useState("");
  // Buttons
  const [buttons, setButtons] = useState<BtnRow[]>([]);
  // Variables (examples)
  const [bodyVars, setBodyVars] = useState<string[]>([]);
  const [headerVar, setHeaderVar] = useState("");
  // Review flags
  const [allowCategoryChange, setAllowCategoryChange] = useState(true);

  const {
    data: channelsRaw,
    isLoading: channelsLoading,
    isError: channelsIsError,
    error: channelsError,
  } = useQuery({
    enabled: !!workspaceId,
    queryKey: ["wa-template-create:channel-accounts", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channel_accounts")
        .select("id, display_name, phone_number, status")
        .eq("workspace_id", workspaceId!)
        .eq("provider", "whatsapp_cloud")
        .order("is_default", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  // Runtime guard: Supabase should always return an array, but defend against
  // cache collisions or unexpected shapes so `.map` never explodes the page.
  const channels = Array.isArray(channelsRaw) ? channelsRaw : [];
  const channelsShapeInvalid = channelsRaw !== undefined && !Array.isArray(channelsRaw);


  // Auto-detect variables in body / header from {{1}} {{2}}…
  const detectedBodyVars = useMemo(() => {
    const m = bodyText.match(/{{\s*\d+\s*}}/g) ?? [];
    return [...new Set(m.map((s) => s.replace(/\D/g, "")))].sort((a, b) => +a - +b);
  }, [bodyText]);
  const hasHeaderVar = headerType === "TEXT" && /{{\s*1\s*}}/.test(headerText);

  // Sync bodyVars length with detected count
  useMemo(() => {
    setBodyVars((prev) => {
      const next = detectedBodyVars.map((_, i) => prev[i] ?? "");
      return next;
    });
  }, [detectedBodyVars.length]);

  const nameError =
    name && !NAME_RE.test(name) ? "Only lowercase letters, numbers, underscores" :
    name.length > 512 ? "Max 512 characters" : null;

  function validateForSubmit(): { step: number; message: string; code?: string } | null {
    // Step 0 — Basic Info
    if (!name.trim()) return { step: 0, message: "Template name is required" };
    if (!NAME_RE.test(name)) return { step: 0, message: "Name may only contain lowercase letters, numbers and underscores" };
    if (name.length > 512) return { step: 0, message: "Name must be at most 512 characters" };
    if (!language) return { step: 0, message: "Select a language" };
    if (!["MARKETING", "UTILITY", "AUTHENTICATION"].includes(category)) return { step: 0, message: "Select a valid category" };
    if (!channelAccountId) return { step: 0, message: "Select a WhatsApp Business Account" };

    // Step 1 — Header
    if (headerType === "TEXT") {
      const trimmed = headerText.trim();
      if (!trimmed) return { step: 1, message: "Header text is required" };
      if (headerText.length > 60) return { step: 1, message: "Header text must be at most 60 characters" };
      const headerVarMatches = headerText.match(/{{\s*\d+\s*}}/g) ?? [];
      if (headerVarMatches.length > 1) return { step: 1, message: "Header may contain at most one variable" };
      if (headerVarMatches.length === 1 && !/{{\s*1\s*}}/.test(headerText)) {
        return { step: 1, message: "Header variable must be {{1}}" };
      }
      if (/\n/.test(headerText)) return { step: 1, message: "Header text cannot contain line breaks" };
    }
    if (["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType)) {
      if (!headerMediaUrl.trim()) return { step: 1, message: "Sample media URL is required for review" };
      if (!URL_RE.test(headerMediaUrl.trim())) return { step: 1, message: "Sample media URL must be a valid https:// link" };
    }

    // Step 2 — Body
    const body = bodyText.trim();
    if (!body) return { step: 2, message: "Body text is required" };
    if (bodyText.length > 1024) return { step: 2, message: "Body must be at most 1024 characters" };
    if ((bodyText.match(/\n{4,}/g) ?? []).length > 0) return { step: 2, message: "Body cannot contain 4+ consecutive line breaks" };
    // Variable rules: unique, sequential starting at 1, max MAX_BODY_VARS
    const rawVarMatches = bodyText.match(/{{\s*\d+\s*}}/g) ?? [];
    const nums = rawVarMatches.map((s) => Number(s.replace(/\D/g, "")));
    const uniqueSorted = [...new Set(nums)].sort((a, b) => a - b);
    if (uniqueSorted.some((n) => n <= 0)) return { step: 2, message: "Variables must be numbered starting at {{1}}" };
    if (uniqueSorted.length > MAX_BODY_VARS) return { step: 2, message: `Body may contain at most ${MAX_BODY_VARS} unique variables` };
    for (let i = 0; i < uniqueSorted.length; i++) {
      if (uniqueSorted[i] !== i + 1) return { step: 2, message: "Variables must be sequential — use {{1}}, {{2}}, {{3}} without gaps" };
    }
    // No variable at start / end of body per Meta guideline
    if (/^\s*{{\s*\d+\s*}}/.test(bodyText) || /{{\s*\d+\s*}}\s*$/.test(bodyText)) {
      return { step: 2, message: "Body cannot begin or end with a variable — surround {{n}} with static text", code: "body_edges" };
    }
    if (footerText && footerText.length > 60) return { step: 2, message: "Footer must be at most 60 characters" };

    // Step 3 — Buttons
    if (buttons.length > MAX_BUTTONS) return { step: 3, message: `A template may have at most ${MAX_BUTTONS} buttons` };
    const seenLabels = new Set<string>();
    let urlCount = 0, phoneCount = 0, copyCount = 0;
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      if (b.type === "COPY_CODE") {
        copyCount++;
        if (!b.example.trim()) return { step: 3, message: `Button ${i + 1}: copy-code example is required` };
        if (b.example.length > 15) return { step: 3, message: `Button ${i + 1}: copy code must be at most 15 characters` };
      } else {
        const text = b.text.trim();
        if (!text) return { step: 3, message: `Button ${i + 1}: label is required` };
        if (text.length > 25) return { step: 3, message: `Button ${i + 1}: label must be at most 25 characters` };
        const key = `${b.type}:${text.toLowerCase()}`;
        if (seenLabels.has(key)) return { step: 3, message: `Button ${i + 1}: duplicate label "${text}"` };
        seenLabels.add(key);
        if (b.type === "URL") {
          urlCount++;
          if (!URL_RE.test(b.url.trim())) return { step: 3, message: `Button ${i + 1}: URL must start with https://` };
          if (b.url.length > 2000) return { step: 3, message: `Button ${i + 1}: URL is too long` };
          const urlVarCount = (b.url.match(/{{\s*\d+\s*}}/g) ?? []).length;
          if (urlVarCount > 1) return { step: 3, message: `Button ${i + 1}: URL may contain at most one variable` };
        }
        if (b.type === "PHONE_NUMBER") {
          phoneCount++;
          if (!PHONE_RE.test(b.phone.trim())) return { step: 3, message: `Button ${i + 1}: phone must be in E.164 format (e.g. +14155551234)` };
        }
      }
    }
    if (urlCount > MAX_URL_BUTTONS) return { step: 3, message: `At most ${MAX_URL_BUTTONS} URL buttons allowed` };
    if (phoneCount > MAX_PHONE_BUTTONS) return { step: 3, message: `At most ${MAX_PHONE_BUTTONS} phone button allowed` };
    if (copyCount > MAX_COPY_CODE_BUTTONS) return { step: 3, message: `At most ${MAX_COPY_CODE_BUTTONS} copy-code button allowed` };

    // Step 4 — Variable examples
    if (/{{\s*1\s*}}/.test(headerText) && headerType === "TEXT" && !headerVar.trim()) {
      return { step: 4, message: "Provide an example value for the header variable {{1}}" };
    }
    for (let i = 0; i < uniqueSorted.length; i++) {
      const example = (bodyVars[i] ?? "").trim();
      if (!example) return { step: 4, message: `Provide an example value for body variable {{${uniqueSorted[i]}}}` };
      if (example.length > 200) return { step: 4, message: `Example for {{${uniqueSorted[i]}}} must be at most 200 characters` };
    }

    // Authentication category constraint
    if (category === "AUTHENTICATION" && bodyText.length > 0 && uniqueSorted.length === 0) {
      return { step: 2, message: "Authentication templates must include a variable (e.g. the OTP code)" };
    }

    return null;
  }

  const submitError = useMemo(() => validateForSubmit(),
    // recompute whenever any input changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, language, category, channelAccountId, headerType, headerText, headerMediaUrl,
      bodyText, footerText, buttons, headerVar, bodyVars]);

  /** Meta forbids a body that starts or ends with a variable — pad the edges. */
  function autofixBodyEdges() {
    let next = bodyText.trim();
    if (/^{{\s*\d+\s*}}/.test(next)) next = `Hi ${next}`;
    if (/{{\s*\d+\s*}}$/.test(next)) next = `${next}.`;
    setBodyText(next);
  }

  function canAdvance(): boolean {
    if (step === 0) return !!name && !nameError && !!language && !!category && !!channelAccountId;
    if (step === 1) {
      if (headerType === "TEXT") return headerText.trim().length > 0 && headerText.length <= 60;
      if (["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType)) return headerMediaUrl.trim().length > 0;
      return true;
    }
    if (step === 2) return bodyText.trim().length > 0 && bodyText.length <= 1024;
    if (step === 3) return buttons.length <= 10;
    return true;
  }

  function buildComponents() {
    const comps: any[] = [];
    if (headerType !== "NONE") {
      const c: any = { type: "HEADER", format: headerType };
      if (headerType === "TEXT") {
        c.text = headerText;
        if (hasHeaderVar && headerVar) c.example = { header_text: [headerVar] };
      } else if (headerMediaUrl) {
        c.example = { header_handle: [headerMediaUrl] };
      }
      comps.push(c);
    }
    const body: any = { type: "BODY", text: bodyText };
    if (bodyVars.length > 0) body.example = { body_text: [bodyVars] };
    comps.push(body);
    if (footerText.trim()) comps.push({ type: "FOOTER", text: footerText });
    if (buttons.length > 0) {
      comps.push({
        type: "BUTTONS",
        buttons: buttons.map((b) => {
          if (b.type === "URL") return { type: "URL", text: b.text, url: b.url };
          if (b.type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: b.text, phone_number: b.phone };
          if (b.type === "COPY_CODE") return { type: "COPY_CODE", example: b.example };
          return { type: "QUICK_REPLY", text: b.text };
        }),
      });
    }
    return comps;
  }

  const save = useMutation({
    mutationFn: async ({ submit }: { submit: boolean }) => {
      if (!workspaceId || !channelAccountId) throw new Error("Missing workspace or channel");
      const components = buildComponents();
      const variables = detectedBodyVars.map((n, i) => ({
        index: +n, example: bodyVars[i] ?? "",
      }));
      const { error, data } = await supabase.from("wa_templates").insert({
        workspace_id: workspaceId,
        channel_account_id: channelAccountId,
        provider: "whatsapp_cloud",
        name, language, category,
        status: submit ? "pending" : "draft",
        components,
        variables,
      }).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      toast.success(vars.submit ? "Template submitted for review" : "Draft saved");
      navigate({ to: "/whatsapp-templates" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <>
      <AppTopbar
        title="Create Meta Template"
        subtitle="Build and submit WhatsApp message templates for your campaigns"
        actions={
          <Link to="/whatsapp-templates">
            <Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back to Templates</Button>
          </Link>
        }
      />

      <main className="p-6 grid gap-6 max-w-7xl w-full mx-auto lg:grid-cols-[220px_minmax(0,1fr)_320px]">
        {/* Stepper */}
        <div className="space-y-1">
          <div className="h-1 rounded-sm bg-muted overflow-hidden mb-4">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = i === step;
            const done = i < step;
            return (
              <button
                key={s.id}
                onClick={() => (i <= step || canAdvance()) && setStep(i)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-sm text-sm text-left transition-colors",
                  active ? "bg-primary text-primary-foreground" :
                  done ? "bg-muted hover:bg-muted/80" : "hover:bg-muted/50 text-muted-foreground",
                )}
              >
                <span className={cn("h-6 w-6 grid place-items-center rounded-sm text-xs shrink-0",
                  active ? "bg-primary-foreground/20" : done ? "bg-success/20 text-success" : "bg-muted",
                )}>
                  {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                </span>
                <span className="truncate">{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* Main step content */}
        <div className="min-w-0">
          {step === 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Basic Info</CardTitle>
                <CardDescription>Choose the template type, name, language and category.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="mb-2 block">Template Type</Label>
                  <RadioGroup
                    value={templateType}
                    onValueChange={(v) => setTemplateType(v as TemplateType)}
                    className="grid gap-3 md:grid-cols-3"
                  >
                    <TypeOption value="STANDARD" title="Standard" desc="Text, media, buttons" icon={FileText} current={templateType} />
                    <TypeOption value="CAROUSEL" title="Carousel" desc="Multiple image cards" icon={Layers} current={templateType} />
                    <TypeOption value="CATALOG" title="Catalog" desc="Product catalog message" icon={ShoppingBag} current={templateType} />
                  </RadioGroup>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Template Name</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value.toLowerCase())}
                      placeholder="order_update"
                      maxLength={512}
                    />
                    <p className={cn("mt-1 text-xs", nameError ? "text-destructive" : "text-muted-foreground")}>
                      {nameError ?? "Only letters, numbers and underscores allowed"}
                    </p>
                  </div>
                  <div>
                    <Label>Language</Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LANGUAGES.map((l) => (
                          <SelectItem key={l.code} value={l.code}>{l.name} · {l.code}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MARKETING">Marketing</SelectItem>
                        <SelectItem value="UTILITY">Utility</SelectItem>
                        <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>WhatsApp Business Account</Label>
                    <Select value={channelAccountId} onValueChange={setChannelAccountId}>
                      <SelectTrigger><SelectValue placeholder="Select a WABA phone" /></SelectTrigger>
                      <SelectContent>
                        {channelsLoading ? (
                          <div className="p-3 text-xs text-muted-foreground">Loading WhatsApp accounts…</div>
                        ) : channelsIsError ? (
                          <div className="p-3 text-xs text-destructive">
                            Failed to load WhatsApp accounts: {channelsError instanceof Error ? channelsError.message : "Unknown error"}
                          </div>
                        ) : channelsShapeInvalid ? (
                          <div className="p-3 text-xs text-destructive">
                            Unexpected response shape for WhatsApp accounts. Please refresh the page.
                          </div>
                        ) : channels.length === 0 ? (
                          <div className="p-3 text-xs text-muted-foreground">No WABA connected yet.</div>
                        ) : (
                          channels.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.display_name} {c.phone_number ? `· ${c.phone_number}` : ""}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="p-3 rounded-sm border bg-muted/40 text-xs text-muted-foreground">
                  <div className="font-medium text-foreground mb-1">Template Name Guidelines</div>
                  <ul className="space-y-0.5">
                    <li>• Use lowercase letters only</li>
                    <li>• Use underscores instead of spaces (e.g. order_update)</li>
                    <li>• Maximum 512 characters allowed</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Header</CardTitle>
                <CardDescription>Optional header at the top of your template.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  {(["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT", "LOCATION"] as HeaderType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setHeaderType(t)}
                      className={cn(
                        "px-2 py-2 rounded-sm border text-xs flex flex-col items-center gap-1",
                        headerType === t ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted/50",
                      )}
                    >
                      {t === "NONE" ? <Trash2 className="h-4 w-4" /> :
                       t === "TEXT" ? <Type className="h-4 w-4" /> :
                       t === "IMAGE" ? <Image className="h-4 w-4" /> :
                       t === "VIDEO" ? <Video className="h-4 w-4" /> :
                       t === "DOCUMENT" ? <FileDown className="h-4 w-4" /> :
                       <MapPin className="h-4 w-4" />}
                      {t}
                    </button>
                  ))}
                </div>
                {headerType === "TEXT" && (
                  <div>
                    <Label>Header Text</Label>
                    <Input value={headerText} maxLength={60}
                      onChange={(e) => setHeaderText(e.target.value)}
                      placeholder="Order {{1}} update" />
                    <p className="mt-1 text-xs text-muted-foreground">Max 60 chars. Use {"{{1}}"} for one variable.</p>
                  </div>
                )}
                {["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType) && (
                  <div>
                    <Label>Sample Media URL</Label>
                    <Input value={headerMediaUrl}
                      onChange={(e) => setHeaderMediaUrl(e.target.value)}
                      placeholder="https://example.com/sample.jpg" />
                    <p className="mt-1 text-xs text-muted-foreground">Meta requires a sample media for review.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Body</CardTitle>
                <CardDescription>The main message. Use {"{{1}}"}, {"{{2}}"} for variables.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Body Text</Label>
                  <Textarea rows={6} maxLength={1024} value={bodyText}
                    onChange={(e) => setBodyText(e.target.value)}
                    placeholder="Hi {{1}}, your order {{2}} has been shipped." />
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                    <span>Detected variables: {detectedBodyVars.length}</span>
                    <span>{bodyText.length} / 1024</span>
                  </div>
                </div>
                <div>
                  <Label>Footer (optional)</Label>
                  <Input maxLength={60} value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                    placeholder="Reply STOP to opt out" />
                </div>
              </CardContent>
            </Card>
          )}

          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle>Buttons</CardTitle>
                <CardDescription>Up to 10 buttons. Mix quick replies, URLs, phone or copy-code.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {buttons.map((b, i) => (
                  <div key={i} className="border rounded-sm p-3 grid gap-2 md:grid-cols-[140px_1fr_1fr_auto]">
                    <Select value={b.type} onValueChange={(v) => {
                      const t = v as ButtonType;
                      const base = t === "COPY_CODE" ? { type: t, example: "" } as BtnRow :
                        t === "URL" ? { type: t, text: "", url: "" } as BtnRow :
                        t === "PHONE_NUMBER" ? { type: t, text: "", phone: "" } as BtnRow :
                        { type: t, text: "" } as BtnRow;
                      setButtons(buttons.map((x, j) => j === i ? base : x));
                    }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="QUICK_REPLY">Quick Reply</SelectItem>
                        <SelectItem value="URL">URL</SelectItem>
                        <SelectItem value="PHONE_NUMBER">Phone</SelectItem>
                        <SelectItem value="COPY_CODE">Copy Code</SelectItem>
                      </SelectContent>
                    </Select>
                    {b.type === "COPY_CODE" ? (
                      <Input placeholder="Example code" value={b.example}
                        onChange={(e) => setButtons(buttons.map((x, j) => j === i ? { ...b, example: e.target.value } : x))} />
                    ) : (
                      <Input placeholder="Button text" maxLength={25} value={b.text}
                        onChange={(e) => setButtons(buttons.map((x, j) => j === i ? { ...b, text: e.target.value } : x))} />
                    )}
                    {b.type === "URL" && (
                      <Input placeholder="https://…" value={b.url}
                        onChange={(e) => setButtons(buttons.map((x, j) => j === i ? { ...b, url: e.target.value } : x))} />
                    )}
                    {b.type === "PHONE_NUMBER" && (
                      <Input placeholder="+1234567890" value={b.phone}
                        onChange={(e) => setButtons(buttons.map((x, j) => j === i ? { ...b, phone: e.target.value } : x))} />
                    )}
                    {(b.type === "QUICK_REPLY" || b.type === "COPY_CODE") && <div />}
                    <Button variant="ghost" size="icon"
                      onClick={() => setButtons(buttons.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                {buttons.length < 10 && (
                  <Button variant="outline" size="sm"
                    onClick={() => setButtons([...buttons, { type: "QUICK_REPLY", text: "" }])}>
                    <Plus className="h-4 w-4 mr-1" /> Add Button
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {step === 4 && (
            <Card>
              <CardHeader>
                <CardTitle>Variables</CardTitle>
                <CardDescription>Provide sample values Meta will use for template review.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {hasHeaderVar && (
                  <div>
                    <Label>Header {"{{1}}"} example</Label>
                    <Input value={headerVar} onChange={(e) => setHeaderVar(e.target.value)} placeholder="e.g. 12345" />
                  </div>
                )}
                {detectedBodyVars.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No variables detected in the body.</p>
                ) : detectedBodyVars.map((n, i) => (
                  <div key={n}>
                    <Label>Body {`{{${n}}}`} example</Label>
                    <Input value={bodyVars[i] ?? ""}
                      onChange={(e) => setBodyVars(bodyVars.map((v, j) => j === i ? e.target.value : v))}
                      placeholder={`Sample for {{${n}}}`} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {step === 5 && (
            <Card>
              <CardHeader>
                <CardTitle>Review & Submit</CardTitle>
                <CardDescription>Confirm details, save as draft, or submit to Meta for approval.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ReviewRow k="Type" v={templateType} />
                <ReviewRow k="Name" v={name || "—"} />
                <ReviewRow k="Language" v={language} />
                <ReviewRow k="Category" v={category} />
                <ReviewRow k="Header" v={headerType === "NONE" ? "None" : `${headerType}${headerType === "TEXT" ? `: ${headerText}` : ""}`} />
                <ReviewRow k="Body" v={bodyText.slice(0, 120) + (bodyText.length > 120 ? "…" : "")} />
                <ReviewRow k="Footer" v={footerText || "—"} />
                <ReviewRow k="Buttons" v={buttons.length ? `${buttons.length} button(s)` : "None"} />
                <ReviewRow k="Variables" v={String(detectedBodyVars.length)} />
                <label className="flex items-center gap-2 text-sm pt-2">
                  <Switch checked={allowCategoryChange} onCheckedChange={setAllowCategoryChange} />
                  Allow Meta to update category if needed
                </label>
                {submitError ? (
                  <div className="rounded-sm border border-destructive/40 bg-destructive/5 text-destructive text-sm p-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">Cannot submit yet</div>
                      <div className="text-xs mt-0.5">{submitError.message}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {submitError.code === "body_edges" && (
                        <Button size="sm" onClick={autofixBodyEdges}>Auto-fix</Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setStep(submitError.step)}>
                        Fix
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-sm border border-success/40 bg-success/5 text-success text-sm p-3">
                    All Meta template rules pass — ready to submit.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Nav */}
          <div className="mt-4 flex items-center justify-between">
            <Button variant="outline" disabled={step === 0}
              onClick={() => setStep(step - 1)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => save.mutate({ submit: false })}
                disabled={!name || !channelAccountId || save.isPending}>
                <Save className="h-4 w-4 mr-1" /> Save Draft
              </Button>
              {step < STEPS.length - 1 ? (
                <Button disabled={!canAdvance()} onClick={() => setStep(step + 1)}>
                  Next <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    const err = validateForSubmit();
                    if (err) {
                      toast.error(err.message);
                      setStep(err.step);
                      return;
                    }
                    save.mutate({ submit: true });
                  }}
                  disabled={save.isPending || !!submitError}
                  title={submitError?.message}
                >
                  <Send className="h-4 w-4 mr-1" /> Submit to Meta
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Preview */}
        <div>
          <Card className="sticky top-24">
            <CardHeader><CardTitle className="text-sm">Live Preview</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-sm bg-[#e5ddd5] dark:bg-muted p-3">
                <div className="max-w-[260px] ml-auto bg-[#dcf8c6] dark:bg-primary/10 rounded-sm p-3 shadow-sm text-sm space-y-2">
                  {headerType === "TEXT" && headerText && (
                    <div className="font-semibold">{headerText}</div>
                  )}
                  {headerType === "IMAGE" && (
                    <div className="h-24 rounded-sm bg-muted flex items-center justify-center text-xs text-muted-foreground">
                      <Image className="h-5 w-5" />
                    </div>
                  )}
                  {headerType === "VIDEO" && (
                    <div className="h-24 rounded-sm bg-muted flex items-center justify-center text-xs text-muted-foreground">
                      <Video className="h-5 w-5" />
                    </div>
                  )}
                  {headerType === "DOCUMENT" && (
                    <div className="rounded-sm bg-muted p-2 text-xs flex items-center gap-2">
                      <FileDown className="h-4 w-4" /> document.pdf
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words">
                    {bodyText || <span className="text-muted-foreground">Your message body…</span>}
                  </div>
                  {footerText && <div className="text-xs text-muted-foreground">{footerText}</div>}
                  <div className="text-[10px] text-muted-foreground text-right">12:00 PM</div>
                </div>
                {buttons.length > 0 && (
                  <div className="mt-2 max-w-[260px] ml-auto space-y-1">
                    {buttons.map((b, i) => (
                      <div key={i} className="bg-background rounded-sm text-center text-xs py-2 text-primary border">
                        {b.type === "COPY_CODE" ? `Copy code: ${b.example || "…"}` :
                          "text" in b ? (b.text || "Button") : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                <Badge variant="outline" className="rounded-sm">{templateType}</Badge>
                <Badge variant="outline" className="rounded-sm">{category}</Badge>
                <Badge variant="outline" className="rounded-sm">{language}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}

function TypeOption({
  value, title, desc, icon: Icon, current,
}: { value: TemplateType; title: string; desc: string; icon: typeof FileText; current: TemplateType }) {
  const active = current === value;
  return (
    <label className={cn(
      "border rounded-sm p-3 cursor-pointer transition-colors",
      active ? "border-primary bg-primary/5" : "hover:bg-muted/50",
    )}>
      <RadioGroupItem value={value} className="sr-only" />
      <div className="flex items-center gap-2">
        <div className={cn("h-8 w-8 rounded-sm grid place-items-center",
          active ? "bg-primary text-primary-foreground" : "bg-muted",
        )}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="font-medium text-sm">{title}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
      </div>
    </label>
  );
}

function ReviewRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm border-b py-2 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-right break-all">{v}</span>
    </div>
  );
}
