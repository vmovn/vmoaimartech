-- Local infrastructure seed. Product/demo records are intentionally omitted.
-- All buckets are private; application access is enforced by existing
-- storage.objects policies and signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('attachments', 'attachments', false, 52428800, null),
  ('avatars', 'avatars', false, 52428800, null),
  ('branding', 'branding', false, 52428800, null),
  ('campaign-media', 'campaign-media', false, 52428800, null),
  ('custom-fields', 'custom-fields', false, 52428800, null),
  ('exports', 'exports', false, 52428800, null),
  ('kb-sources', 'kb-sources', false, 52428800, null),
  ('widget-uploads', 'widget-uploads', false, 52428800, null)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
