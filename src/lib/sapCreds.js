import { supabase } from "./supabase.js";

// SAP environment passwords are stored server-side (sap_env_secrets) and are not sent to
// the browser any more: an environment only says has_password. Calls to the ADT bridge,
// /api/adt-write and /api/sap-proxy send host + SAP user without the password, and the
// server fills it in after checking that the logged-in user may use that SAP system.
// A password typed in this browser (e.g. a personal override) is still sent as is.

/** True when the environment has a password (saved server-side or typed here). */
export function sapHasPassword(cfg) {
  return !!(cfg?.password || cfg?.has_password);
}

/**
 * Authorization token for the SAP MCP endpoint (/mcp), used by the AI's SAP tools.
 * Those calls come from Anthropic's servers, without an app login, so instead of the
 * password the token carries a 30-minute ticket the bridge resolves for this user.
 */
export async function sapMcpAuthToken(cfg, extra = {}) {
  if (!cfg?.host || !cfg?.username) return null;
  const base = { host: cfg.host, username: cfg.username, client: cfg.client ?? '100', ...extra };
  if (cfg.password) return btoa(JSON.stringify({ ...base, password: cfg.password }));
  if (!cfg.has_password) return null;
  const { data, error } = await supabase.rpc('issue_sap_mcp_ticket', {
    p_host: String(cfg.host), p_username: String(cfg.username), p_client: String(cfg.client ?? '100'),
  });
  if (error || !data) return null;
  return btoa(JSON.stringify({ ...base, mcp_ticket: data }));
}

/**
 * Save the environments of one sap_integration entry: passwords typed in the form go to
 * sap_env_secrets (set_sap_env_password) and are removed from the settings, which only
 * keep has_password. Returns the environments to store in the settings.
 */
export async function storeSapEnvPasswords(scopeKey, envs) {
  const out = [];
  for (const env of envs ?? []) {
    const { password, ...rest } = env ?? {};
    if (password && env?.id) {
      const { error } = await supabase.rpc('set_sap_env_password', {
        p_scope: String(scopeKey), p_env_id: String(env.id), p_password: String(password),
      });
      if (error) throw new Error(`Could not save the SAP password of ${env.name ?? env.id}: ${error.message}`);
      out.push({ ...rest, has_password: true });
    } else {
      out.push(rest);
    }
  }
  return out;
}
