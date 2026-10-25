-- SAP write queue: platform enqueues jobs, ADT bridge polls and applies them.
-- This bypasses the Cloudflare tunnel for writes (bridge makes outbound calls only).
CREATE TABLE IF NOT EXISTS sap_write_queue (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  status      text        NOT NULL DEFAULT 'pending', -- pending | processing | done | error
  host        text,
  username    text,
  password    text,
  client      text,
  path        text,
  source      text,
  transport   text,
  ok          boolean,
  sap_status  int,
  error       text,
  body        text
);

ALTER TABLE sap_write_queue ENABLE ROW LEVEL SECURITY;
-- Allow anon key to insert jobs and read results; bridge uses service key to claim/update.
CREATE POLICY "anon_insert"  ON sap_write_queue FOR INSERT TO anon  WITH CHECK (true);
CREATE POLICY "anon_select"  ON sap_write_queue FOR SELECT TO anon  USING (true);
CREATE POLICY "service_all"  ON sap_write_queue FOR ALL   TO service_role USING (true) WITH CHECK (true);
