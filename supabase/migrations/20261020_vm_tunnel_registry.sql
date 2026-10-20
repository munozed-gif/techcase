-- vm_tunnel_registry: stores the latest Cloudflare tunnel URL for each VM
-- The VM posts here on startup; the app reads it when the current tunnel URL stops working

CREATE TABLE IF NOT EXISTS public.vm_tunnel_registry (
  id         TEXT PRIMARY KEY DEFAULT 'main',
  tunnel_url TEXT NOT NULL,
  vm_ip      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.vm_tunnel_registry ENABLE ROW LEVEL SECURITY;

-- Anyone can read (browser reads the URL to update its config)
CREATE POLICY "Public read" ON public.vm_tunnel_registry
  FOR SELECT USING (true);

-- Service role / anon can write (VM posts with anon key or service key)
CREATE POLICY "Anon write" ON public.vm_tunnel_registry
  FOR ALL USING (true) WITH CHECK (true);
