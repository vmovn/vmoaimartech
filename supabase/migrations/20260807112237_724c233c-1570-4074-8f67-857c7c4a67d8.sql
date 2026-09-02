DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'target_platform'
      AND (
        c.column_default ILIKE '%wadiff%'
        OR c.column_default ILIKE '%swiffer%'
      )
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN target_platform SET DEFAULT %L', t.table_schema, t.table_name, 'pmai');
    EXECUTE format(
      'UPDATE %I.%I SET target_platform = %L WHERE target_platform IN (%L, %L)',
      t.table_schema, t.table_name, 'pmai', 'wadiff', 'swiffer'
    );
  END LOOP;
END $$;

DO $$
DECLARE j record;
BEGIN
  FOR j IN
    SELECT jobname, schedule, command
    FROM cron.job
    WHERE jobname LIKE 'wadiff-%' OR jobname LIKE 'swiffer-%'
  LOOP
    PERFORM cron.unschedule(j.jobname);
    PERFORM cron.schedule(
      regexp_replace(j.jobname, '^(wadiff|swiffer)-', 'pmai-'),
      j.schedule,
      j.command
    );
  END LOOP;
END $$;
