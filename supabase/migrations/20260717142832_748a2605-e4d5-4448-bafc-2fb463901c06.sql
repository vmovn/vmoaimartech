
-- 1) Extend deal_pipelines
ALTER TABLE public.deal_pipelines
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS default_currency text NOT NULL DEFAULT 'VND',
  ADD COLUMN IF NOT EXISTS stale_after_days integer NOT NULL DEFAULT 14;

-- 2) Extend deal_stages
ALTER TABLE public.deal_stages
  ADD COLUMN IF NOT EXISTS stage_type text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS aging_days integer,
  ADD COLUMN IF NOT EXISTS rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS automations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deal_stages_stage_type_chk') THEN
    ALTER TABLE public.deal_stages ADD CONSTRAINT deal_stages_stage_type_chk
      CHECK (stage_type IN ('normal','qualifying','won','lost'));
  END IF;
END $$;

-- 3) Stage transition history
CREATE TABLE IF NOT EXISTS public.deal_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  pipeline_id uuid REFERENCES public.deal_pipelines(id) ON DELETE SET NULL,
  from_stage_id uuid REFERENCES public.deal_stages(id) ON DELETE SET NULL,
  to_stage_id uuid REFERENCES public.deal_stages(id) ON DELETE SET NULL,
  from_status text,
  to_status text,
  amount numeric(18,4),
  currency text,
  moved_by uuid,
  duration_seconds bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deal_stage_history_ws_created_idx
  ON public.deal_stage_history(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deal_stage_history_deal_idx
  ON public.deal_stage_history(deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deal_stage_history_stage_idx
  ON public.deal_stage_history(to_stage_id);

GRANT SELECT ON public.deal_stage_history TO authenticated;
GRANT ALL ON public.deal_stage_history TO service_role;
ALTER TABLE public.deal_stage_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deal_stage_history_select" ON public.deal_stage_history;
CREATE POLICY "deal_stage_history_select" ON public.deal_stage_history
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- Trigger: capture stage transitions and duration in previous stage
CREATE OR REPLACE FUNCTION public.tg_deals_stage_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prev_moved_at timestamptz;
  _dur bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.stage_id IS NOT NULL THEN
      INSERT INTO public.deal_stage_history
        (workspace_id, deal_id, pipeline_id, from_stage_id, to_stage_id,
         from_status, to_status, amount, currency, moved_by, duration_seconds)
      VALUES
        (NEW.workspace_id, NEW.id, NEW.pipeline_id, NULL, NEW.stage_id,
         NULL, NEW.status::text, NEW.amount, NEW.currency, auth.uid(), NULL);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.stage_id IS DISTINCT FROM NEW.stage_id)
       OR (OLD.status IS DISTINCT FROM NEW.status) THEN
      SELECT MAX(created_at) INTO _prev_moved_at
        FROM public.deal_stage_history WHERE deal_id = NEW.id;
      _dur := CASE WHEN _prev_moved_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (now() - _prev_moved_at))::bigint END;
      INSERT INTO public.deal_stage_history
        (workspace_id, deal_id, pipeline_id, from_stage_id, to_stage_id,
         from_status, to_status, amount, currency, moved_by, duration_seconds)
      VALUES
        (NEW.workspace_id, NEW.id, NEW.pipeline_id, OLD.stage_id, NEW.stage_id,
         OLD.status::text, NEW.status::text, NEW.amount, NEW.currency,
         auth.uid(), _dur);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS deals_stage_history_trg ON public.deals;
CREATE TRIGGER deals_stage_history_trg
AFTER INSERT OR UPDATE OF stage_id, status ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.tg_deals_stage_history();

-- 4) Pipeline templates
CREATE TABLE IF NOT EXISTS public.pipeline_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  icon text,
  color text,
  category text,
  is_builtin boolean NOT NULL DEFAULT false,
  stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pipeline_templates_ws_idx
  ON public.pipeline_templates(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pipeline_templates_builtin_idx
  ON public.pipeline_templates(is_builtin) WHERE is_builtin;

GRANT SELECT ON public.pipeline_templates TO authenticated;
GRANT ALL ON public.pipeline_templates TO service_role;
ALTER TABLE public.pipeline_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pipeline_templates_select" ON public.pipeline_templates;
CREATE POLICY "pipeline_templates_select" ON public.pipeline_templates
  FOR SELECT TO authenticated
  USING (is_builtin OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid())));

DROP POLICY IF EXISTS "pipeline_templates_write" ON public.pipeline_templates;
CREATE POLICY "pipeline_templates_write" ON public.pipeline_templates
  FOR ALL TO authenticated
  USING (workspace_id IS NOT NULL
     AND public.has_workspace_role(workspace_id, auth.uid(),
       ARRAY['owner'::workspace_role,'admin'::workspace_role,'manager'::workspace_role]))
  WITH CHECK (workspace_id IS NOT NULL
     AND public.has_workspace_role(workspace_id, auth.uid(),
       ARRAY['owner'::workspace_role,'admin'::workspace_role,'manager'::workspace_role]));

DROP TRIGGER IF EXISTS pipeline_templates_updated_at ON public.pipeline_templates;
CREATE TRIGGER pipeline_templates_updated_at
BEFORE UPDATE ON public.pipeline_templates
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed built-in templates (idempotent by name where is_builtin)
INSERT INTO public.pipeline_templates (workspace_id, name, description, icon, color, category, is_builtin, stages)
SELECT NULL, v.name, v.description, v.icon, v.color, v.category, true, v.stages
FROM (VALUES
  ('Bán hàng tiêu chuẩn', 'Quy trình bán hàng B2B tiêu chuẩn từ khách hàng tiềm năng đến khi chốt giao dịch.', 'briefcase', '#6366f1', 'sales', '[
    {"name":"Khách hàng tiềm năng","probability":10,"color":"#94a3b8","stage_type":"qualifying","aging_days":7},
    {"name":"Đủ điều kiện","probability":25,"color":"#3b82f6","stage_type":"qualifying","aging_days":10},
    {"name":"Đề xuất / Báo giá","probability":50,"color":"#8b5cf6","stage_type":"normal","aging_days":14},
    {"name":"Đàm phán","probability":75,"color":"#f59e0b","stage_type":"normal","aging_days":14},
    {"name":"Thành công","probability":100,"color":"#10b981","stage_type":"won"},
    {"name":"Thất bại","probability":0,"color":"#ef4444","stage_type":"lost"}
  ]'::jsonb),
  ('Đăng ký dịch vụ SaaS', 'Quy trình bán dịch vụ SaaS từ đăng ký, dùng thử, demo đến chuyển đổi trả phí.', 'cloud', '#0ea5e9', 'saas', '[
    {"name":"Đăng ký","probability":15,"color":"#94a3b8","stage_type":"qualifying","aging_days":3},
    {"name":"Dùng thử","probability":30,"color":"#3b82f6","stage_type":"normal","aging_days":14},
    {"name":"Đã đặt lịch demo","probability":50,"color":"#8b5cf6","stage_type":"normal","aging_days":7},
    {"name":"Đã gửi hợp đồng","probability":80,"color":"#f59e0b","stage_type":"normal","aging_days":7},
    {"name":"Đã đăng ký trả phí","probability":100,"color":"#10b981","stage_type":"won"},
    {"name":"Ngừng sử dụng","probability":0,"color":"#ef4444","stage_type":"lost"}
  ]'::jsonb),
  ('Đơn hàng thương mại điện tử', 'Quy trình xử lý đơn hàng từ giỏ hàng đến giao hàng hoàn tất.', 'shopping-cart', '#f43f5e', 'ecommerce', '[
    {"name":"Giỏ hàng","probability":10,"color":"#94a3b8","stage_type":"qualifying","aging_days":1},
    {"name":"Xác nhận đơn hàng","probability":40,"color":"#f59e0b","stage_type":"normal","aging_days":1},
    {"name":"Đã thanh toán","probability":80,"color":"#3b82f6","stage_type":"normal"},
    {"name":"Đang giao hàng","probability":95,"color":"#8b5cf6","stage_type":"normal","aging_days":5},
    {"name":"Đã giao hàng","probability":100,"color":"#10b981","stage_type":"won"},
    {"name":"Đã hủy","probability":0,"color":"#ef4444","stage_type":"lost"}
  ]'::jsonb),
  ('Bất động sản', 'Quy trình bán hàng môi giới bất động sản từ khách quan tâm đến hoàn tất giao dịch.', 'home', '#a16207', 'real_estate', '[
    {"name":"Khách quan tâm","probability":10,"color":"#94a3b8","stage_type":"qualifying","aging_days":3},
    {"name":"Xem bất động sản","probability":25,"color":"#3b82f6","stage_type":"normal","aging_days":10},
    {"name":"Đề nghị","probability":50,"color":"#8b5cf6","stage_type":"normal","aging_days":14},
    {"name":"Đang làm hợp đồng","probability":80,"color":"#f59e0b","stage_type":"normal","aging_days":30},
    {"name":"Thành công","probability":100,"color":"#10b981","stage_type":"won"},
    {"name":"Thất bại","probability":0,"color":"#ef4444","stage_type":"lost"}
  ]'::jsonb),
  ('Quy trình đơn giản', 'Quy trình tối giản để theo dõi công việc hoặc cơ hội từ bắt đầu đến hoàn tất.', 'zap', '#10b981', 'simple', '[
    {"name":"Cần xử lý","probability":10,"color":"#94a3b8","stage_type":"qualifying"},
    {"name":"Đang xử lý","probability":50,"color":"#3b82f6","stage_type":"normal","aging_days":7},
    {"name":"Hoàn thành","probability":100,"color":"#10b981","stage_type":"won"},
    {"name":"Đã hủy","probability":0,"color":"#ef4444","stage_type":"lost"}
  ]'::jsonb)
) AS v(name, description, icon, color, category, stages)
WHERE NOT EXISTS (
  SELECT 1 FROM public.pipeline_templates t
   WHERE t.is_builtin AND t.name = v.name
);

-- 5) Realtime publication
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_pipelines; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_stages;    EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.deals;          EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_stage_history; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ALTER TABLE public.deal_pipelines REPLICA IDENTITY FULL;
ALTER TABLE public.deal_stages REPLICA IDENTITY FULL;
ALTER TABLE public.deals REPLICA IDENTITY FULL;
