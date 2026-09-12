import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";

// useFavorites, useFollowedClients, useConsultantProfile

function useFavorites() {
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("favorites")
        .select("case_id").eq("consultant_id", user.id);
      setFavorites(data?.map(f => f.case_id) ?? []);
    })();
  }, []);

  function isFavorite(caseId) { return favorites.includes(caseId); }

  async function toggle(caseId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (isFavorite(caseId)) {
      await supabase.from("favorites")
        .delete().eq("consultant_id", user.id).eq("case_id", caseId);
      setFavorites(prev => prev.filter(id => id !== caseId));
    } else {
      await supabase.from("favorites").insert({ consultant_id: user.id, case_id: caseId });
      setFavorites(prev => [...prev, caseId]);
    }
  }

  return { favorites, isFavorite, toggle };
}

function useFollowedClients() {
  const [followed, setFollowed] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("followed_clients")
        .select("client_user_id").eq("consultant_id", user.id);
      setFollowed(data?.map(f => f.client_user_id) ?? []);
    })();
  }, []);

  function isFollowing(clientUserId) { return !!clientUserId && followed.includes(clientUserId); }

  async function toggle(clientUserId) {
    if (!clientUserId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (isFollowing(clientUserId)) {
      await supabase.from("followed_clients")
        .delete().eq("consultant_id", user.id).eq("client_user_id", clientUserId);
      setFollowed(prev => prev.filter(id => id !== clientUserId));
    } else {
      await supabase.from("followed_clients")
        .insert({ consultant_id: user.id, client_user_id: clientUserId });
      setFollowed(prev => [...prev, clientUserId]);
    }
  }

  return { followed, isFollowing, toggle };
}

function useConsultantProfile(consultantId, profileId) {
  const [profile, setProfile]       = useState(null);
  const [availability, setAvailability] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [profileError, setProfileError] = useState(null);

  const resolvedId = profileId ?? consultantId;

  const fetchProfile = useCallback(async () => {
    if (!resolvedId) return;
    setLoading(true);
    setProfileError(null);

    // Avoid the case_assignments nested join — it requires a FK from case_assignments
    // to consultant_profiles which may not exist. Fetch core + safe related tables only.
    const { data, error } = await supabase.from("consultant_profiles")
      .select(`*, work_authorizations(*), consultant_customers(*), consultant_projects(*)`)
      .eq("id", resolvedId)
      .maybeSingle();

    if (error) {
      setProfileError(error.message);
      console.error("fetchProfile error:", error.message);
    } else {
      setProfile(data ?? null);
    }

    const { data: avail } = await supabase.rpc("get_consultant_availability",
      { p_consultant_id: resolvedId });
    setAvailability(avail);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedId]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  async function updateProfile(updates) {
    const { data: updated, error } = await supabase.from("consultant_profiles")
      .update(updates).eq("id", resolvedId).select("id");
    if (error) throw error;
    if (!updated || updated.length === 0) {
      // No row exists yet — insert for first time
      const { error: ie } = await supabase.from("consultant_profiles")
        .insert({ id: resolvedId, ...updates });
      if (ie) throw new Error(`Profile create failed: ${ie.message}`);
    }
    await fetchProfile();
  }

  async function addCustomer(data) {
    const { error } = await supabase.from("consultant_customers")
      .insert({ ...data, consultant_id: resolvedId });
    if (error) throw error;
    await fetchProfile();
  }

  async function addProject(data) {
    const { error } = await supabase.from("consultant_projects")
      .insert({ ...data, consultant_id: resolvedId });
    if (error) throw error;
    await fetchProfile();
  }

  async function updateCustomer(id, data) {
    const { error } = await supabase.from("consultant_customers").update(data).eq("id", id);
    if (error) throw error;
    await fetchProfile();
  }

  async function deleteCustomer(id) {
    const { error } = await supabase.from("consultant_customers").delete().eq("id", id);
    if (error) throw error;
    await fetchProfile();
  }

  async function updateProject(id, data) {
    const { error } = await supabase.from("consultant_projects").update(data).eq("id", id);
    if (error) throw error;
    await fetchProfile();
  }

  async function deleteProject(id) {
    const { error } = await supabase.from("consultant_projects").delete().eq("id", id);
    if (error) throw error;
    await fetchProfile();
  }

  async function addWorkAuth(data) {
    const { error } = await supabase.from("work_authorizations")
      .insert({ ...data, consultant_id: resolvedId });
    if (error) throw error;
    await fetchProfile();
  }

  async function uploadPhoto(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    const path = `consultant-avatars/${consultantId}.${ext}`;
    const { error: upErr } = await supabase.storage.from("project-avatars").upload(path, file, { upsert: true });
    if (upErr) throw upErr;
    const { data: { publicUrl } } = supabase.storage.from("project-avatars").getPublicUrl(path);
    await updateProfile({ photo_url: publicUrl });
    await supabase.from("users").update({ avatar_url: publicUrl }).eq("id", consultantId);
    return publicUrl;
  }

  return { profile, availability, loading, profileError, updateProfile, uploadPhoto, addCustomer, updateCustomer, deleteCustomer, addProject, updateProject, deleteProject, addWorkAuth, refetch: fetchProfile };
}

export { useFavorites, useFollowedClients, useConsultantProfile };
