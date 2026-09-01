INSERT INTO public.settings (scope, key, value, organization_id, workspace_id, user_id)
VALUES
  ('platform', 'general', '{"platform_name":"PM.AI.VN","tagline":"Hợp nhất mọi hội thoại với khách hàng","default_org_size":5}'::jsonb, NULL, NULL, NULL),
  ('platform', 'branding', '{"accent_color":"#ffbd24"}'::jsonb, NULL, NULL, NULL)
ON CONFLICT (scope, organization_id, workspace_id, user_id, key) DO NOTHING;
