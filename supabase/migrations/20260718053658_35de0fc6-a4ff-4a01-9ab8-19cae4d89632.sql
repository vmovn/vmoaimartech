
DO $$
BEGIN
  -- unschedule previous version if it exists (ignore errors)
  PERFORM cron.unschedule('billing-daily-revenue-rollup') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'billing-daily-revenue-rollup');

  PERFORM cron.schedule(
    'billing-daily-revenue-rollup',
    '15 0 * * *',
    $q$SELECT public._wa_cron_post('/api/public/hooks/billing/rollup');$q$
  );
END $$;
