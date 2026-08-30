-- Make account/tenant deletion auditable and executable.
-- Additive Product migration: baseline migrations remain immutable.

CREATE OR REPLACE FUNCTION public.tg_organizations_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _changes jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    _changes := jsonb_build_object(
      'before', to_jsonb(OLD) - 'updated_at',
      'after',  to_jsonb(NEW) - 'updated_at'
    );
    IF to_jsonb(OLD) - 'updated_at' = to_jsonb(NEW) - 'updated_at' THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.audit_logs (
      organization_id, actor_id, action, resource_type, resource_id, changes
    ) VALUES (
      NEW.id, auth.uid(), 'update', 'organization', NEW.id::text, _changes
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- AFTER DELETE cannot re-reference OLD.id through the FK. Preserve the
    -- immutable resource id and snapshot while leaving the deleted FK null.
    INSERT INTO public.audit_logs (
      organization_id, actor_id, action, resource_type, resource_id, changes
    ) VALUES (
      NULL, auth.uid(), 'delete', 'organization', OLD.id::text,
      jsonb_build_object('deleted', to_jsonb(OLD))
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_workspaces_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _changes jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF to_jsonb(OLD) - 'updated_at' = to_jsonb(NEW) - 'updated_at' THEN
      RETURN NEW;
    END IF;
    _changes := jsonb_build_object(
      'before', to_jsonb(OLD) - 'updated_at',
      'after',  to_jsonb(NEW) - 'updated_at'
    );
    INSERT INTO public.audit_logs (
      organization_id, workspace_id, actor_id, action, resource_type, resource_id, changes
    ) VALUES (
      NEW.organization_id, NEW.id, auth.uid(), 'update', 'workspace', NEW.id::text, _changes
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (
      organization_id, workspace_id, actor_id, action, resource_type, resource_id, changes
    ) VALUES (
      NULL, NULL, auth.uid(), 'delete', 'workspace', OLD.id::text,
      jsonb_build_object('organization_id', OLD.organization_id, 'deleted', to_jsonb(OLD))
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_platform_user_deletion(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_successor uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  FOR r IN SELECT id FROM public.organizations WHERE owner_id = _user_id LOOP
    SELECT om.user_id INTO v_successor
    FROM public.organization_members om
    WHERE om.organization_id = r.id AND om.user_id <> _user_id
    ORDER BY CASE om.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, om.joined_at
    LIMIT 1;

    IF v_successor IS NULL THEN
      DELETE FROM public.organizations WHERE id = r.id;
    ELSE
      UPDATE public.organizations SET owner_id = v_successor WHERE id = r.id;
      UPDATE public.organization_members
      SET role = 'owner'
      WHERE organization_id = r.id AND user_id = v_successor;
    END IF;
  END LOOP;

  FOR r IN SELECT id FROM public.workspaces WHERE owner_id = _user_id LOOP
    SELECT wm.user_id INTO v_successor
    FROM public.workspace_members wm
    WHERE wm.workspace_id = r.id AND wm.user_id <> _user_id AND wm.status = 'active'
    ORDER BY CASE wm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END, wm.created_at
    LIMIT 1;

    IF v_successor IS NULL THEN
      DELETE FROM public.workspaces WHERE id = r.id;
    ELSE
      UPDATE public.workspaces SET owner_id = v_successor WHERE id = r.id;
      UPDATE public.workspace_members
      SET role = 'owner'
      WHERE workspace_id = r.id AND user_id = v_successor;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_organizations_audit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_workspaces_audit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_platform_user_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_platform_user_deletion(uuid) TO service_role;
