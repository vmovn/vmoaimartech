
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior schedule with the same name (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('sla-breach-scanner');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'sla-breach-scanner',
  '*/5 * * * *',
  $$SELECT public._wa_cron_post('/api/public/hooks/sla-scan');$$
);
