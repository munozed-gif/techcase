-- Lock down the tables the VM servers use. All were open to anyone, even logged out:
--   vm_tunnel_registry: anyone could rewrite the tunnel URL and send users' SAP
--     credentials (carried by the app's SAP proxy calls) to their own server.
--   sap_write_queue: anyone could queue SAP writes that the ADT bridge executes with
--     the VM's own SAP user.
--   vm_command_queue: anyone could queue VPN/server restarts and read diagnostics.
--
-- The VM scripts write the registry and the bridge reads the write queue with the
-- service-role key, which bypasses RLS. The SAP MCP server's command poller uses the
-- public key, so it can still read and complete *pending* commands.
-- Policies are altered in place (not dropped).

ALTER POLICY "Anon write" ON public.vm_tunnel_registry RENAME TO vm_tunnel_registry_no_client_write;
ALTER POLICY vm_tunnel_registry_no_client_write ON public.vm_tunnel_registry USING (false) WITH CHECK (false);
ALTER POLICY "Public read" ON public.vm_tunnel_registry RENAME TO vm_tunnel_registry_read_auth;
ALTER POLICY vm_tunnel_registry_read_auth ON public.vm_tunnel_registry TO authenticated USING (true);

ALTER POLICY allow_all ON public.sap_write_queue RENAME TO sap_write_queue_bridge_only;
ALTER POLICY sap_write_queue_bridge_only ON public.sap_write_queue USING (false) WITH CHECK (false);

ALTER POLICY allow_all_inserts ON public.vm_command_queue TO authenticated
  WITH CHECK (command IN ('restart_mcp', 'restart_vpn', 'get_diagnostics'));
ALTER POLICY allow_all_selects ON public.vm_command_queue USING (auth.uid() IS NOT NULL OR status = 'pending');
ALTER POLICY allow_all_updates ON public.vm_command_queue USING (auth.uid() IS NOT NULL OR status = 'pending');
