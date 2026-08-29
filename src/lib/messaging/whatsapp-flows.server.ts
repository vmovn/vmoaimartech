/**
 * WhatsApp Flows (forms) — Meta Graph API layer.
 *
 * Responsibilities:
 *  - compile the app's simple `flow_json` step list into a Meta Flow JSON asset
 *  - create / update / publish / deprecate the Flow on the WABA
 *  - resolve WABA credentials from the workspace's connected channel account
 *
 * Server-only: never import this from client code.
 */

const GRAPH = "https://graph.facebook.com/v20.0";

export interface FlowStep {
  id?: string;
  title: string;
  question: string;
  type: "text" | "textarea" | "email" | "phone" | "number" | "select" | "multiselect";
  required: boolean;
  field_key: string;
  help?: string | null;
  validation?: { min?: number | null; max?: number | null; pattern?: string | null };
  options?: Array<{ value: string; label: string }>;
}

export const FLOW_SCREEN_ID = "FORM";

/** Compile the app's step list into a Meta Flow JSON (v5.0) asset. */
export function compileFlowJson(name: string, steps: FlowStep[]): Record<string, unknown> {
  const children: Record<string, unknown>[] = [];

  for (const step of steps) {
    const label = step.question.slice(0, 80);
    const base = {
      name: step.field_key,
      label,
      required: step.required,
      ...(step.help ? { "helper-text": String(step.help).slice(0, 80) } : {}),
    };

    switch (step.type) {
      case "textarea":
        children.push({ type: "TextArea", ...base, "max-length": step.validation?.max ?? 600 });
        break;
      case "select":
        children.push({
          type: "Dropdown",
          ...base,
          "data-source": (step.options ?? []).map((o) => ({ id: o.value, title: o.label.slice(0, 30) })),
        });
        break;
      case "multiselect":
        children.push({
          type: "CheckboxGroup",
          ...base,
          "data-source": (step.options ?? []).map((o) => ({ id: o.value, title: o.label.slice(0, 30) })),
        });
        break;
      default: {
        const inputType =
          step.type === "email" ? "email"
          : step.type === "phone" ? "phone"
          : step.type === "number" ? "number"
          : "text";
        children.push({
          type: "TextInput",
          ...base,
          "input-type": inputType,
          ...(step.validation?.max ? { "max-chars": step.validation.max } : {}),
        });
        break;
      }
    }
  }

  const payload: Record<string, string> = {};
  for (const step of steps) payload[step.field_key] = `\${form.${step.field_key}}`;

  children.push({
    type: "Footer",
    label: "Submit",
    "on-click-action": { name: "complete", payload },
  });

  return {
    version: "5.0",
    screens: [
      {
        id: FLOW_SCREEN_ID,
        title: name.slice(0, 30),
        terminal: true,
        success: true,
        layout: {
          type: "SingleColumnLayout",
          children: [{ type: "Form", name: "form", children }],
        },
      },
    ],
  };
}

function metaErrorMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; error_user_msg?: string } };
    return parsed.error?.error_user_msg || parsed.error?.message || `Meta API error (${status})`;
  } catch {
    return `Meta API error (${status}): ${body.slice(0, 200)}`;
  }
}

async function graph(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(metaErrorMessage(res.status, text));
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export interface WabaCredentials {
  token: string;
  wabaId: string | null;
  phoneNumberId: string | null;
  accountId: string | null;
}

/**
 * Resolve WhatsApp Cloud credentials for a workspace from `channel_accounts`,
 * falling back to conventional environment variables for self-hosted installs.
 */
export async function resolveWabaCredentials(workspaceId: string): Promise<WabaCredentials | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await (supabaseAdmin as never as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (a: string, b: string) => {
            eq: (a: string, b: string) => {
              order: (c: string, o: { ascending: boolean }) => {
                limit: (n: number) => Promise<{ data: Array<{ id: string; status: string }> | null }>;
              };
            };
          };
        };
      };
    })
      .from("channel_accounts")
      .select("id, status")
      .eq("workspace_id", workspaceId)
      .eq("provider", "whatsapp_cloud")
      .order("is_default", { ascending: false })
      .limit(5);

    const account =
      (rows ?? []).find((r) => r.status === "active" || r.status === "connected") ?? (rows ?? [])[0];

    if (account?.id) {
      const registry = await import("./registry.server");
      const record = await registry.loadChannelAccount(account.id);
      const creds = registry.loadCredentials(record);
      if (creds.accessToken) {
        return {
          token: creds.accessToken,
          wabaId: record.wabaId ?? null,
          phoneNumberId: record.phoneNumberId ?? null,
          accountId: account.id,
        };
      }
    }
  } catch {
    // fall through to env-based credentials
  }

  const token = process.env["WHATSAPP_ACCESS_TOKEN"] ?? process.env["META_ACCESS_TOKEN"] ?? null;
  if (!token) return null;
  return {
    token,
    wabaId: process.env["WHATSAPP_WABA_ID"] ?? null,
    phoneNumberId: process.env["WHATSAPP_PHONE_NUMBER_ID"] ?? null,
    accountId: null,
  };
}

/** Create a Flow on the WABA. Returns the Meta flow id. */
export async function createMetaFlow(
  wabaId: string,
  token: string,
  name: string,
  category: string,
): Promise<string> {
  const res = await graph(`/${wabaId}/flows`, token, {
    method: "POST",
    body: JSON.stringify({ name: name.slice(0, 200), categories: [category] }),
  });
  const id = (res as { id?: string }).id;
  if (!id) throw new Error("Meta did not return a Flow ID");
  return id;
}

/** Upload (replace) the Flow JSON asset. */
export async function uploadFlowAsset(
  flowId: string,
  token: string,
  flowJson: Record<string, unknown>,
): Promise<{ warnings: string[] }> {
  const form = new FormData();
  form.append("name", "flow.json");
  form.append("asset_type", "FLOW_JSON");
  form.append("file", new Blob([JSON.stringify(flowJson)], { type: "application/json" }), "flow.json");
  const res = await graph(`/${flowId}/assets`, token, { method: "POST", body: form });
  const errors = (res as { validation_errors?: Array<{ message?: string }> }).validation_errors ?? [];
  return { warnings: errors.map((e) => e.message ?? "Validation warning").filter(Boolean) };
}

/** Publish a Flow. Treats "already published" as success. */
export async function publishMetaFlow(flowId: string, token: string): Promise<void> {
  try {
    await graph(`/${flowId}/publish`, token, { method: "POST" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already\s+published/i.test(msg)) return;
    throw err;
  }
}

/** Deprecate a published Flow (Meta has no "unpublish"). */
export async function deprecateMetaFlow(flowId: string, token: string): Promise<void> {
  await graph(`/${flowId}/deprecate`, token, { method: "POST" });
}
