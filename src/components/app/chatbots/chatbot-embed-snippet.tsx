/**
 * Embed snippet generator — produces a copy-pasteable `<script>` tag that
 * loads the Swiffer chat widget for a specific chatbot on any website.
 *
 * The generated snippet is intentionally minimal (no runtime dependencies)
 * so it works on static sites, WordPress, Shopify themes, etc. It creates a
 * launcher button + iframe pointing at the public embed route
 * (`/embed/chatbots/:botId`). The route itself is authenticated in this
 * build; deployments that expose a public widget should proxy the embed
 * route or add a public alias — that boundary lives outside this component.
 */
import { useMemo, useState } from "react";
import { Copy, Check, Palette, Globe, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

interface Props {
  chatbotId: string;
  botName: string;
}

export function ChatbotEmbedSnippet({ chatbotId, botName }: Props) {
  const [color, setColor] = useState("#A4161A");
  const [position, setPosition] = useState<"br" | "bl">("br");
  const [greeting, setGreeting] = useState(`Hi! Chat with ${botName}`);
  const [copied, setCopied] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://your-app.example";

  const scriptTag = useMemo(
    () => `<script>
(function(){
  var w = window, d = document;
  var cfg = {
    botId: "${chatbotId}",
    host: "${origin}",
    color: "${color}",
    position: "${position}",
    greeting: ${JSON.stringify(greeting)}
  };
  var s = d.createElement("script");
  s.async = true;
  s.src = cfg.host + "/api/public/widget.js";
  s.setAttribute("data-config", JSON.stringify(cfg));
  d.head.appendChild(s);
  w.SwifferChat = w.SwifferChat || { config: cfg };
})();
</script>`,
    [chatbotId, origin, color, position, greeting],
  );

  const iframeTag = useMemo(
    () => `<iframe
  src="${origin}/embed/chatbots/${chatbotId}?color=${encodeURIComponent(color)}&pos=${position}"
  title="Chat with ${botName}"
  style="position:fixed;${position === "br" ? "right:24px;bottom:24px" : "left:24px;bottom:24px"};width:380px;height:600px;border:0;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.15);z-index:2147483000"
  allow="clipboard-read; clipboard-write"
  loading="lazy"
></iframe>`,
    [chatbotId, botName, color, position, origin],
  );

  const reactSnippet = useMemo(
    () => `import { useEffect } from "react";

export function SwifferChatWidget() {
  useEffect(() => {
    const s = document.createElement("script");
    s.async = true;
    s.src = "${origin}/api/public/widget.js";
    s.setAttribute("data-config", JSON.stringify({
      botId: "${chatbotId}",
      color: "${color}",
      position: "${position}",
    }));
    document.head.appendChild(s);
    return () => { s.remove(); };
  }, []);
  return null;
}`,
    [chatbotId, origin, color, position],
  );

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center gap-2 mb-4">
          <Palette className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Widget appearance</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="widget-color" className="text-xs">Accent color</Label>
            <div className="flex items-center gap-2">
              <input
                id="widget-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                aria-label="Widget accent color"
                className="h-9 w-12 rounded border border-border bg-background cursor-pointer"
              />
              <Input value={color} onChange={(e) => setColor(e.target.value)} className="h-9 font-mono text-xs" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="widget-position" className="text-xs">Position</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={position === "br" ? "default" : "outline"}
                onClick={() => setPosition("br")}
                className="flex-1"
              >
                Bottom-right
              </Button>
              <Button
                type="button"
                size="sm"
                variant={position === "bl" ? "default" : "outline"}
                onClick={() => setPosition("bl")}
                className="flex-1"
              >
                Bottom-left
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="widget-greeting" className="text-xs">Greeting</Label>
            <Input
              id="widget-greeting"
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              className="h-9"
              maxLength={80}
            />
          </div>
        </div>
      </div>

      <Tabs defaultValue="script">
        <TabsList>
          <TabsTrigger value="script"><Code2 className="h-3.5 w-3.5 mr-1" />Script tag</TabsTrigger>
          <TabsTrigger value="iframe"><Globe className="h-3.5 w-3.5 mr-1" />iframe</TabsTrigger>
          <TabsTrigger value="react">React</TabsTrigger>
        </TabsList>

        {[
          { key: "script", value: scriptTag, hint: "Paste before </body> on any website." },
          { key: "iframe", value: iframeTag, hint: "Simplest option — no JS setup required." },
          { key: "react", value: reactSnippet, hint: "Drop the component into your React app." },
        ].map((t) => (
          <TabsContent key={t.key} value={t.key} className="space-y-2">
            <p className="text-xs text-muted-foreground">{t.hint}</p>
            <div className="relative">
              <pre className="text-xs leading-relaxed font-mono bg-muted/60 border border-border rounded-lg p-4 overflow-x-auto whitespace-pre">
                <code>{t.value}</code>
              </pre>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => copy(t.key, t.value)}
                aria-label={`Copy ${t.key} snippet`}
                className="absolute top-2 right-2 h-9"
              >
                {copied === t.key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span className="ml-1">{copied === t.key ? "Copied" : "Copy"}</span>
              </Button>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Deployment checklist</strong>
        <ul className="mt-2 space-y-1 list-disc pl-4">
          <li>Enable the <em>Web Widget</em> channel under Channels before going live.</li>
          <li>Add the destination domain to the workspace CORS allowlist.</li>
          <li>Rate-limits and moderation apply automatically to widget traffic.</li>
        </ul>
      </div>
    </div>
  );
}
