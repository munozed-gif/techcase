-- sap_blueprint and transport_approvals are system_settings rows that any logged-in user may
-- write (can_write_system_setting), and each holds every case's data. Without a guard, anyone
-- could rewrite other cases' blueprints or mark their own objects / transports as approved,
-- which would defeat the "objects approved before writing" and "release requires approval"
-- validations. This trigger (for users other than admins/managers) only allows:
--   - changes to the entries of cases (or projects) the user is involved in;
--   - an object becoming 'approved' when the user is a functional approver (key user,
--     project manager, internal consultant) approving as themselves, or when the reviewer
--     recorded that decision through the review link (approval_request_objects);
--   - a transport approval becoming 'approved' never (that's set by admins/managers or by
--     the reviewer's approval flow, server side).

CREATE OR REPLACE FUNCTION public.guard_case_scoped_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role  text;
  v_old   jsonb;
  v_new   jsonb;
  k       text;
  v_case  uuid;
  o       jsonb;
  old_o   jsonb;
  UUID_RE constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  -- SECURITY DEFINER: current_user is the owner here, so look at the caller's JWT role
  -- (service role / migrations have none of these and are not checked).
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.key NOT IN ('sap_blueprint', 'transport_approvals') THEN RETURN NEW; END IF;
  v_role := coalesce(get_my_role(), '');
  IF v_role IN ('admin', 'manager') THEN RETURN NEW; END IF;

  v_old := CASE WHEN TG_OP = 'UPDATE' AND jsonb_typeof(OLD.value) = 'object' THEN OLD.value ELSE '{}'::jsonb END;
  v_new := CASE WHEN jsonb_typeof(NEW.value) = 'object' THEN NEW.value ELSE '{}'::jsonb END;

  FOR k IN SELECT jsonb_object_keys(v_old) UNION SELECT jsonb_object_keys(v_new) LOOP
    IF (v_old -> k) IS NOT DISTINCT FROM (v_new -> k) THEN CONTINUE; END IF;

    IF NEW.key = 'sap_blueprint' THEN
      IF k !~ UUID_RE OR NOT public.user_can_access_case(k::uuid) THEN
        RAISE EXCEPTION 'You can only change the blueprint of cases you are involved in' USING ERRCODE = '42501';
      END IF;
      v_case := k::uuid;
      FOR o IN SELECT x FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_new -> k -> 'objects') = 'array' THEN v_new -> k -> 'objects' ELSE '[]'::jsonb END) x LOOP
        IF o ->> 'approval_status' IS DISTINCT FROM 'approved' THEN CONTINUE; END IF;
        old_o := NULL;
        SELECT x INTO old_o FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_old -> k -> 'objects') = 'array' THEN v_old -> k -> 'objects' ELSE '[]'::jsonb END) x
          WHERE x ->> 'id' = o ->> 'id' LIMIT 1;
        IF old_o ->> 'approval_status' = 'approved' THEN CONTINUE; END IF;   -- already approved
        IF v_role IN ('key_user', 'project_manager', 'internal_consultant') AND o ->> 'approved_by' = auth.uid()::text THEN CONTINUE; END IF;
        IF EXISTS (SELECT 1 FROM approval_request_objects aro JOIN approval_requests ar ON ar.id = aro.approval_request_id
                   WHERE ar.case_id = v_case AND aro.object_id = o ->> 'id' AND aro.decision = 'approved') THEN CONTINUE; END IF;
        RAISE EXCEPTION 'Object % can only be approved by a reviewer (key user / project manager / review link)', coalesce(o ->> 'name', o ->> 'id')
          USING ERRCODE = '42501';
      END LOOP;

    ELSE -- transport_approvals: keys are case_<uuid> / project_<uuid>
      IF k ~ ('^case_' || substr(UUID_RE, 2)) THEN
        IF NOT public.user_can_access_case(substr(k, 6)::uuid) THEN
          RAISE EXCEPTION 'You can only change transport approvals of cases you are involved in' USING ERRCODE = '42501';
        END IF;
      ELSIF k ~ ('^project_' || substr(UUID_RE, 2)) THEN
        IF NOT public.user_can_access_project(substr(k, 9)::uuid) THEN
          RAISE EXCEPTION 'You can only change transport approvals of projects you are involved in' USING ERRCODE = '42501';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid transport approval entry %', k USING ERRCODE = '42501';
      END IF;
      IF (v_new -> k ->> 'status') = 'approved' AND (v_old -> k ->> 'status') IS DISTINCT FROM 'approved' THEN
        RAISE EXCEPTION 'Only the reviewer (or an admin/manager) can approve transports' USING ERRCODE = '42501';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'guard_case_scoped_settings' AND tgrelid = 'public.system_settings'::regclass) THEN
    CREATE TRIGGER guard_case_scoped_settings BEFORE INSERT OR UPDATE ON public.system_settings
      FOR EACH ROW EXECUTE FUNCTION public.guard_case_scoped_settings();
  END IF;
END $$;

-- Update one entry of an object-per-case setting, merged in the database (the app used to
-- write the whole value from its cached copy, which could overwrite other cases' changes).
-- SECURITY INVOKER: the caller's write permission (RLS) and the guard above still apply.
CREATE OR REPLACE FUNCTION public.set_setting_entry(p_key text, p_entry text, p_value jsonb)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  INSERT INTO system_settings (key, value)
  VALUES (p_key, CASE WHEN p_value IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(p_entry, p_value) END)
  ON CONFLICT (key) DO UPDATE SET value =
    CASE WHEN p_value IS NULL
         THEN (CASE WHEN jsonb_typeof(system_settings.value) = 'object' THEN system_settings.value ELSE '{}'::jsonb END) - p_entry
         ELSE (CASE WHEN jsonb_typeof(system_settings.value) = 'object' THEN system_settings.value ELSE '{}'::jsonb END)
              || jsonb_build_object(p_entry, p_value)
    END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_setting_entry(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_setting_entry(text, text, jsonb) TO authenticated;
