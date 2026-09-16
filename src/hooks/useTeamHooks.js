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

    try {
      // 1. Teams created by me OR where I'm an accepted member
      const { data: memberOf } = await supabase
        .from("consultant_team_members")
        .select("team_id")
        .eq("user_id", userId)
        .eq("status", "accepted");

      const memberTeamIds = (memberOf ?? []).map(r => r.team_id);

      let teamsQuery = supabase
        .from("consultant_teams")
        .select("*")
        .order("created_at", { ascending: false });

      if (memberTeamIds.length > 0) {
        teamsQuery = teamsQuery.or(`created_by.eq.${userId},id.in.(${memberTeamIds.join(",")})`);
      } else {
        teamsQuery = teamsQuery.eq("created_by", userId);
      }

      const { data: teamsData } = await teamsQuery;
      const myTeams = teamsData ?? [];

      // 2. Members for those teams (separate query — avoids nested FK select issues)
      if (myTeams.length > 0) {
        const { data: membersData } = await supabase
          .from("consultant_team_members")
          .select("id, team_id, user_id, email, role, status")
          .in("team_id", myTeams.map(t => t.id));

        // Fetch user info for members who have a user_id
        const memberUserIds = [...new Set((membersData ?? []).map(m => m.user_id).filter(Boolean))];
        let userMap = {};
        if (memberUserIds.length > 0) {
          const { data: usersData } = await supabase
            .from("users")
            .select("id, full_name, avatar_url, email")
            .in("id", memberUserIds);
          (usersData ?? []).forEach(u => { userMap[u.id] = u; });
        }

        const byTeam = {};
        (membersData ?? []).forEach(m => {
          if (!byTeam[m.team_id]) byTeam[m.team_id] = [];
          byTeam[m.team_id].push({ ...m, member: userMap[m.user_id] ?? null });
        });
        myTeams.forEach(t => { t.members = byTeam[t.id] ?? []; });
      }

      // 3. Pending invites to me
      const { data: invitesData } = await supabase
        .from("consultant_team_members")
        .select("id, role, invited_at, team_id")
        .eq("user_id", userId)
        .eq("status", "pending");

      // Fetch team info for invites
      const inviteTeamIds = (invitesData ?? []).map(i => i.team_id);
      let inviteTeamMap = {};
      if (inviteTeamIds.length > 0) {
        const { data: invTeams } = await supabase
          .from("consultant_teams")
          .select("id, name, description, created_by")
          .in("id", inviteTeamIds);
        (invTeams ?? []).forEach(t => { inviteTeamMap[t.id] = t; });
      }
      const pendingInvitesFull = (invitesData ?? []).map(i => ({
        ...i,
        team: inviteTeamMap[i.team_id] ?? null,
      }));

      setTeams(myTeams);
      setPendingInvites(pendingInvitesFull);
    } catch (err) {
      console.error("useConsultantTeams fetchAll:", err);
    } finally {
      setLoading(false);
    }
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
