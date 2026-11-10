-- vm_tunnel_registry.updated_at was only set on the first insert: the VM
-- scripts re-register with an upsert (merge-duplicates), which never touched
-- it. The app's "Restart VM" button waits for updated_at to move past the
-- restart request, so it always timed out even when the tunnel came back.
-- Keep updated_at current on every insert/update.

CREATE OR REPLACE FUNCTION public.vm_tunnel_registry_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at := now();
  RETURN new;
END;
$$;

CREATE OR REPLACE TRIGGER vm_tunnel_registry_touch
  BEFORE INSERT OR UPDATE ON public.vm_tunnel_registry
  FOR EACH ROW EXECUTE FUNCTION public.vm_tunnel_registry_touch();
