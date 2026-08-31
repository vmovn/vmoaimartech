
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
