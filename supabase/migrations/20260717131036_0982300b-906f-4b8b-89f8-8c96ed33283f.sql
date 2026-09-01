
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public._wa_cron_post(
  _path text,
  _body jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, net, vault
AS $fn$
DECLARE
  _base text;
  _token text;
  _req bigint;
BEGIN
  SELECT NULLIF(btrim(secret.decrypted_secret), '')
  INTO _base
  FROM vault.decrypted_secrets AS secret
  WHERE secret.name = 'APP_ORIGIN';

  SELECT NULLIF(btrim(secret.decrypted_secret), '')
  INTO _token
  FROM vault.decrypted_secrets AS secret
  WHERE secret.name = 'INTERNAL_CRON_TOKEN';

  IF _base IS NULL THEN
    RAISE EXCEPTION 'pg_cron dispatcher is not configured: APP_ORIGIN is missing'
      USING ERRCODE = '22023';
  END IF;
  IF _base !~ '^https?://[^/?#]+/?$' THEN
    RAISE EXCEPTION 'pg_cron dispatcher is not configured: APP_ORIGIN must be an HTTP(S) origin'
      USING ERRCODE = '22023';
  END IF;
  IF _token IS NULL OR char_length(_token) < 32 THEN
    RAISE EXCEPTION 'pg_cron dispatcher is not configured: INTERNAL_CRON_TOKEN is missing or invalid'
      USING ERRCODE = '22023';
  END IF;

  _base := rtrim(_base, '/');

  SELECT net.http_post(
    url := _base || _path,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', _token
    ),
    body := _body,
    timeout_milliseconds := 55000
  )
  INTO _req;

  RETURN _req;
END;
$fn$;

DO $$
DECLARE _j text;
BEGIN
  FOR _j IN SELECT jobname FROM cron.job WHERE jobname IN (
    'wa-process-outbox','wa-process-webhooks','wa-process-scheduled',
    'wa-flush-scheduled-messages','wa-run-scheduled-syncs','wa-cleanup-media'
  ) LOOP
    PERFORM cron.unschedule(_j);
  END LOOP;
END $$;

SELECT cron.schedule('wa-process-outbox','* * * * *',
  $q$ SELECT public._wa_cron_post('/api/public/hooks/process-outbox'); $q$);
SELECT cron.schedule('wa-process-webhooks','* * * * *',
  $q$ SELECT public._wa_cron_post('/api/public/hooks/process-webhooks'); $q$);
SELECT cron.schedule('wa-process-scheduled','* * * * *',
  $q$ SELECT public._wa_cron_post('/api/public/hooks/process-scheduled'); $q$);
SELECT cron.schedule('wa-flush-scheduled-messages','* * * * *',
  $q$ SELECT public._wa_cron_post('/api/public/hooks/flush-scheduled-messages'); $q$);
SELECT cron.schedule('wa-run-scheduled-syncs','*/5 * * * *',
  $q$ SELECT public._wa_cron_post('/api/public/hooks/run-scheduled-syncs'); $q$);
SELECT cron.schedule('wa-cleanup-media','17 * * * *',
  $q$ SELECT public._wa_cron_post('/api/public/hooks/cleanup-media'); $q$);
