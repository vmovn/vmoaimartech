/**
 * WhatsApp Catalog — server-only helpers.
 *
 * Kept out of `wa-catalog.functions.ts` so that module stays a thin wrapper of
 * `createServerFn` declarations (server-function splitting removes runtime
 * siblings from that file).
 */

const GRAPH = "https://graph.facebook.com/v20.0";

export async function metaFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as any)?.error?.message ?? `Meta API ${res.status}`;
    throw new Error(msg);
  }
  return json as any;
}

export function retailerIdFor(p: { id: string; sku?: string | null }) {
  return p.sku && p.sku.trim().length > 0 ? p.sku.trim() : `wdf_${p.id.slice(0, 12)}`;
}

export function mapProductToMeta(p: any, cfg: any) {
  const price = Number(p.sale_price ?? p.price ?? 0);
  const currency = cfg?.currency ?? "USD";
  return {
    retailer_id: retailerIdFor(p),
    name: p.name,
    description: p.description ?? p.name,
    availability: (p.stock_quantity ?? 0) > 0 ? "in stock" : "out of stock",
    condition: "new",
    price: `${Math.round(price * 100)}`,
    currency,
    image_url: p.image_url ?? (Array.isArray(p.gallery) && p.gallery.length ? p.gallery[0] : null),
    additional_image_urls: Array.isArray(p.gallery) ? p.gallery.slice(1, 10) : [],
    url: p.public_url ?? `https://wa.me/`,
    brand: p.brand_name ?? undefined,
    category: p.category_name ?? cfg?.default_category ?? "General",
    visibility: p.wa_visibility === "hidden" ? "staging" : "published",
    inventory: p.stock_quantity ?? 0,
  };
}

/**
 * Resolve the Graph access token + sending phone number for a workspace.
 *
 * The rest of the app stores WhatsApp credentials against a `channel_accounts`
 * row (token looked up by secret NAME), so the catalog must read from the same
 * place — otherwise a workspace that completed the WhatsApp setup wizard would
 * still be treated as "not configured" and every sync stayed staged locally.
 * Per-workspace / global env vars remain as a fallback for self-hosted installs.
 */
export async function resolveWaCatalogCredentials(
  workspaceId: string,
  cfg: { phone_number_id?: string | null } | null,
): Promise<{ token: string | null; phoneNumberId: string | null }> {
  let phoneNumberId = cfg?.phone_number_id ?? null;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = (supabaseAdmin as any)
      .from("channel_accounts")
      .select("id, phone_number_id, status")
      .eq("workspace_id", workspaceId)
      .eq("provider", "whatsapp_cloud");
    if (cfg?.phone_number_id) q = q.eq("phone_number_id", cfg.phone_number_id);
    const { data: rows } = await q.order("is_default", { ascending: false }).limit(5);
    const account =
      (rows ?? []).find((r: any) => r.status === "active" || r.status === "connected") ??
      (rows ?? [])[0];
    if (account?.id) {
      const registry = await import("@/lib/messaging/registry.server");
      const record = await registry.loadChannelAccount(account.id);
      phoneNumberId = phoneNumberId ?? record.phoneNumberId ?? null;
      const creds = registry.loadCredentials(record);
      if (creds.accessToken) return { token: creds.accessToken, phoneNumberId };
    }
  } catch {
    // Missing account / missing secret — fall through to env vars below.
  }

  const key = `WA_TOKEN_${workspaceId.replace(/-/g, "_").toUpperCase()}`;
  const token = process.env[key] ?? process.env.WHATSAPP_ACCESS_TOKEN ?? null;
  return { token: token ?? null, phoneNumberId };
}

/**
 * Increment a daily catalog analytics counter.
 *
 * A plain upsert of `{ shares: 1 }` overwrote the running total, so counters
 * never grew past 1. Read-modify-write keeps the daily aggregate accurate.
 */
export async function bumpCatalogAnalytics(
  supabase: any,
  args: { workspaceId: string; productId: string; field: "views" | "shares" | "clicks" | "add_to_cart" | "orders"; by?: number },
) {
  const today = new Date().toISOString().slice(0, 10);
  const by = args.by ?? 1;
  const { data: existing } = await supabase
    .from("wa_catalog_analytics_daily")
    .select(`id, ${args.field}`)
    .eq("workspace_id", args.workspaceId)
    .eq("product_id", args.productId)
    .eq("date", today)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("wa_catalog_analytics_daily")
      .update({ [args.field]: (Number(existing[args.field]) || 0) + by })
      .eq("id", existing.id);
    return;
  }
  await supabase.from("wa_catalog_analytics_daily").insert({
    workspace_id: args.workspaceId,
    product_id: args.productId,
    date: today,
    [args.field]: by,
  });
}
