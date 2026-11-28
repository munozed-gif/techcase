-- New role-matrix capabilities: see the SAP Implementation tab / the Transports tab (same roles as the
-- previous fixed list). Keeps role_permission_defaults() in sync with src/lib/constants.js.
DO $$
DECLARE j jsonb := public.role_permission_defaults() || '{"view_sap_implementation":{"admin":true,"manager":true,"consultant":true,"key_user":true,"internal_consultant":true,"project_manager":true},"view_transports":{"admin":true,"manager":true,"consultant":true,"key_user":true,"internal_consultant":true,"project_manager":true}}'::jsonb;
BEGIN
  EXECUTE format('CREATE OR REPLACE FUNCTION public.role_permission_defaults() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $f$ SELECT %L::jsonb $f$', j::text);
END $$;
