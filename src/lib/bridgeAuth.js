import { supabase } from "./supabase.js";

// The VM ADT bridge (port 3101) only accepts logged-in platform users on its action
// endpoints (SAP writes, SAP proxy, VPN control, SAP checks): it verifies the user's
// Supabase access token sent in X-App-Token. Other servers (e.g. the SAP MCP server on
// port 3100) don't accept that header in CORS, so it is only attached when the target is
// the ADT bridge's registered tunnel URL (system_settings.adt_bridge_tunnel_url).

let _bridgeOrigin = null;
let _bridgeOriginAt = 0;

async function adtBridgeOrigin() {
  if (Date.now() - _bridgeOriginAt < 60_000) return _bridgeOrigin;
  _bridgeOriginAt = Date.now();
  try {
    const { data } = await supabase
      .from("system_settings").select("value").eq("key", "adt_bridge_tunnel_url").maybeSingle();
    const v = typeof data?.value === "string" ? data.value.trim() : "";
    _bridgeOrigin = v ? new URL(v).origin : null;
  } catch {
    _bridgeOrigin = null;
  }
  return _bridgeOrigin;
}

// targetUrl: the URL being called. Pass null for same-origin API routes that forward
// the header to the bridge themselves (e.g. /api/adt-write).
export async function bridgeAuthHeaders(targetUrl = null) {
  try {
    if (targetUrl) {
      const bridge = await adtBridgeOrigin();
      let target = null;
      try { target = new URL(targetUrl, window.location.origin).origin; } catch { /* ignore */ }
      if (!bridge || target !== bridge) return {};
    }
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { "X-App-Token": token } : {};
  } catch {
    return {};
  }
}
