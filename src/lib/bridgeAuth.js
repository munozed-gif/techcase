import { supabase } from "./supabase.js";

// The VM's servers — the ADT bridge (port 3101) and the SAP MCP server (port 3100) —
// only accept logged-in platform users on their action endpoints (SAP writes, SAP proxy,
// VPN control, restart, diagnostics, code update). They verify the user's Supabase access
// token sent in X-App-Token. The header is only attached when the target is one of the
// VM's registered tunnel URLs, so it never goes to SAP or to other servers.

let _vmOrigins = [];
let _vmOriginsAt = 0;

async function vmOrigins() {
  if (Date.now() - _vmOriginsAt < 60_000) return _vmOrigins;
  _vmOriginsAt = Date.now();
  const origins = [];
  const add = (v) => { try { if (typeof v === "string" && v.trim()) origins.push(new URL(v.trim()).origin); } catch { /* ignore */ } };
  try {
    const { data } = await supabase
      .from("system_settings").select("value").eq("key", "adt_bridge_tunnel_url").maybeSingle();
    add(data?.value);
  } catch { /* ignore */ }
  try {
    const { data } = await supabase
      .from("vm_tunnel_registry").select("tunnel_url").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    add(data?.tunnel_url);
  } catch { /* ignore */ }
  _vmOrigins = origins;
  return _vmOrigins;
}

// The current user's token, for requests that carry it in the body (see deployServer).
export async function appAccessToken() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

// targetUrl: the URL being called. Pass null for same-origin API routes that forward
// the header to the bridge themselves (e.g. /api/adt-write).
export async function bridgeAuthHeaders(targetUrl = null) {
  try {
    if (targetUrl) {
      const known = await vmOrigins();
      let target = null;
      try { target = new URL(targetUrl, window.location.origin).origin; } catch { /* ignore */ }
      if (!target || !known.includes(target)) return {};
    }
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { "X-App-Token": token } : {};
  } catch {
    return {};
  }
}
