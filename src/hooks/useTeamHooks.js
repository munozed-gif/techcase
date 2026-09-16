import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { notify } from "../lib/utils.js";

function useConsultantTeams(userId) {
  const [teams, setTeams] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async (background = false) => {
    if (!userId) { setLoading(false); return; }
    if (!background) setLoading(true);

    // Step 1: get all team IDs the user belongs to (any status)
    const { data: memberRows } = await supabase
      .from("consultant_team_members")
      .select("team_id")
      .eq("user_id", userId);

    const memberTeamIds = (memberRows ?? []).map(r => r.team_id);

    // Step 2: fetch teams created by user OR where they are a member
    const teamIds = [...new Set([...memberTeamIds])];
    const teamsQuery = supabase
      .from("consultant_teams")
      .select(`*, members:consultant_team_members(id, user_id, email, role, status, member:user_id(id, full_name, avatar_url, email))`)
      .order("created_at", { ascending: false });

    const [teamsResult, invitesResult] = await Promise.all([
      teamIds.length > 0
        ? teamsQuery.or(`created_by.eq.${userId},id.in.(${teamIds.join(",")})`)
        : teamsQuery.eq("created_by", userId),
      supabase
        .from("consultant_team_members")
        .select(`id, role, invited_at, team:team_id(id, name, description, created_by, owner:created_by(id, full_name))`)
        .eq("user_id", userId)
        .eq("status", "pending"),
    ]);

    setTeams(teamsResult.data ?? []);
    setPendingInvites(invitesResult.data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function createTeam(name, description, ownerEmail) {
    const { data: team, error } = await supabase
      .from("consultant_teams")
      .insert({ name: name.trim(), description: description?.trim() || null, created_by: userId })
      .select()
      .single();
    if (error) throw error;
    await supabase.from("consultant_team_members").insert({
      team_id: team.id,
      user_id: userId,
      email: ownerEmail ?? "",
      role: "owner",
      status: "accepted",
    });
    await fetchAll(true);
    return team;
  }

  async function inviteMember(teamId, teamName, email) {
    const norm = email.trim().toLowerCase();
    const { data: dup } = await supabase
      .from("consultant_team_members")
      .select("id, status")
      .eq("team_id", teamId)
      .ilike("email", norm)
      .maybeSingle();
    if (dup) {
      throw new Error(dup.status === "declined"
        ? "This person declined the invitation."
        : "Already invited or a member.");
    }
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .ilike("email", norm)
      .maybeSingle();
    const { error } = await supabase.from("consultant_team_members").insert({
      team_id: teamId,
      user_id: existingUser?.id ?? null,
      email: norm,
      role: "member",
      status: "pending",
    });
    if (error) throw error;
    if (existingUser?.id) {
      await notify(
        existingUser.id,
        "Team Invitation",
        `You've been invited to join the team "${teamName}". Open your profile → Teams tab to respond.`,
      );
    }
    await fetchAll(true);
  }

  async function respondToInvite(memberId, accept) {
    await supabase
      .from("consultant_team_members")
      .update({ status: accept ? "accepted" : "declined", responded_at: new Date().toISOString() })
      .eq("id", memberId);
    await fetchAll(true);
  }

  async function removeMember(memberId) {
    await supabase.from("consultant_team_members").delete().eq("id", memberId);
    await fetchAll(true);
  }

  async function leaveTeam(teamId) {
    await supabase
      .from("consultant_team_members")
      .delete()
      .eq("team_id", teamId)
      .eq("user_id", userId);
    await fetchAll(true);
  }

  async function deleteTeam(teamId) {
    await supabase.from("consultant_teams").delete().eq("id", teamId);
    await fetchAll(true);
  }

  return {
    teams,
    pendingInvites,
    loading,
    createTeam,
    inviteMember,
    respondToInvite,
    removeMember,
    leaveTeam,
    deleteTeam,
    refetch: fetchAll,
  };
}

export { useConsultantTeams };
