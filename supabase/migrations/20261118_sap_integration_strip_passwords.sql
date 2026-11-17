-- Step 2 of moving SAP passwords server-side (after the ADT bridge and the app fill them in):
-- any password written into system_settings.sap_integration (by any app version, including
-- a tab opened earlier) is moved into sap_env_secrets and removed from the settings, which
-- keep only has_password. The final UPDATE runs it once over the passwords saved so far.

CREATE OR REPLACE FUNCTION public.strip_sap_integration_passwords()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  k   text;
  v   jsonb;
  e   jsonb;
  out jsonb;
  envs jsonb;
BEGIN
  IF NEW.key <> 'sap_integration' OR jsonb_typeof(NEW.value) <> 'object' THEN RETURN NEW; END IF;
  out := NEW.value;
  FOR k, v IN SELECT * FROM jsonb_each(NEW.value) LOOP
    IF jsonb_typeof(v -> 'environments') IS DISTINCT FROM 'array' THEN CONTINUE; END IF;
    envs := '[]'::jsonb;
    FOR e IN SELECT * FROM jsonb_array_elements(v -> 'environments') LOOP
      IF coalesce(e ->> 'password', '') <> '' AND coalesce(e ->> 'id', '') <> '' THEN
        INSERT INTO sap_env_secrets (scope_key, env_id, password, updated_at, updated_by)
        VALUES (k, e ->> 'id', e ->> 'password', now(), auth.uid())
        ON CONFLICT (scope_key, env_id) DO UPDATE SET password = EXCLUDED.password, updated_at = now(), updated_by = EXCLUDED.updated_by;
        e := (e - 'password') || jsonb_build_object('has_password', true);
      ELSIF e ? 'password' THEN
        e := e - 'password';
      END IF;
      envs := envs || jsonb_build_array(e);
    END LOOP;
    out := jsonb_set(out, ARRAY[k, 'environments'], envs);
  END LOOP;
  NEW.value := out;
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'strip_sap_integration_passwords' AND tgrelid = 'public.system_settings'::regclass) THEN
    CREATE TRIGGER strip_sap_integration_passwords BEFORE INSERT OR UPDATE ON public.system_settings
      FOR EACH ROW EXECUTE FUNCTION public.strip_sap_integration_passwords();
  END IF;
END $$;

-- Move the passwords saved so far.
UPDATE public.system_settings SET value = value WHERE key = 'sap_integration';
