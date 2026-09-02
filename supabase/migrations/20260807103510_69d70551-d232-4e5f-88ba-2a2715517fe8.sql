UPDATE public.marketplace_integrations SET docs_url = replace(docs_url, 'wadiff', 'pmai') WHERE docs_url ILIKE '%wadiff%';
UPDATE public.marketplace_integrations SET docs_url = replace(docs_url, 'docs.swiffer.io', 'docs.pm.ai.vn') WHERE docs_url ILIKE '%docs.swiffer.io%';
UPDATE public.marketplace_integrations SET tagline = replace(replace(tagline, 'Wadiff', 'PM.ai.vn'), 'wadiff', 'pm.ai.vn') WHERE tagline ILIKE '%wadiff%';
UPDATE public.marketplace_integrations SET tagline = replace(replace(tagline, 'Swiffer', 'PM.ai.vn'), 'swiffer', 'pm.ai.vn') WHERE tagline ILIKE '%swiffer%';
UPDATE public.plugin_categories SET description = replace(replace(description, 'Wadiff', 'PM.ai.vn'), 'wadiff', 'pm.ai.vn') WHERE description ILIKE '%wadiff%';
UPDATE public.plugin_categories SET description = replace(replace(description, 'Swiffer', 'PM.ai.vn'), 'swiffer', 'pm.ai.vn') WHERE description ILIKE '%swiffer%';
