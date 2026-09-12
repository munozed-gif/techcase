import { useState, useEffect, useContext, createContext } from "react";
import { supabase } from "../lib/supabase.js";
import { ROLE_PERMISSIONS_DEFAULTS } from "../lib/constants.js";
import { DEFAULT_PLAN_CONFIG, DEFAULT_PLAN_PRICES, TECHCASE_LOGO_URI } from "../lib/businessConstants.js";

// ============================================================
// SYSTEM SETTINGS (context-based — single Supabase query app-wide)
// ============================================================
const SystemSettingsContext = createContext(null);

function usePlatformBranding() {
  const { settings } = useSystemSettings();
  return {
    platformName: settings['platform_name'] || 'TechCase',
    tagline:      settings['platform_tagline'] || 'Consultant case management platform',
    logoUrl:      settings['brand_logo_url']  || TECHCASE_LOGO_URI,
  };
}

function usePlanConfig() {
  const ssCtx = useSystemSettings();
  const config  = ssCtx.settings['plan_config']  ?? DEFAULT_PLAN_CONFIG;
  const userPlans = ssCtx.settings['user_plans'] ?? {};

  function getUserPlan(userId) {
    return userPlans[userId]?.plan ?? 'free';
  }

  const INTERNAL_LIMITS = { maxCases: -1, maxTeam: -1, maxApps: -1, maxCandidates: -1, ai: true, analytics: true, priority: true, helpDesk: true };
  const INTERNAL_ROLES  = ['admin', 'manager'];

  function getPlanLimits(userId, roleType, authRole) {
    if (authRole && INTERNAL_ROLES.includes(authRole)) return INTERNAL_LIMITS;
    const plan = getUserPlan(userId);
    const rt = roleType ?? 'client';
    return (config[rt] ?? {})[plan] ?? (DEFAULT_PLAN_CONFIG[rt] ?? {}).free ?? {};
  }

  async function setUserPlan(userId, plan, roleType) {
    const updated = { ...userPlans, [userId]: { plan, roleType, updatedAt: new Date().toISOString() } };
    await ssCtx.setSetting('user_plans', updated);
  }

  const priceIds = ssCtx.settings['stripe_price_ids'] ?? {};
  const prices   = ssCtx.settings['plan_prices']      ?? DEFAULT_PLAN_PRICES;

  async function startCheckout(userId, userEmail, roleType, planKey) {
    const priceKey = `${roleType}_${planKey}`;
    const priceId  = priceIds[priceKey];
    if (!priceId) {
      alert('Stripe is not configured yet. Please contact support.');
      return;
    }
    try {
      const res = await fetch('/api/stripe-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, userId, userEmail, planKey, roleType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Checkout failed');
      window.location.href = data.url;
    } catch (e) {
      alert('Could not start checkout: ' + e.message);
    }
  }

  return { config, userPlans, getUserPlan, getPlanLimits, setUserPlan, startCheckout, prices, priceIds };
}

function useVisibilitySettings() {
  const ssCtx = useSystemSettings();
  const companyVisibility = ssCtx.settings['company_visibility'] ?? {};
  const caseVisibility    = ssCtx.settings['case_visibility']    ?? {};
  const caseInvitations   = ssCtx.settings['case_invitations']   ?? {};

  function getCompanyVisibility(clientId) {
    if (!clientId) return 'open';
    return companyVisibility[clientId] ?? 'open';
  }

  async function setCompanyVisibility(clientId, mode) {
    if (!clientId) return;
    await ssCtx.setSetting('company_visibility', { ...companyVisibility, [clientId]: mode });
  }

  function getCaseVisibility(caseId, clientId) {
    if (caseVisibility[caseId]) return caseVisibility[caseId];
    if (clientId && getCompanyVisibility(clientId) === 'internal') return 'private';
    return 'public';
  }

  async function setCaseVisibility(caseId, mode) {
    await ssCtx.setSetting('case_visibility', { ...caseVisibility, [caseId]: mode });
  }

  function getCaseInvitations(caseId) {
    return caseInvitations[caseId] ?? [];
  }

  async function addCaseInvitation(caseId, consultantId, type, consultantName) {
    const existing = caseInvitations[caseId] ?? [];
    if (existing.some(i => i.consultantId === consultantId)) return;
    await ssCtx.setSetting('case_invitations', {
      ...caseInvitations,
      [caseId]: [...existing, { consultantId, type, consultantName, invitedAt: new Date().toISOString() }],
    });
  }

  async function removeCaseInvitation(caseId, consultantId) {
    const existing = caseInvitations[caseId] ?? [];
    await ssCtx.setSetting('case_invitations', {
      ...caseInvitations,
      [caseId]: existing.filter(i => i.consultantId !== consultantId),
    });
  }

  return {
    getCompanyVisibility, setCompanyVisibility,
    getCaseVisibility, setCaseVisibility,
    getCaseInvitations, addCaseInvitation, removeCaseInvitation,
  };
}

// Applies company/case visibility rules to a cases array.
// Admins and managers always see everything.
// Consultants and key users only see private/internal cases they are part of.
function filterCasesByVisibility(cases, auth, visCfg) {
  if (!visCfg || !cases) return cases ?? [];
  if (auth.isAdmin || auth.isManager) return cases;
  if (auth.isClient) return cases; // RLS or client_id filter already scopes this
  const userId = auth.user?.id;
  if (!userId) return cases;
  return cases.filter(c => {
    const vis = visCfg.getCaseVisibility(c.id, c.client_id);
    if (vis === 'public') return true;
    // Private or internal company — show only if the user is involved
    const isAssigned = c.case_assignments?.some(a => a.consultant_id === userId);
    const isKeyUser  = c.case_key_users?.some(ku => ku.user_id === userId);
    const isInvited  = visCfg.getCaseInvitations(c.id).some(i => i.consultantId === userId);
    return isAssigned || isKeyUser || isInvited;
  });
}


function SystemSettingsProvider({ children }) {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("system_settings").select("*");
    if (error) {
      setDbError(error.message);
      setSettings({});
    } else {
      const map = {};
      (data ?? []).forEach(r => { map[r.key] = r.value; });
      setSettings(map);
      setDbError(null);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function setSetting(key, value) {
    const { error } = await supabase.from("system_settings")
      .upsert({ key, value }, { onConflict: "key" });
    if (error) throw error;
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  return (
    <SystemSettingsContext.Provider value={{ settings, loading, dbError, setSetting, reload: load }}>
      {children}
    </SystemSettingsContext.Provider>
  );
}

function useSystemSettings() {
  const ctx = useContext(SystemSettingsContext);
  if (!ctx) {
    // Fallback for components rendered outside the provider (e.g. AuthScreen)
    return { settings: {}, loading: false, dbError: null, setSetting: async () => {}, reload: async () => {} };
  }
  return ctx;
}

// Returns a `can(capability)` function based on the role_permissions setting
function usePermissions(auth) {
  const { settings } = useSystemSettings();
  const role = auth?.profile?.role ?? null;

  const storedMatrix = settings["role_permissions"] ?? {};

  function can(capability) {
    if (!role) return false;
    if (role === "admin") return true;
    const capDefaults = ROLE_PERMISSIONS_DEFAULTS[capability] ?? {};
    const capStored   = storedMatrix[capability] ?? {};
    const merged = { ...capDefaults, ...capStored };
    return merged[role] === true;
  }

  return { can };
}

export {
  SystemSettingsContext,
  usePlatformBranding,
  usePlanConfig,
  useVisibilitySettings,
  filterCasesByVisibility,
  SystemSettingsProvider,
  useSystemSettings,
  usePermissions,
};
