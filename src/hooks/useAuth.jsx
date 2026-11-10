import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { logEvent } from "../lib/utils.js";

function useAuth() {
  const [user, setUser]                     = useState(null);
  const [profile, setProfile]               = useState(null);
  const [loading, setLoading]               = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
        setUser(session?.user ?? null);
        setLoading(false);
        return;
      }
      setIsPasswordRecovery(false);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const CLIENT_TEAM_ROLES = ['key_user', 'final_user', 'internal_consultant', 'project_manager'];

  async function fetchProfile(userId) {
    // Fetch base user row first (no join — avoids PostgREST schema-cache issues on fresh DBs)
    let { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (data) {
      // Fetch nested profiles separately so a missing FK cache doesn't block the base row
      const [{ data: cp }, { data: clp }] = await Promise.all([
        supabase.from("consultant_profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("client_profiles").select("*").eq("id", userId).maybeSingle(),
      ]);
      data = { ...data, consultant_profiles: cp ?? null, client_profiles: clp ?? null };
    }

    if (!data) {
      // Trigger may have failed — try creating the public.users row client-side
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const meta = user.user_metadata ?? {};
        // complete_signup validates the role and decides approval server-side;
        // roles it doesn't accept (e.g. invited_client) fall back to consultant.
        const { error: completeErr } = await supabase.rpc("complete_signup", {
          p_full_name: meta.full_name || user.email.split("@")[0],
          p_role: meta.role || "consultant",
        });
        if (completeErr) {
          await supabase.rpc("complete_signup", {
            p_full_name: meta.full_name || user.email.split("@")[0],
            p_role: "consultant",
          });
        }
        const { data: retry } = await supabase
          .from("users").select("*").eq("id", userId).single();
        if (retry) {
          const [{ data: cp }, { data: clp }] = await Promise.all([
            supabase.from("consultant_profiles").select("*").eq("id", userId).maybeSingle(),
            supabase.from("client_profiles").select("*").eq("id", userId).maybeSingle(),
          ]);
          data = { ...retry, consultant_profiles: cp ?? null, client_profiles: clp ?? null };
        }
      }
    }

    // For client team members, find the client they belong to so plan limits
    // can be inherited from the client's billing plan rather than their own.
    // client_team_members links by email, not user_id.
    if (data && CLIENT_TEAM_ROLES.includes(data.role) && data.email) {
      const { data: membership } = await supabase
        .from("client_team_members")
        .select("client_id")
        .eq("email", data.email)
        .maybeSingle();
      if (membership?.client_id) {
        data = { ...data, team_client_id: membership.client_id };
      }
    }

    setProfile(data ?? null);
    setLoading(false);
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signUp(email, password, fullName, role = "consultant") {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, role } }
    });
    if (error) throw error;
    logEvent('user.signed_up', { userId: data.user?.id, userEmail: email, entityType: 'user', entityName: fullName, metadata: { role } });
    return data;
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  // For client team members, billing is under the associated client account.
  const billingUserId = (profile && CLIENT_TEAM_ROLES.includes(profile.role))
    ? (profile.team_client_id ?? user?.id)
    : user?.id;

  return {
    user, profile, loading, isPasswordRecovery,
    clearPasswordRecovery: () => setIsPasswordRecovery(false),
    role: profile?.role ?? null,
    billingUserId,
    signIn, signUp, signOut,
    refreshProfile: () => { if (user) fetchProfile(user.id); },
    isAdmin:          profile?.role === "admin",
    isManager:        profile?.role === "manager",
    isConsultant:     profile?.role === "consultant",
    isClient:         profile?.role === "client",
    isInvitedClient:  profile?.role === "invited_client",
    isKeyUser:        ["key_user", "internal_consultant", "project_manager"].includes(profile?.role),
    isHeadhunter:     profile?.role === "headhunter",
    isFinalUser:      profile?.role === "final_user",
    isDispatch:       profile?.role === "dispatch",
    isAreaLeader:     profile?.role === "area_leader",
  };
}

export { useAuth };
