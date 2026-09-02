
-- ============================================================
-- Phase 12: Billing core schema
-- ============================================================

-- Billing customers: per-org, per-provider customer record
CREATE TABLE public.billing_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_customer_id text NOT NULL,
  email text,
  name text,
  billing_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  tax_id text,
  currency text NOT NULL DEFAULT 'USD',
  is_default boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_customer_id),
  UNIQUE (organization_id, provider)
);
CREATE INDEX idx_billing_customers_org ON public.billing_customers(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_customers TO authenticated;
GRANT ALL ON public.billing_customers TO service_role;
ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view billing customers" ON public.billing_customers
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "Billing admins manage billing customers" ON public.billing_customers
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'billing'::org_role]))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'billing'::org_role]));

CREATE TRIGGER trg_billing_customers_updated_at
  BEFORE UPDATE ON public.billing_customers
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Payment methods
CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  billing_customer_id uuid REFERENCES public.billing_customers(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_payment_method_id text NOT NULL,
  type text NOT NULL DEFAULT 'card',
  brand text,
  last4 text,
  exp_month integer,
  exp_year integer,
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_payment_method_id)
);
CREATE INDEX idx_payment_methods_org ON public.payment_methods(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view payment methods" ON public.payment_methods
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "Billing admins manage payment methods" ON public.payment_methods
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'billing'::org_role]))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'billing'::org_role]));

CREATE TRIGGER trg_payment_methods_updated_at
  BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Usage meters: definitions of billable metrics
CREATE TABLE public.usage_meters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  unit text NOT NULL DEFAULT 'count',
  aggregation text NOT NULL DEFAULT 'sum',
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.usage_meters TO authenticated;
GRANT ALL ON public.usage_meters TO service_role;
ALTER TABLE public.usage_meters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads active meters" ON public.usage_meters
  FOR SELECT TO authenticated USING (is_active = true);

CREATE TRIGGER trg_usage_meters_updated_at
  BEFORE UPDATE ON public.usage_meters
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Usage events: raw metered records
CREATE TABLE public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  meter_code text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, meter_code, idempotency_key)
);
CREATE INDEX idx_usage_events_org_meter_time ON public.usage_events(organization_id, meter_code, occurred_at DESC);

GRANT SELECT, INSERT ON public.usage_events TO authenticated;
GRANT ALL ON public.usage_events TO service_role;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view usage events" ON public.usage_events
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "Members insert usage events" ON public.usage_events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id, auth.uid())
    AND meter_code <> 'ai_premium_credits'
  );

-- Tenant quotas: current-period counters
CREATE TABLE public.tenant_quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  meter_code text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  used numeric NOT NULL DEFAULT 0,
  included numeric NOT NULL DEFAULT 0,
  hard_limit numeric,
  overage_unit_price_cents integer,
  currency text NOT NULL DEFAULT 'USD',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, meter_code, period_start)
);
CREATE INDEX idx_tenant_quotas_org ON public.tenant_quotas(organization_id);

GRANT SELECT ON public.tenant_quotas TO authenticated;
GRANT ALL ON public.tenant_quotas TO service_role;
ALTER TABLE public.tenant_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view quotas" ON public.tenant_quotas
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE TRIGGER trg_tenant_quotas_updated_at
  BEFORE UPDATE ON public.tenant_quotas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Short-lived transaction records for Premium Credit reservation/settlement.
-- tenant_quotas remains the purchased-balance authority; usage_events remains
-- the historical-consumption authority.
CREATE TABLE public.ai_credit_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  feature text,
  provider_id uuid REFERENCES public.ai_providers(id) ON DELETE SET NULL,
  model text NOT NULL,
  reserved_credits bigint NOT NULL CHECK (reserved_credits > 0),
  settled_credits bigint CHECK (settled_credits IS NULL OR settled_credits >= 0),
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved','settled','released','expired')),
  usage_estimated boolean NOT NULL DEFAULT false,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_credit_reservations_org_status_expiry_idx
  ON public.ai_credit_reservations(organization_id, status, expires_at);
CREATE INDEX ai_credit_reservations_user_period_idx
  ON public.ai_credit_reservations(workspace_id, user_id, period_start, status);
ALTER TABLE public.ai_credit_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_credit_reservations FROM public, anon, authenticated;
GRANT ALL ON public.ai_credit_reservations TO service_role;
CREATE TRIGGER trg_ai_credit_reservations_updated_at
  BEFORE UPDATE ON public.ai_credit_reservations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Idempotently releases expired reservations. This is also invoked on every
-- new premium reservation, so a process/deployment crash cannot lock credits.
CREATE OR REPLACE FUNCTION public.release_expired_ai_credit_reservations(
  p_organization_id uuid DEFAULT NULL,
  p_cutoff timestamptz DEFAULT now()
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.ai_credit_reservations%ROWTYPE;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT * FROM public.ai_credit_reservations
    WHERE status = 'reserved'
      AND expires_at <= p_cutoff
      AND (p_organization_id IS NULL OR organization_id = p_organization_id)
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.tenant_quotas
      SET used = greatest(0, used - v_row.reserved_credits), updated_at = now()
      WHERE organization_id = v_row.organization_id
        AND meter_code = 'ai_premium_credits'
        AND period_start = v_row.period_start;
    UPDATE public.ai_credit_reservations
      SET status = 'expired', updated_at = now()
      WHERE id = v_row.id AND status = 'reserved';
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Atomic organization-pool + optional workspace/user-cap reservation.
CREATE OR REPLACE FUNCTION public.reserve_ai_premium_credits(
  p_request_id text,
  p_workspace_id uuid,
  p_user_id uuid,
  p_feature text,
  p_provider_id uuid,
  p_model text,
  p_credits bigint,
  p_lease_seconds integer DEFAULT 900
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id uuid;
  v_sub record;
  v_quota public.tenant_quotas%ROWTYPE;
  v_existing public.ai_credit_reservations%ROWTYPE;
  v_cap public.ai_user_credit_limits%ROWTYPE;
  v_month_actual numeric := 0;
  v_month_reserved numeric := 0;
  v_day_actual numeric := 0;
  v_day_reserved numeric := 0;
  v_period_end timestamptz;
BEGIN
  IF p_request_id IS NULL OR btrim(p_request_id) = '' OR p_credits IS NULL OR p_credits <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_reservation');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id, 0));

  SELECT * INTO v_existing FROM public.ai_credit_reservations
    WHERE request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', v_existing.status IN ('reserved','settled'),
      'reason', CASE WHEN v_existing.status IN ('reserved','settled') THEN NULL ELSE 'reservation_unavailable' END,
      'reservation_id', v_existing.id,
      'status', v_existing.status,
      'reserved_credits', v_existing.reserved_credits,
      'settled_credits', v_existing.settled_credits,
      'organization_id', v_existing.organization_id,
      'idempotent', true
    );
  END IF;

  SELECT organization_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id;
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'workspace_organization_unavailable');
  END IF;
  IF p_user_id IS NOT NULL AND NOT public.is_workspace_member(p_workspace_id, p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_workspace_mismatch');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_providers
    WHERE id = p_provider_id AND workspace_id = p_workspace_id AND enabled = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'provider_workspace_mismatch');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_models
    WHERE provider_id = p_provider_id AND model_id = p_model AND enabled = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'premium_model_unresolved');
  END IF;

  SELECT s.id, s.plan_id, s.current_period_start, s.current_period_end, p.limits
    INTO v_sub
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.organization_id = v_org_id
      AND s.status IN ('active','trialing')
      AND s.current_period_start IS NOT NULL
      AND s.current_period_start <= now()
      AND coalesce(s.current_period_end, 'infinity'::timestamptz) > now()
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'active_subscription_unavailable');
  END IF;
  IF NOT (v_sub.limits ? 'ai_premium_credits') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'premium_credits_unconfigured');
  END IF;
  IF jsonb_typeof(v_sub.limits->'ai_premium_credits') NOT IN ('number','null','string')
     OR (jsonb_typeof(v_sub.limits->'ai_premium_credits') = 'string'
         AND v_sub.limits->>'ai_premium_credits' <> 'unlimited')
     OR (jsonb_typeof(v_sub.limits->'ai_premium_credits') = 'number'
         AND (v_sub.limits->>'ai_premium_credits')::numeric < 0) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'premium_credits_unconfigured');
  END IF;

  v_period_end := coalesce(v_sub.current_period_end, 'infinity'::timestamptz);
  PERFORM public.release_expired_ai_credit_reservations(v_org_id, now());

  SELECT * INTO v_quota FROM public.tenant_quotas
    WHERE organization_id = v_org_id
      AND meter_code = 'ai_premium_credits'
      AND period_start = v_sub.current_period_start
      AND period_end = v_period_end
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'premium_credits_unavailable');
  END IF;
  IF v_quota.hard_limit IS NOT NULL AND v_quota.used + p_credits > v_quota.hard_limit THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'premium_credits_exhausted',
      'organization_id', v_org_id, 'used', v_quota.used,
      'remaining', greatest(0, v_quota.hard_limit - v_quota.used)
    );
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT * INTO v_cap FROM public.ai_user_credit_limits
      WHERE workspace_id = p_workspace_id AND user_id = p_user_id FOR UPDATE;
    IF FOUND AND (v_cap.monthly_credit_limit IS NOT NULL OR v_cap.daily_credit_limit IS NOT NULL) THEN
      SELECT coalesce(sum(quantity), 0) INTO v_month_actual
        FROM public.usage_events
        WHERE organization_id = v_org_id AND meter_code = 'ai_premium_credits'
          AND occurred_at >= v_sub.current_period_start AND occurred_at < v_period_end
          AND metadata->>'workspace_id' = p_workspace_id::text
          AND metadata->>'user_id' = p_user_id::text;
      SELECT coalesce(sum(reserved_credits), 0) INTO v_month_reserved
        FROM public.ai_credit_reservations
        WHERE workspace_id = p_workspace_id AND user_id = p_user_id
          AND status = 'reserved' AND expires_at > now()
          AND period_start = v_sub.current_period_start;
      IF v_cap.monthly_credit_limit IS NOT NULL
         AND v_month_actual + v_month_reserved + p_credits > v_cap.monthly_credit_limit THEN
        RETURN jsonb_build_object(
          'ok', false, 'reason', 'user_premium_credits_exhausted',
          'user_remaining', greatest(0, v_cap.monthly_credit_limit - v_month_actual - v_month_reserved)
        );
      END IF;

      IF v_cap.daily_credit_limit IS NOT NULL THEN
        SELECT coalesce(sum(quantity), 0) INTO v_day_actual
          FROM public.usage_events
          WHERE organization_id = v_org_id AND meter_code = 'ai_premium_credits'
            AND occurred_at >= date_trunc('day', now()) AND occurred_at < date_trunc('day', now()) + interval '1 day'
            AND metadata->>'workspace_id' = p_workspace_id::text
            AND metadata->>'user_id' = p_user_id::text;
        SELECT coalesce(sum(reserved_credits), 0) INTO v_day_reserved
          FROM public.ai_credit_reservations
          WHERE workspace_id = p_workspace_id AND user_id = p_user_id
            AND status = 'reserved' AND expires_at > now()
            AND created_at >= date_trunc('day', now());
        IF v_day_actual + v_day_reserved + p_credits > v_cap.daily_credit_limit THEN
          RETURN jsonb_build_object(
            'ok', false, 'reason', 'user_daily_premium_credits_exhausted',
            'user_remaining', greatest(0, v_cap.daily_credit_limit - v_day_actual - v_day_reserved)
          );
        END IF;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.ai_credit_reservations (
    request_id, organization_id, subscription_id, workspace_id, user_id,
    feature, provider_id, model, reserved_credits, period_start, period_end, expires_at
  ) VALUES (
    p_request_id, v_org_id, v_sub.id, p_workspace_id, p_user_id,
    p_feature, p_provider_id, p_model, p_credits, v_sub.current_period_start,
    v_period_end, now() + make_interval(secs => greatest(60, least(p_lease_seconds, 3600)))
  ) RETURNING * INTO v_existing;

  UPDATE public.tenant_quotas
    SET used = used + p_credits, updated_at = now()
    WHERE id = v_quota.id;

  RETURN jsonb_build_object(
    'ok', true, 'reservation_id', v_existing.id, 'status', 'reserved',
    'organization_id', v_org_id, 'subscription_id', v_sub.id,
    'reserved_credits', p_credits,
    'idempotent', false,
    'remaining', CASE WHEN v_quota.hard_limit IS NULL THEN NULL
      ELSE greatest(0, v_quota.hard_limit - v_quota.used - p_credits) END,
    'period_start', v_sub.current_period_start, 'period_end', v_period_end
  );
END;
$$;

-- Settle actual usage exactly once. An overrun is recorded even when it moves
-- used above the hard limit; future reservations are then blocked.
CREATE OR REPLACE FUNCTION public.settle_ai_premium_credits(
  p_request_id text,
  p_actual_credits bigint,
  p_usage_estimated boolean,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_res public.ai_credit_reservations%ROWTYPE;
  v_delta bigint;
BEGIN
  IF p_actual_credits IS NULL OR p_actual_credits < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_settlement');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id, 0));
  SELECT * INTO v_res FROM public.ai_credit_reservations
    WHERE request_id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'reservation_not_found');
  END IF;
  IF v_res.status = 'settled' THEN
    RETURN jsonb_build_object('ok', true, 'status', 'settled',
      'settled_credits', v_res.settled_credits, 'idempotent', true);
  END IF;

  v_delta := CASE WHEN v_res.status = 'reserved'
    THEN p_actual_credits - v_res.reserved_credits ELSE p_actual_credits END;
  UPDATE public.tenant_quotas
    SET used = greatest(0, used + v_delta), updated_at = now()
    WHERE organization_id = v_res.organization_id
      AND meter_code = 'ai_premium_credits'
      AND period_start = v_res.period_start;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'premium_credits_unavailable');
  END IF;

  INSERT INTO public.usage_events (
    organization_id, meter_code, quantity, occurred_at, idempotency_key,
    subscription_id, metadata
  ) VALUES (
    v_res.organization_id, 'ai_premium_credits', p_actual_credits, now(),
    'ai-credit:' || p_request_id || ':actual', v_res.subscription_id,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'workspace_id', v_res.workspace_id,
      'user_id', v_res.user_id,
      'feature', v_res.feature,
      'provider_id', v_res.provider_id,
      'model', v_res.model,
      'execution_mode', 'premium_credits',
      'credits', p_actual_credits,
      'ai_request_id', p_request_id,
      'usageEstimated', coalesce(p_usage_estimated, false)
    )
  ) ON CONFLICT (organization_id, meter_code, idempotency_key) DO NOTHING;

  UPDATE public.ai_credit_reservations
    SET status = 'settled', settled_credits = p_actual_credits,
        usage_estimated = coalesce(p_usage_estimated, false), updated_at = now()
    WHERE id = v_res.id;
  RETURN jsonb_build_object('ok', true, 'status', 'settled',
    'settled_credits', p_actual_credits, 'released_credits', greatest(0, -v_delta),
    'additional_credits', greatest(0, v_delta), 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_ai_premium_credits(p_request_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_res public.ai_credit_reservations%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id, 0));
  SELECT * INTO v_res FROM public.ai_credit_reservations
    WHERE request_id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'status', 'not_found', 'idempotent', true);
  END IF;
  IF v_res.status <> 'reserved' THEN
    RETURN jsonb_build_object('ok', true, 'status', v_res.status, 'idempotent', true);
  END IF;
  UPDATE public.tenant_quotas
    SET used = greatest(0, used - v_res.reserved_credits), updated_at = now()
    WHERE organization_id = v_res.organization_id
      AND meter_code = 'ai_premium_credits'
      AND period_start = v_res.period_start;
  UPDATE public.ai_credit_reservations
    SET status = 'released', updated_at = now() WHERE id = v_res.id;
  RETURN jsonb_build_object('ok', true, 'status', 'released',
    'released_credits', v_res.reserved_credits, 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.release_expired_ai_credit_reservations(uuid,timestamptz) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_ai_premium_credits(text,uuid,uuid,text,uuid,text,bigint,integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_ai_premium_credits(text,bigint,boolean,jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_ai_premium_credits(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_ai_credit_reservations(uuid,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_ai_premium_credits(text,uuid,uuid,text,uuid,text,bigint,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_ai_premium_credits(text,bigint,boolean,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ai_premium_credits(text) TO service_role;

-- Tax rates
CREATE TABLE public.tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  country text,
  region text,
  rate_percent numeric NOT NULL,
  inclusive boolean NOT NULL DEFAULT false,
  provider_tax_rate_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tax_rates TO authenticated;
GRANT ALL ON public.tax_rates TO service_role;
ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read active tax rates" ON public.tax_rates
  FOR SELECT TO authenticated USING (is_active = true);

CREATE TRIGGER trg_tax_rates_updated_at
  BEFORE UPDATE ON public.tax_rates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Coupons
CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  discount_type text NOT NULL DEFAULT 'percent',
  amount_off_cents integer,
  percent_off numeric,
  currency text NOT NULL DEFAULT 'USD',
  duration text NOT NULL DEFAULT 'once',
  duration_in_months integer,
  max_redemptions integer,
  times_redeemed integer NOT NULL DEFAULT 0,
  redeem_by timestamptz,
  applies_to_plan_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  provider_coupon_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read active coupons" ON public.coupons
  FOR SELECT TO authenticated USING (is_active = true);

CREATE TRIGGER trg_coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Billing events audit log
CREATE TABLE public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  event_type text NOT NULL,
  provider_event_id text,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);
CREATE INDEX idx_billing_events_org ON public.billing_events(organization_id, created_at DESC);

GRANT SELECT ON public.billing_events TO authenticated;
GRANT ALL ON public.billing_events TO service_role;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Billing admins view events" ON public.billing_events
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND public.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'billing'::org_role])
  );

-- Seed core usage meters
INSERT INTO public.usage_meters (code, name, unit, aggregation, description) VALUES
  ('messages_sent',    'Tin nhắn đã gửi',       'count',  'sum', 'Tổng số tin nhắn gửi ra'),
  ('ai_tokens',        'Token AI',              'tokens', 'sum', 'Tổng lượng token AI đã sử dụng'),
  ('ai_premium_credits','Premium AI Credits',   'credits','sum', 'Credits for PM.ai.vn-provided premium AI models.'),
  ('seats',            'Người dùng',            'count',  'max', 'Số lượng người dùng đang hoạt động'),
  ('storage_bytes',    'Dung lượng lưu trữ',    'bytes',  'max', 'Dung lượng tệp và tài liệu đã sử dụng'),
  ('automation_runs',  'Lượt chạy tự động hóa', 'count',  'sum', 'Tổng số lần thực thi quy trình tự động hóa'),
  ('campaigns_sent',   'Chiến dịch đã gửi',     'count',  'sum', 'Tổng số chiến dịch marketing đã gửi')
ON CONFLICT (code) DO NOTHING;
