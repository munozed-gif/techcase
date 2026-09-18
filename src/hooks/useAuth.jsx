import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { logEvent } from "../lib/utils.js";

function useAuth() {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const CLIENT_TEAM_ROLES = ['key_user', 'final_user', 'internal_consultant', 'project_manager'];

  async function fetchProfile(userId) {
    let { data } = await supabase
      .from("users")
      .select("*, consultant_profiles(*), client_profiles(*)")
      .eq("id", userId)
      .single();

    if (!data) {
      // Trigger may have failed — try creating the public.users row client-side
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const meta = user.user_metadata ?? {};
        const role = meta.role || "consultant";
        // Roles that go through admin approval; auto-approve only trusted admin/manager/client paths
        const SELF_APPROVED = ["admin", "manager", "client"];
        await supabase.from("users").insert({
          id: user.id,
          email: user.email,
          full_name: meta.full_name || user.email.split("@")[0],
          role,
          verification_status: SELF_APPROVED.includes(role) ? "approved" : "pending",
        });
        const { data: retry } = await supabase
          .from("users")
          .select("*, consultant_profiles(*), client_profiles(*)")
          .eq("id", userId)
          .single();
        data = retry;
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
    user, profile, loading,
    role: profile?.role ?? null,
    billingUserId,
    signIn, signUp, signOut,
    refreshProfile: () => { if (user) fetchProfile(user.id); },
    isAdmin:      profile?.role === "admin",
    isManager:    profile?.role === "manager",
    isConsultant: profile?.role === "consultant",
    isClient:     profile?.role === "client",
    isKeyUser:    profile?.role === "key_user",
    isHeadhunter: profile?.role === "headhunter",
    isFinalUser:  profile?.role === "final_user",
  };
}

export { useAuth };
