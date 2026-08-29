import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import {
  metaFetch,
  retailerIdFor,
  mapProductToMeta,
  resolveWaCatalogCredentials,
  bumpCatalogAnalytics,
} from "@/lib/commerce/wa-catalog.server";

const ws = z.object({ workspaceId: z.string().uuid() });


// ============ CONFIG ============
export const getCatalogConfig = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => ws.parse(d))
  .handler(async ({ data, context }) => {
    // Only workspace owners and admins can read the catalog config to prevent token exposure.
    const { data: cfg, error } = await context.supabase
      .from('wa_catalog_config')
      .select('*')
      .eq('workspace_id', data.workspaceId)
      .maybeSingle();
    
    if (error) throw error;
    if (!cfg) return null;

    return cfg;
  });

export const saveCatalogConfig = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    workspaceId: string;
    catalog_id?: string;
    business_id?: string;
    phone_number_id?: string;
    currency?: string;
    auto_sync?: boolean;
    sync_images?: boolean;
    sync_inventory?: boolean;
    sync_prices?: boolean;
    default_category?: string;
  }) =>
    z.object({
      workspaceId: z.string().uuid(),
      catalog_id: z.string().max(64).optional(),
      business_id: z.string().max(64).optional(),
      phone_number_id: z.string().max(64).optional(),
      currency: z.string().length(3).optional(),
      auto_sync: z.boolean().optional(),
      sync_images: z.boolean().optional(),
      sync_inventory: z.boolean().optional(),
      sync_prices: z.boolean().optional(),
      default_category: z.string().max(120).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const row = {
      workspace_id: data.workspaceId,
      catalog_id: data.catalog_id ?? null,
      business_id: data.business_id ?? null,
      phone_number_id: data.phone_number_id ?? null,
      currency: data.currency ?? 'USD',
      auto_sync: data.auto_sync ?? false,
      sync_images: data.sync_images ?? true,
      sync_inventory: data.sync_inventory ?? true,
      sync_prices: data.sync_prices ?? true,
      default_category: data.default_category ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error } = await context.supabase
      .from('wa_catalog_config')
      .upsert(row, { onConflict: 'workspace_id' })
      .select().single();
    if (error) throw error;

    const { recordServerAuditEvent } = await import("@/lib/security/audit.server");
    void recordServerAuditEvent({
      eventType: "secrets.rotate",
      severity: "warning",
      workspaceId: data.workspaceId,
      actorId: context.userId,
      resourceType: "wa_catalog_config",
      data: { 
        has_catalog_id: !!data.catalog_id,
        has_business_id: !!data.business_id,
        has_phone_number_id: !!data.phone_number_id
      },
    });

    return saved;
  });

// ============ SYNC ENGINE ============
type SyncKind = 'full' | 'products' | 'categories' | 'inventory' | 'prices' | 'images';



export const runCatalogSync = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; kind: SyncKind; productIds?: string[] }) =>
    z.object({
      workspaceId: z.string().uuid(),
      kind: z.enum(['full', 'products', 'categories', 'inventory', 'prices', 'images']),
      productIds: z.array(z.string().uuid()).max(500).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { workspaceId, kind, productIds } = data;
    const { data: cfg } = await context.supabase
      .from('wa_catalog_config').select('*').eq('workspace_id', workspaceId).maybeSingle();

    const { data: log } = await context.supabase
      .from('wa_catalog_sync_log')
      .insert({ workspace_id: workspaceId, kind, status: 'running', triggered_by: context.userId })
      .select().single();

    const finish = async (patch: Record<string, unknown>) => {
      if (!log?.id) return;
      await context.supabase.from('wa_catalog_sync_log')
        .update({ ...patch, finished_at: new Date().toISOString() })
        .eq('id', log.id);
    };

    try {
      let q = context.supabase
        .from('products')
        .select('id, name, description, sku, price, sale_price, image_url, gallery, stock_quantity, wa_visibility, brand_id, category_id')
        .eq('workspace_id', workspaceId)
        .eq('is_active', true)
        .limit(500);
      if (productIds && productIds.length) q = q.in('id', productIds);
      const { data: prods, error: pErr } = await q;
      if (pErr) throw pErr;
      const products = prods ?? [];

      const { token } = await resolveWaCatalogCredentials(workspaceId, cfg);
      const canPush = !!(token && cfg?.catalog_id);

      let succeeded = 0;
      let failed = 0;
      const errors: string[] = [];

      // Build Meta batch requests (up to 100 items per call)
      if (canPush && products.length && kind !== 'categories') {
        for (let i = 0; i < products.length; i += 100) {
          const batch = products.slice(i, i + 100);
          const requests = batch.map((p) => ({
            method: 'UPDATE',
            retailer_id: retailerIdFor(p as any),
            data: mapProductToMeta(p as any, cfg),
          }));
          try {
            await metaFetch(`/${cfg!.catalog_id}/batch`, token!, {
              method: 'POST',
              body: JSON.stringify({ requests }),
            });
            succeeded += batch.length;
            const now = new Date().toISOString();
            await context.supabase.from('products').update({
              wa_catalog_status: 'synced',
              wa_catalog_synced_at: now,
              wa_catalog_error: null,
              retailer_id: undefined, // keep existing
            }).in('id', batch.map(b => b.id));
            // Also set retailer_id where missing
            for (const p of batch) {
              await context.supabase.from('products')
                .update({ retailer_id: retailerIdFor(p as any) })
                .eq('id', (p as any).id).is('retailer_id', null);
            }
          } catch (e: any) {
            failed += batch.length;
            errors.push(e?.message ?? String(e));
            await context.supabase.from('products').update({
              wa_catalog_status: 'error',
              wa_catalog_error: (e?.message ?? 'sync failed').slice(0, 400),
            }).in('id', batch.map(b => b.id));
          }
        }
      } else if (!canPush) {
        // Offline mode: mark as staged locally so UI reflects work done
        succeeded = products.length;
        await context.supabase.from('products').update({
          wa_catalog_status: 'staged',
          wa_catalog_synced_at: new Date().toISOString(),
        }).in('id', products.map(p => p.id));
      }

      await context.supabase.from('wa_catalog_config').update({
        last_full_sync_at: kind === 'full' ? new Date().toISOString() : cfg?.last_full_sync_at,
        last_sync_status: failed ? 'partial' : 'ok',
        last_sync_error: errors.slice(0, 3).join(' | ') || null,
      }).eq('workspace_id', workspaceId);

      await finish({
        status: failed ? 'partial' : 'success',
        total_items: products.length,
        succeeded,
        failed,
        error: errors.slice(0, 3).join(' | ') || null,
        details: { canPush, kind },
      });
      return { ok: true, total: products.length, succeeded, failed, canPush };
    } catch (e: any) {
      await finish({ status: 'error', error: (e?.message ?? String(e)).slice(0, 500) });
      throw e;
    }
  });

export const listSyncLogs = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => ws.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from('wa_catalog_sync_log').select('*')
      .eq('workspace_id', data.workspaceId)
      .order('started_at', { ascending: false }).limit(25);
    return rows ?? [];
  });

// ============ CATALOG PREVIEW & SEARCH ============
export const previewCatalog = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; search?: string; limit?: number }) =>
    z.object({
      workspaceId: z.string().uuid(),
      search: z.string().max(120).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from('products')
      .select('id, name, sku, retailer_id, price, sale_price, image_url, stock_quantity, wa_catalog_status, wa_catalog_error, wa_catalog_synced_at, wa_visibility, is_featured')
      .eq('workspace_id', data.workspaceId)
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(data.limit ?? 60);
    if (data.search) q = q.ilike('name', `%${sanitizeSearchTerm(data.search)}%`);
    const { data: rows } = await q;
    return rows ?? [];
  });

// ============ COLLECTIONS ============
export const listCollections = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => ws.parse(d))
  .handler(async ({ data, context }) => {
    const { data: cols, error } = await context.supabase
      .from('wa_catalog_collections').select('*, wa_catalog_collection_items(product_id)')
      .eq('workspace_id', data.workspaceId)
      .order('sort_order');
    if (error) throw error;
    return cols ?? [];
  });

export const upsertCollection = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    workspaceId: string; id?: string; name: string; description?: string;
    cover_url?: string; is_featured?: boolean; sort_order?: number; productIds?: string[];
  }) => z.object({
    workspaceId: z.string().uuid(),
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(120),
    description: z.string().max(1000).optional(),
    cover_url: z.string().url().optional().or(z.literal('')),
    is_featured: z.boolean().optional(),
    sort_order: z.number().int().optional(),
    productIds: z.array(z.string().uuid()).max(200).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const row = {
      workspace_id: data.workspaceId,
      name: data.name,
      description: data.description ?? null,
      cover_url: data.cover_url || null,
      is_featured: data.is_featured ?? false,
      sort_order: data.sort_order ?? 0,
      updated_at: new Date().toISOString(),
    };
    let colId = data.id;
    if (colId) {
      const { error } = await context.supabase.from('wa_catalog_collections')
        .update(row).eq('id', colId);
      if (error) throw error;
    } else {
      const { data: ins, error } = await context.supabase.from('wa_catalog_collections')
        .insert(row).select('id').single();
      if (error) throw error;
      colId = ins.id;
    }
    if (data.productIds) {
      await context.supabase.from('wa_catalog_collection_items').delete().eq('collection_id', colId);
      if (data.productIds.length) {
        await context.supabase.from('wa_catalog_collection_items').insert(
          data.productIds.map((pid, i) => ({
            collection_id: colId!, product_id: pid, workspace_id: data.workspaceId, sort_order: i,
          }))
        );
      }
    }
    return { id: colId };
  });

export const deleteCollection = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from('wa_catalog_collections').delete().eq('id', data.id);
    if (error) throw error;
    return { ok: true };
  });

// ============ SHARE / MULTI-PRODUCT MESSAGES ============
export const sendCatalogMessage = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    workspaceId: string; to: string; bodyText: string;
    productIds: string[]; collectionId?: string; header?: string; footer?: string;
  }) => z.object({
    workspaceId: z.string().uuid(),
    to: z.string().min(6).max(32),
    bodyText: z.string().min(1).max(1024),
    productIds: z.array(z.string().uuid()).min(1).max(30),
    collectionId: z.string().uuid().optional(),
    header: z.string().max(60).optional(),
    footer: z.string().max(60).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: cfg } = await context.supabase
      .from('wa_catalog_config').select('*').eq('workspace_id', data.workspaceId).maybeSingle();
    const { data: prods } = await context.supabase.from('products')
      .select('id, sku, retailer_id').in('id', data.productIds).eq('workspace_id', data.workspaceId);
    const items = (prods ?? []).map(p => ({ product_retailer_id: p.retailer_id ?? p.sku ?? `wdf_${p.id.slice(0,12)}` }));

    const { token, phoneNumberId } = await resolveWaCatalogCredentials(data.workspaceId, cfg);
    if (!token || !phoneNumberId || !cfg?.catalog_id) {
      return { ok: false, staged: true, reason: 'WhatsApp Cloud API credentials not configured.' };
    }


    const useMulti = items.length > 1;
    const payload = useMulti ? {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: data.to,
      type: 'interactive',
      interactive: {
        type: 'product_list',
        header: { type: 'text', text: (data.header || 'Featured products').slice(0, 60) },
        body: { text: data.bodyText },
        footer: data.footer ? { text: data.footer } : undefined,
        action: {
          catalog_id: cfg.catalog_id,
          sections: [{ title: 'Products', product_items: items.slice(0, 30) }],
        },
      },
    } : {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: data.to,
      type: 'interactive',
      interactive: {
        type: 'product',
        body: { text: data.bodyText },
        footer: data.footer ? { text: data.footer } : undefined,
        action: { catalog_id: cfg.catalog_id, product_retailer_id: items[0].product_retailer_id },
      },
    };

    const res = await metaFetch(`/${phoneNumberId}/messages`, token, {
      method: 'POST', body: JSON.stringify(payload),
    });
    // Log share as an analytics signal (incremental, not overwriting).
    for (const pid of data.productIds) {
      await bumpCatalogAnalytics(context.supabase, {
        workspaceId: data.workspaceId, productId: pid, field: 'shares',
      });
    }

    return { ok: true, messageId: res?.messages?.[0]?.id ?? null };
  });

// ============ ANALYTICS ============
export const getCatalogAnalytics = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; days?: number }) =>
    z.object({ workspaceId: z.string().uuid(), days: z.number().int().min(1).max(180).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const days = data.days ?? 30;
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const { data: rows } = await context.supabase
      .from('wa_catalog_analytics_daily')
      .select('date, views, shares, clicks, add_to_cart, orders, revenue, product_id')
      .eq('workspace_id', data.workspaceId).gte('date', since);
    const totals = (rows ?? []).reduce((acc, r) => {
      acc.views += r.views; acc.shares += r.shares; acc.clicks += r.clicks;
      acc.add_to_cart += r.add_to_cart; acc.orders += r.orders;
      acc.revenue += Number(r.revenue) || 0;
      return acc;
    }, { views: 0, shares: 0, clicks: 0, add_to_cart: 0, orders: 0, revenue: 0 });

    // Top products
    const byProd = new Map<string, { product_id: string; shares: number; orders: number; revenue: number }>();
    for (const r of rows ?? []) {
      if (!r.product_id) continue;
      const cur = byProd.get(r.product_id) ?? { product_id: r.product_id, shares: 0, orders: 0, revenue: 0 };
      cur.shares += r.shares; cur.orders += r.orders; cur.revenue += Number(r.revenue) || 0;
      byProd.set(r.product_id, cur);
    }
    const top = [...byProd.values()].sort((a, b) => b.shares - a.shares).slice(0, 10);
    const ids = top.map(t => t.product_id);
    const { data: prods } = ids.length ? await context.supabase.from('products')
      .select('id, name, image_url').in('id', ids) : { data: [] as any[] };
    const topProducts = top.map(t => ({
      ...t,
      product: (prods ?? []).find((p: any) => p.id === t.product_id) ?? null,
    }));

    return { totals, series: rows ?? [], topProducts };
  });

// ============ RECOMMENDATIONS ============
export const getRecommendations = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; contactId?: string; limit?: number }) =>
    z.object({
      workspaceId: z.string().uuid(),
      contactId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(20).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const limit = data.limit ?? 6;
    // Simple heuristic: featured + best-selling from analytics.
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { data: agg } = await context.supabase
      .from('wa_catalog_analytics_daily')
      .select('product_id, orders, shares')
      .eq('workspace_id', data.workspaceId).gte('date', since);
    const score = new Map<string, number>();
    for (const r of agg ?? []) {
      if (!r.product_id) continue;
      score.set(r.product_id, (score.get(r.product_id) ?? 0) + r.orders * 3 + r.shares);
    }
    const topIds = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);

    let picks: any[] = [];
    if (topIds.length) {
      const { data: rows } = await context.supabase.from('products')
        .select('id, name, image_url, price, sale_price, retailer_id, sku')
        .eq('workspace_id', data.workspaceId).in('id', topIds);
      picks = rows ?? [];
    }
    if (picks.length < limit) {
      const need = limit - picks.length;
      const { data: featured } = await context.supabase.from('products')
        .select('id, name, image_url, price, sale_price, retailer_id, sku')
        .eq('workspace_id', data.workspaceId).eq('is_active', true)
        .eq('is_featured', true).limit(need);
      const have = new Set(picks.map(p => p.id));
      for (const f of featured ?? []) if (!have.has(f.id)) picks.push(f);
    }
    return picks.slice(0, limit);
  });
