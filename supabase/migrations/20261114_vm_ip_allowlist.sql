-- The VM scripts (start-sap-mcp-tunnel.sh, start-vm.sh / ADT bridge) talk to Supabase with
-- the public anon key, not the service-role key. After 20261111_vm_tables_lockdown.sql that
-- meant the 3100 tunnel could no longer register its URL (HTTP 401, RLS), while the ADT
-- bridge URL in system_settings was still writable by anyone with the public key.
--
-- Allow those VM writes/reads only when the request comes from the Arena VM's Elastic IP.
-- Supabase's edge sets cf-connecting-ip from the real client address; a client-supplied
-- CF-Connecting-IP is rejected by Cloudflare (error 1000), so it cannot be forged.
-- To move the VM to another fixed IP, CREATE OR REPLACE this function with the new address.

CREATE OR REPLACE FUNCTION public.is_arena_vm_request()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(current_setting('request.headers', true)::json ->> 'cf-connecting-ip', '')
         = ANY (ARRAY['18.216.57.161'])
$$;

GRANT EXECUTE ON FUNCTION public.is_arena_vm_request() TO anon, authenticated;

-- 3100 tunnel registry: the VM may upsert its row (upsert needs insert, update and select).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vm_tunnel_registry'
                 AND policyname = 'vm_tunnel_registry_vm_write') THEN
    CREATE POLICY vm_tunnel_registry_vm_write ON public.vm_tunnel_registry
      FOR ALL TO anon
      USING (public.is_arena_vm_request())
      WITH CHECK (public.is_arena_vm_request());
  END IF;
END $$;

-- ADT bridge URL: was writable by anyone with the anon key; now only from the VM.
ALTER POLICY "adt bridge can register tunnel url" ON public.system_settings
  WITH CHECK (key = 'adt_bridge_tunnel_url' AND public.is_arena_vm_request());
ALTER POLICY "adt bridge can update tunnel url" ON public.system_settings
  USING (key = 'adt_bridge_tunnel_url' AND public.is_arena_vm_request())
  WITH CHECK (key = 'adt_bridge_tunnel_url' AND public.is_arena_vm_request());

-- The VM polls the platform's Restart buttons with the anon key.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'system_settings'
                 AND policyname = 'arena vm can read restart flags') THEN
    CREATE POLICY "arena vm can read restart flags" ON public.system_settings
      FOR SELECT TO anon
      USING (key IN ('vm_restart_requested', 'adt_bridge_restart_requested') AND public.is_arena_vm_request());
  END IF;
END $$;
