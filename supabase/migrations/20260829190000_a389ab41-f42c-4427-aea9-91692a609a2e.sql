-- Product first-run bootstrap security. Additive: the frozen 290 baseline
-- migrations remain unchanged.

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
