// Partner / customer context of the signed-in user (rpc my_partner_context), shared by every
// component through a small module cache. The first load also claims pending customer invites
// sent to the user's email, so an invited customer user sees their customer right away.
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase.js";

const EMPTY = { partners: [], customers: [] };
let cache = { userId: null, data: null, loading: false, promise: null, claimed: false };
const listeners = new Set();
const emit = () => listeners.forEach(fn => fn({ ...cache }));

async function load(userId, force = false) {
  if (!userId) return EMPTY;
  if (!force && cache.userId === userId && cache.data) return cache.data;
  if (!force && cache.userId === userId && cache.promise) return cache.promise;
  if (cache.userId !== userId) cache = { userId, data: null, loading: false, promise: null, claimed: false };
  cache.loading = true; emit();
  cache.promise = (async () => {
    try {
      if (!cache.claimed) {
        cache.claimed = true;
        await supabase.rpc("claim_customer_invites").then(() => {}, () => {});
      }
      const { data, error } = await supabase.rpc("my_partner_context");
      if (error) throw error;
      cache.data = { partners: data?.partners ?? [], customers: data?.customers ?? [] };
    } catch (e) {
      console.warn("[partners] context:", e.message);
      cache.data = cache.data ?? EMPTY;
    } finally {
      cache.loading = false; cache.promise = null; emit();
    }
    return cache.data;
  })();
  return cache.promise;
}

export function refreshPartnerContext() {
  return cache.userId ? load(cache.userId, true) : Promise.resolve(EMPTY);
}

export function usePartnerContext(userId) {
  const [state, setState] = useState(() => ({ ...cache }));
  useEffect(() => {
    listeners.add(setState);
    if (userId) load(userId);
    return () => listeners.delete(setState);
  }, [userId]);
  const data = state.userId === userId && state.data ? state.data : EMPTY;
  const partners = data.partners;
  const approved = partners.filter(p => p.status === "approved");
  const manageable = approved.filter(p => p.role === "owner" || p.role === "admin");
  return {
    loading: !state.data && !!userId,
    partners,
    customers: data.customers,
    approvedPartners: approved,
    manageablePartners: manageable,
    pendingPartner: partners.find(p => p.status === "pending") ?? null,
    isPartnerMember: approved.length > 0,
    canCreateProjects: manageable.length > 0,
    partnerById: useCallback(id => partners.find(p => p.id === id) ?? null, [partners]),
    refresh: refreshPartnerContext,
  };
}

/** Plan limits of a partner as the app shows them (-1 = unlimited). */
export const PARTNER_LIMIT_LABELS = [
  { key: "maxCustomers",      label: "Customers",               kind: "count" },
  { key: "maxProjects",       label: "Active projects",         kind: "count" },
  { key: "maxOpenCases",      label: "Open cases",              kind: "count" },
  { key: "maxMembers",        label: "Team members",            kind: "count" },
  { key: "maxSapEnvs",        label: "SAP environments per customer / project", kind: "count" },
  { key: "projectVpn",        label: "Per-project VPN",         kind: "flag" },
  { key: "sapImplementation", label: "SAP implementation (write to SAP)", kind: "flag" },
  { key: "validations",       label: "Custom validation rules", kind: "flag" },
];

export function fmtLimit(v, kind) {
  if (kind === "flag") return v ? "Included" : "—";
  return v === -1 || v === undefined || v === null ? "Unlimited" : String(v);
}
