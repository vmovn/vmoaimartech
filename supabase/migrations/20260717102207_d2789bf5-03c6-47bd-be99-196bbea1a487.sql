
-- 1) Platform-level role enum & table (superadmin / support)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('superadmin','support');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'superadmin');
$$;

DROP POLICY IF EXISTS "Users view own platform roles" ON public.user_roles;
CREATE POLICY "Users view own platform roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins manage platform roles" ON public.user_roles;
CREATE POLICY "Super admins manage platform roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 2) Expand permission catalog
INSERT INTO public.permissions (key, resource, action, description) VALUES
  -- CRUD - Contacts
  ('contacts.create','contacts','create','Tạo liên hệ'),
  ('contacts.read','contacts','read','Xem liên hệ'),
  ('contacts.update','contacts','update','Cập nhật liên hệ'),
  ('contacts.delete','contacts','delete','Xóa liên hệ'),
  -- Companies
  ('companies.create','companies','create','Tạo doanh nghiệp'),
  ('companies.read','companies','read','Xem doanh nghiệp'),
  ('companies.update','companies','update','Cập nhật doanh nghiệp'),
  ('companies.delete','companies','delete','Xóa doanh nghiệp'),
  -- Deals
  ('deals.create','deals','create','Tạo cơ hội bán hàng'),
  ('deals.read','deals','read','Xem cơ hội bán hàng'),
  ('deals.update','deals','update','Cập nhật cơ hội bán hàng'),
  ('deals.delete','deals','delete','Xóa cơ hội bán hàng'),
  -- Campaigns
  ('campaigns.create','campaigns','create','Tạo chiến dịch'),
  ('campaigns.read','campaigns','read','Xem chiến dịch'),
  ('campaigns.update','campaigns','update','Cập nhật chiến dịch'),
  ('campaigns.delete','campaigns','delete','Xóa chiến dịch'),
  ('campaigns.send','campaigns','send','Gửi chiến dịch'),
  -- Automations
  ('automations.create','automations','create','Tạo tự động hóa'),
  ('automations.read','automations','read','Xem tự động hóa'),
  ('automations.update','automations','update','Cập nhật tự động hóa'),
  ('automations.delete','automations','delete','Xóa tự động hóa'),
  -- Inbox / conversations
  ('inbox.read','inbox','read','Xem hộp thư'),
  ('inbox.reply','inbox','reply','Trả lời hội thoại'),
  ('inbox.assign','inbox','assign','Phân công hội thoại'),
  -- Reports / analytics
  ('analytics.read','analytics','read','Xem phân tích'),
  ('reports.read','reports','read','Xem báo cáo'),
  ('reports.export','reports','export','Xuất báo cáo'),
  -- AI studio
  ('ai.use','ai','use','Sử dụng AI Studio'),
  -- Workspace
  ('workspace.read','workspaces','read','Xem không gian làm việc'),
  ('workspace.update','workspaces','update','Cập nhật không gian làm việc'),
  ('workspace.delete','workspaces','delete','Xóa không gian làm việc'),
  ('workspace.invite','workspaces','invite','Mời thành viên'),
  ('workspace.manage_members','workspaces','manage_members','Quản lý thành viên'),
  -- Billing
  ('billing.read','billing','read','Xem thanh toán'),
  ('billing.manage','billing','manage','Quản lý gói đăng ký'),
  ('billing.invoices','billing','invoices','Truy cập hóa đơn'),
  -- Organization
  ('organization.read','organizations','read','Xem tổ chức'),
  ('organization.update','organizations','update','Cập nhật tổ chức'),
  ('organization.delete','organizations','delete','Xóa tổ chức'),
  ('organization.transfer','organizations','transfer','Chuyển quyền sở hữu'),
  -- Roles & permissions
  ('roles.read','roles','read','Xem vai trò'),
  ('roles.manage','roles','manage','Tạo và chỉnh sửa vai trò'),
  ('roles.assign','roles','assign','Gán vai trò cho người dùng'),
  -- API
  ('api_keys.read','api_keys','read','Xem API key'),
  ('api_keys.manage','api_keys','manage','Tạo và thu hồi API key'),
  -- Pages / menu
  ('page.dashboard','pages','view','Xem trang tổng quan'),
  ('page.inbox','pages','view','Xem trang hộp thư'),
  ('page.contacts','pages','view','Xem trang liên hệ'),
  ('page.companies','pages','view','Xem trang doanh nghiệp'),
  ('page.deals','pages','view','Xem trang cơ hội bán hàng'),
  ('page.campaigns','pages','view','Xem trang chiến dịch'),
  ('page.automations','pages','view','Xem trang tự động hóa'),
  ('page.ai_studio','pages','view','Xem trang AI Studio'),
  ('page.analytics','pages','view','Xem trang phân tích'),
  ('page.reports','pages','view','Xem trang báo cáo'),
  ('page.team','pages','view','Xem trang đội nhóm'),
  ('page.billing','pages','view','Xem trang thanh toán'),
  ('page.settings','pages','view','Xem trang cài đặt'),
  ('page.organization','pages','view','Xem trang tổ chức'),
  ('page.workspace','pages','view','Xem trang không gian làm việc'),
  ('page.roles','pages','view','Xem trang vai trò'),
  -- Audit
  ('audit_logs.read','audit_logs','read','Xem nhật ký kiểm tra')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

-- 3) Seed default SYSTEM roles (organization_id NULL, is_system = true)
INSERT INTO public.roles (organization_id, scope, key, name, description, is_system) VALUES
  (NULL,'organization','owner','Chủ sở hữu','Toàn quyền quản lý tổ chức.',true),
  (NULL,'organization','admin','Quản trị viên','Quản trị hệ thống, thành viên và cấu hình tổ chức.',true),
  (NULL,'organization','manager','Quản lý','Quản lý đội nhóm, khách hàng và quy trình kinh doanh.',true),
  (NULL,'organization','sales_agent','Nhân viên kinh doanh','Quản lý khách hàng, cơ hội và quy trình bán hàng.',true),
  (NULL,'organization','support_agent','Nhân viên chăm sóc khách hàng','Tiếp nhận, hỗ trợ và chăm sóc khách hàng.',true),
  (NULL,'organization','marketing','Marketing','Quản lý chiến dịch, nội dung và tự động hóa marketing.',true),
  (NULL,'organization','viewer','Chỉ xem','Chỉ có quyền xem dữ liệu được cấp phép.',true)
ON CONFLICT (organization_id, key) DO NOTHING;

-- Helper to map permissions to a system role
CREATE OR REPLACE FUNCTION public._grant_perms(_role_key text, _perm_keys text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE _rid uuid;
BEGIN
  SELECT id INTO _rid FROM public.roles WHERE organization_id IS NULL AND key = _role_key;
  IF _rid IS NULL THEN RETURN; END IF;
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT _rid, p.id FROM public.permissions p WHERE p.key = ANY(_perm_keys)
  ON CONFLICT DO NOTHING;
END; $$;

-- Owner & Admin: all permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.organization_id IS NULL AND r.key IN ('owner','admin')
ON CONFLICT DO NOTHING;

-- Manager
SELECT public._grant_perms('manager', ARRAY[
  'page.dashboard','page.inbox','page.contacts','page.companies','page.deals',
  'page.campaigns','page.automations','page.analytics','page.reports','page.team',
  'page.settings','page.workspace','page.roles','page.ai_studio',
  'contacts.create','contacts.read','contacts.update','contacts.delete',
  'companies.create','companies.read','companies.update','companies.delete',
  'deals.create','deals.read','deals.update','deals.delete',
  'campaigns.create','campaigns.read','campaigns.update','campaigns.send',
  'automations.create','automations.read','automations.update',
  'inbox.read','inbox.reply','inbox.assign',
  'analytics.read','reports.read','reports.export','ai.use',
  'workspace.read','workspace.update','workspace.invite','workspace.manage_members',
  'organization.read','roles.read','roles.assign','audit_logs.read'
]);

-- Sales Agent
SELECT public._grant_perms('sales_agent', ARRAY[
  'page.dashboard','page.inbox','page.contacts','page.companies','page.deals',
  'page.analytics','page.reports','page.settings',
  'contacts.create','contacts.read','contacts.update',
  'companies.create','companies.read','companies.update',
  'deals.create','deals.read','deals.update',
  'inbox.read','inbox.reply',
  'analytics.read','reports.read',
  'workspace.read','organization.read'
]);

-- Support Agent
SELECT public._grant_perms('support_agent', ARRAY[
  'page.dashboard','page.inbox','page.contacts','page.companies','page.settings',
  'contacts.read','contacts.update',
  'companies.read',
  'inbox.read','inbox.reply','inbox.assign',
  'workspace.read','organization.read'
]);

-- Marketing
SELECT public._grant_perms('marketing', ARRAY[
  'page.dashboard','page.campaigns','page.automations','page.ai_studio',
  'page.analytics','page.reports','page.contacts','page.settings',
  'contacts.read',
  'campaigns.create','campaigns.read','campaigns.update','campaigns.delete','campaigns.send',
  'automations.create','automations.read','automations.update','automations.delete',
  'ai.use','analytics.read','reports.read','reports.export',
  'workspace.read','organization.read'
]);

-- Viewer
SELECT public._grant_perms('viewer', ARRAY[
  'page.dashboard','page.inbox','page.contacts','page.companies','page.deals',
  'page.campaigns','page.automations','page.analytics','page.reports','page.settings',
  'contacts.read','companies.read','deals.read','campaigns.read','automations.read',
  'inbox.read','analytics.read','reports.read',
  'workspace.read','organization.read'
]);

DROP FUNCTION public._grant_perms(text, text[]);

-- 4) Core has_permission function with super admin override
CREATE OR REPLACE FUNCTION public.has_permission(
  _user_id uuid,
  _permission_key text,
  _organization_id uuid DEFAULT NULL,
  _workspace_id uuid DEFAULT NULL
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_role_assignments ura
      JOIN public.role_permissions rp ON rp.role_id = ura.role_id
      JOIN public.permissions p ON p.id = rp.permission_id
      LEFT JOIN public.roles r ON r.id = ura.role_id
      WHERE ura.user_id = _user_id
        AND p.key = _permission_key
        AND (_organization_id IS NULL OR ura.organization_id = _organization_id OR ura.organization_id IS NULL)
        AND (_workspace_id IS NULL OR ura.workspace_id = _workspace_id OR ura.workspace_id IS NULL)
    )
    -- Fallback: legacy org_role → owner/admin implicit full permissions
    OR (
      _organization_id IS NOT NULL
      AND public.has_org_role(_organization_id, _user_id, ARRAY['owner'::org_role,'admin'::org_role])
    );
$$;

-- Effective permission keys resolver (used by frontend hook)
CREATE OR REPLACE FUNCTION public.my_permissions(
  _organization_id uuid DEFAULT NULL,
  _workspace_id uuid DEFAULT NULL
) RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- Super admin: everything
  SELECT p.key FROM public.permissions p
  WHERE public.is_super_admin(auth.uid())
  UNION
  -- Org owner/admin (legacy fallback): everything
  SELECT p.key FROM public.permissions p
  WHERE _organization_id IS NOT NULL
    AND public.has_org_role(_organization_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role])
  UNION
  -- Assigned roles
  SELECT DISTINCT p.key
  FROM public.user_role_assignments ura
  JOIN public.role_permissions rp ON rp.role_id = ura.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ura.user_id = auth.uid()
    AND (_organization_id IS NULL OR ura.organization_id = _organization_id OR ura.organization_id IS NULL)
    AND (_workspace_id  IS NULL OR ura.workspace_id  = _workspace_id  OR ura.workspace_id  IS NULL);
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid,text,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_permissions(uuid,uuid) TO authenticated;

-- Product first-run bootstrap security (requires settings + user_roles).
CREATE TABLE public.setup_secret_attempts (
  key_hash text PRIMARY KEY,
  attempt_count integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.setup_secret_attempts TO service_role;
REVOKE ALL ON public.setup_secret_attempts FROM PUBLIC, anon, authenticated;
ALTER TABLE public.setup_secret_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.setup_rate_limit_status(_key_hash text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locked_until timestamptz;
BEGIN
  SELECT locked_until INTO v_locked_until
  FROM public.setup_secret_attempts
  WHERE key_hash = _key_hash;

  IF v_locked_until IS NULL OR v_locked_until <= now() THEN
    RETURN 0;
  END IF;
  RETURN greatest(1, ceil(extract(epoch FROM (v_locked_until - now())))::integer);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_setup_secret_failure(_key_hash text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.setup_secret_attempts%ROWTYPE;
  v_attempts integer;
BEGIN
  INSERT INTO public.setup_secret_attempts (key_hash)
  VALUES (_key_hash)
  ON CONFLICT (key_hash) DO NOTHING;

  SELECT * INTO v_row
  FROM public.setup_secret_attempts
  WHERE key_hash = _key_hash
  FOR UPDATE;

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > now() THEN
    RETURN greatest(1, ceil(extract(epoch FROM (v_row.locked_until - now())))::integer);
  END IF;

  IF v_row.window_started_at < now() - interval '10 minutes' THEN
    v_attempts := 1;
    UPDATE public.setup_secret_attempts
    SET attempt_count = 1,
        window_started_at = now(),
        locked_until = NULL,
        updated_at = now()
    WHERE key_hash = _key_hash;
  ELSE
    v_attempts := v_row.attempt_count + 1;
    UPDATE public.setup_secret_attempts
    SET attempt_count = v_attempts,
        locked_until = CASE WHEN v_attempts >= 5 THEN now() + interval '15 minutes' ELSE NULL END,
        updated_at = now()
    WHERE key_hash = _key_hash;
  END IF;

  IF v_attempts >= 5 THEN
    RETURN 900;
  END IF;
  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_setup_secret_failures(_key_hash text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.setup_secret_attempts WHERE key_hash = _key_hash;
$$;

CREATE OR REPLACE FUNCTION public.set_product_setup_setting(_key text, _value jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('product_setup_lifecycle'));

  IF EXISTS (
    SELECT 1
    FROM public.settings
    WHERE scope = 'platform'::public.settings_scope
      AND key = 'setup_complete'
      AND coalesce((value->>'complete')::boolean, false)
  ) THEN
    RAISE EXCEPTION 'Product setup is already complete' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_id
  FROM public.settings
  WHERE scope = 'platform'::public.settings_scope AND key = _key
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NULL THEN
    INSERT INTO public.settings (
      scope, organization_id, workspace_id, user_id, key, value
    ) VALUES (
      'platform'::public.settings_scope, NULL, NULL, NULL, _key, _value
    );
  ELSE
    UPDATE public.settings
    SET value = _value, updated_at = now()
    WHERE id = v_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_product_setup_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_complete boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('product_setup_lifecycle'));

  SELECT coalesce((value->>'complete')::boolean, false) INTO v_complete
  FROM public.settings
  WHERE scope = 'platform'::public.settings_scope AND key = 'setup_complete'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_complete THEN
    RAISE EXCEPTION 'Product setup is already complete' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'superadmin'::public.app_role) THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'superadmin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'superadmin'::public.app_role
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_product_setup(_completed_at timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_complete boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('product_setup_lifecycle'));

  SELECT id, coalesce((value->>'complete')::boolean, false)
  INTO v_id, v_complete
  FROM public.settings
  WHERE scope = 'platform'::public.settings_scope AND key = 'setup_complete'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_complete THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'superadmin'::public.app_role) THEN
    RAISE EXCEPTION 'Platform Super Admin is required' USING ERRCODE = '42501';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.settings (
      scope, organization_id, workspace_id, user_id, key, value
    ) VALUES (
      'platform'::public.settings_scope,
      NULL,
      NULL,
      NULL,
      'setup_complete',
      jsonb_build_object('complete', true, 'completed_at', _completed_at)
    );
  ELSE
    UPDATE public.settings
    SET value = jsonb_build_object('complete', true, 'completed_at', _completed_at),
        updated_at = now()
    WHERE id = v_id;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.setup_rate_limit_status(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_setup_secret_failure(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_setup_secret_failures(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_product_setup_setting(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_product_setup_superadmin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_product_setup(timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.setup_rate_limit_status(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_setup_secret_failure(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_setup_secret_failures(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_product_setup_setting(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_product_setup_superadmin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_product_setup(timestamptz) TO service_role;
