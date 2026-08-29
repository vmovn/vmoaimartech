/**
 * Theme engine — server functions and token application helper.
 *
 * Themes ship a `tokens` object of CSS custom properties (e.g. `--primary`).
 * `applyThemeTokens` injects them into `:root` at runtime, so a workspace's
 * active theme + overrides re-skins the app without a rebuild.
 */
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

function publicClient() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: any, init: any) => {
        const h = new Headers(init?.headers);
        if (key.startsWith('sb_') && h.get('Authorization') === `Bearer ${key}`) h.delete('Authorization');
        h.set('apikey', key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

async function activeWorkspaceId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data?.workspace_id) throw new Error('No workspace for user');
  return data.workspace_id as string;
}

export const listPublicThemes = createServerFn({ method: 'GET' }).handler(async () => {
  const client = publicClient();
  const { data, error } = await client
    .from('themes')
    .select('*')
    .eq('is_public', true)
    .order('is_featured', { ascending: false })
    .order('install_count', { ascending: false })
    .limit(60);
  if (error) throw error;
  return { themes: data ?? [] };
});

export const activateTheme = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: { themeId: string; overrides?: Record<string, string> }) =>
    z.object({ themeId: z.string().uuid(), overrides: z.record(z.string()).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await activeWorkspaceId(context.supabase, context.userId);
    await context.supabase
      .from('theme_installations')
      .update({ is_active: false })
      .eq('workspace_id', workspaceId);
    const { error } = await context.supabase
      .from('theme_installations')
      .upsert(
        {
          workspace_id: workspaceId,
          theme_id: data.themeId,
          overrides: data.overrides ?? {},
          is_active: true,
          installed_by: context.userId,
        },
        { onConflict: 'workspace_id,theme_id' },
      );
    if (error) throw error;
    return { ok: true };
  });

export const getActiveTheme = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspaceId = await activeWorkspaceId(context.supabase, context.userId);
    const { data } = await context.supabase
      .from('theme_installations')
      .select('*, themes(*)')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .maybeSingle();
    return { installation: data ?? null };
  });

/**
 * Reset the workspace back to the default look: no marketplace theme active.
 * Accent + appearance mode are reset by their own owners on the client.
 */
export const resetWorkspaceTheme = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspaceId = await activeWorkspaceId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from('theme_installations')
      .update({ is_active: false })
      .eq('workspace_id', workspaceId);
    if (error) throw error;
    return { ok: true };
  });
