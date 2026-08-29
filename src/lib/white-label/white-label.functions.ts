/**
 * White Label — per-workspace branding + theme engine.
 * Workspace admins update the config; everyone in the workspace can read it.
 * Anonymous callers may look up a config by custom_domain to render tenant branding.
 */
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

async function activeWorkspaceId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.workspace_id as string | undefined) ?? null;
}

async function requireActiveWorkspaceId(supabase: any, userId: string): Promise<string> {
  const id = await activeWorkspaceId(supabase, userId);
  if (!id) throw new Error('No workspace for user');
  return id;
}

const nStr = z.string().max(2000).optional().nullable();
const color = z.string().max(64).optional().nullable();

const WhiteLabelSchema = z.object({
  // Brand identity
  brand_name: z.string().max(80).optional().nullable(),
  logo_url: z.string().url().optional().nullable(),
  logo_dark_url: z.string().url().optional().nullable(),
  favicon_url: z.string().url().optional().nullable(),

  // Colors
  primary_color: color,
  secondary_color: color,
  accent_color: color,
  background_color: color,

  // Sidebar theme
  sidebar_background: color,
  sidebar_foreground: color,
  sidebar_accent: color,

  // Dashboard theme
  dashboard_background: color,
  dashboard_accent: color,

  // Typography
  font_family_sans: nStr,
  font_family_heading: nStr,
  font_family_mono: nStr,
  font_size_base: nStr,

  // Dark / light mode
  default_color_mode: z.enum(['light', 'dark', 'system']).optional().nullable(),
  dark_primary_color: color,
  dark_background_color: color,
  dark_accent_color: color,

  // Login page
  login_background_url: z.string().url().optional().nullable(),
  login_headline: z.string().max(200).optional().nullable(),
  login_subheadline: z.string().max(400).optional().nullable(),
  login_layout: z.enum(['centered', 'split', 'minimal']).optional().nullable(),

  // Loader
  loader_url: z.string().url().optional().nullable(),
  loader_style: z.enum(['spinner', 'dots', 'bar', 'logo', 'custom']).optional().nullable(),

  // Icons
  icon_style: z.enum(['outline', 'solid', 'duotone']).optional().nullable(),
  icon_stroke_width: z.number().min(0.5).max(4).optional().nullable(),

  // Radius
  border_radius: nStr,

  // Email branding
  email_logo_url: z.string().url().optional().nullable(),
  email_from_name: z.string().max(80).optional().nullable(),
  email_primary_color: color,
  email_header_color: color,
  custom_email_footer: z.string().max(4000).optional().nullable(),

  // Custom domain / SEO
  custom_domain: z.string().max(200).optional().nullable(),
  support_email: z.string().email().optional().nullable(),
  support_url: z.string().url().optional().nullable(),
  meta_title: z.string().max(120).optional().nullable(),
  meta_description: z.string().max(300).optional().nullable(),

  // Advanced
  remove_lovable_branding: z.boolean().optional(),
  custom_css: z.string().max(50000).optional().nullable(),
  custom_js: z.string().max(50000).optional().nullable(),
  is_active: z.boolean().optional(),
});

export const getWhiteLabel = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ workspaceId: z.string().uuid().optional().nullable() }).partial().parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    // Honour the caller's *active* workspace when they are a member of it —
    // otherwise fall back to their first membership. Without this the brand
    // could resolve from a different workspace than the one being viewed.
    let workspaceId: string | null = null;
    const requested = data?.workspaceId ?? null;
    if (requested) {
      const { data: member } = await context.supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', context.userId)
        .eq('workspace_id', requested)
        .maybeSingle();
      workspaceId = (member?.workspace_id as string | undefined) ?? null;
    }
    if (!workspaceId) workspaceId = await activeWorkspaceId(context.supabase, context.userId);
    if (!workspaceId) return { config: null, workspaceId: null };
    const { data: config } = await context.supabase
      .from('white_label_configs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    return { config: config ?? null, workspaceId };
  });


export const upsertWhiteLabel = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => WhiteLabelSchema.parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await requireActiveWorkspaceId(context.supabase, context.userId);
    const { data: before } = await context.supabase
      .from('white_label_configs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    const { data: saved, error } = await context.supabase
      .from('white_label_configs')
      .upsert({ workspace_id: workspaceId, ...data }, { onConflict: 'workspace_id' })
      .select('*')
      .maybeSingle();
    if (error) throw error;

    // Record which colours changed, the resolved `--primary`, and the CSS
    // variables that move as a result.
    const { auditBrandingColorChange } = await import('./branding-audit.server');
    await auditBrandingColorChange({
      workspaceId,
      actorId: context.userId,
      before,
      after: saved,
    });

    return { config: saved };
  });

export const verifyCustomDomain = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspaceId = await requireActiveWorkspaceId(context.supabase, context.userId);
    // Placeholder — a real check would resolve DNS / TXT record.
    // For now we optimistically mark verified so admins can preview the flow.
    const { data, error } = await context.supabase
      .from('white_label_configs')
      .update({ custom_domain_verified: true })
      .eq('workspace_id', workspaceId)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return { config: data };
  });
