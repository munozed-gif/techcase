import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";

// computeApplicantScore, computeTeamScore, useApplicantRanking

function _normalizeWeights(raw) {
  const keys = ["skills", "rating", "clientFamiliarity", "clientRating", "experience", "rate", "commitment"];
  const sum = keys.reduce((s, k) => s + (raw[k] ?? 0), 0) || 100;
  let allocated = 0;
  const W = {};
  keys.forEach((k, i) => {
    if (i === keys.length - 1) { W[k] = 100 - allocated; }
    else { W[k] = Math.round(((raw[k] ?? 0) / sum) * 100); allocated += W[k]; }
  });
  return W;
}

const DEFAULT_WEIGHTS = { skills: 25, rating: 20, clientFamiliarity: 15, clientRating: 15, experience: 10, rate: 10, commitment: 5 };

function _skillOverlap(memberSkills, requiredSkills) {
  if (!requiredSkills.length) return null; // no required skills — neutral
  const matched = requiredSkills.filter(r =>
    (memberSkills ?? []).some(s =>
      s.toLowerCase().includes(r.toLowerCase()) || r.toLowerCase().includes(s.toLowerCase())
    )
  ).length;
  return { matched, total: requiredSkills.length, ratio: matched / requiredSkills.length };
}

// ─── Individual application scoring ──────────────────────────────────────────

function computeApplicantScore(app, caseData, pastAssignments, allRatings, clientWeights = null) {
  const W = _normalizeWeights(clientWeights ?? DEFAULT_WEIGHTS);

  const profile = Array.isArray(app.consultant?.consultant_profiles)
    ? app.consultant.consultant_profiles[0]
    : app.consultant?.consultant_profiles;
  const consultantSkills = profile?.skills ?? [];
  const required = [
    ...(caseData.skills_required ?? []),
    caseData.area_sap, caseData.area_industry,
  ].filter(Boolean);

  // 1. Skill match — consultant skills vs case requirements
  const overlap = _skillOverlap(consultantSkills, required);
  const skillPts = overlap !== null
    ? Math.round(overlap.ratio * W.skills)
    : Math.round(W.skills * 0.5);

  // 2. Overall avg rating
  const myRatings = allRatings.filter(r => r.consultant_id === app.consultant_id);
  const avgRating = myRatings.length ? myRatings.reduce((s, r) => s + r.score, 0) / myRatings.length : 0;
  const ratingPts = myRatings.length ? Math.round((avgRating / 5) * W.rating) : 0;

  // 3. Client familiarity
  const clientWork = (pastAssignments ?? []).filter(
    a => a.consultant_id === app.consultant_id && (a.case?.client_id ?? null) === caseData.client_id
  );
  const familiarityPts = clientWork.length ? W.clientFamiliarity : 0;

  // 4. Client-specific rating
  const clientCaseIds = new Set(clientWork.map(a => a.case_id));
  const clientRatings = myRatings.filter(r => clientCaseIds.has(r.case_id));
  const clientAvg = clientRatings.length ? clientRatings.reduce((s, r) => s + r.score, 0) / clientRatings.length : 0;
  const clientRatingPts = clientRatings.length ? Math.round((clientAvg / 5) * W.clientRating) : 0;

  // 5. Experience match
  const minExp = caseData.min_years_experience ?? 0;
  const theirExp = profile?.years_experience ?? 0;
  const expRatio = minExp === 0 ? 1 : theirExp >= minExp * 1.5 ? 1 : theirExp >= minExp ? 0.8 : theirExp >= minExp * 0.75 ? 0.4 : 0;
  const expPts = Math.round(expRatio * W.experience);

  // 6. Rate fit
  const profileRate = profile?.hourly_rate;
  const proposed = app.proposed_rate;
  let rateRatio = 0.5;
  if (proposed && profileRate) {
    const r = proposed / profileRate;
    rateRatio = r <= 0.9 ? 1 : r <= 1.0 ? 0.8 : r <= 1.15 ? 0.5 : 0.2;
  }
  const ratePts = Math.round(rateRatio * W.rate);

  // 7. Time commitment vs available capacity
  const maxAvail = app.max_available_at_submission ?? 100;
  const ratio = maxAvail > 0 ? (app.time_commitment ?? 0) / maxAvail : 0;
  const commitPts = !app.time_commitment ? 0
    : ratio >= 0.8 ? 5 : ratio >= 0.6 ? 4 : ratio >= 0.4 ? 3 : ratio >= 0.2 ? 2 : 1;

  const total = skillPts + ratingPts + familiarityPts + clientRatingPts + expPts + ratePts + commitPts;
  const detail_overlap = overlap !== null ? `${overlap.matched}/${overlap.total} matched` : null;

  return {
    ...app,
    totalScore: total,
    teamScoring: false,
    breakdown: {
      skills:            { pts: skillPts,        max: W.skills,            labelKey: "rank.label_skills",        detail: detail_overlap, detailKey: overlap !== null ? null : "rank.detail_no_req" },
      rating:            { pts: ratingPts,        max: W.rating,            labelKey: "rank.label_rating",        detail: myRatings.length ? `${avgRating.toFixed(1)}★ (${myRatings.length})` : null, detailKey: myRatings.length ? null : "rank.detail_no_ratings" },
      clientFamiliarity: { pts: familiarityPts,   max: W.clientFamiliarity, labelKey: "rank.label_client_exp",   detail: clientWork.length ? `${clientWork.length}× with client` : null, detailKey: clientWork.length ? null : "rank.detail_first_time" },
      clientRating:      { pts: clientRatingPts,  max: W.clientRating,      labelKey: "rank.label_client_rating", detail: clientRatings.length ? `${clientAvg.toFixed(1)}★ from client` : null, detailKey: clientRatings.length ? null : "rank.detail_no_client_ratings" },
      experience:        { pts: expPts,           max: W.experience,        labelKey: "rank.label_experience",    detail: minExp ? `${theirExp}y / min ${minExp}y` : `${theirExp}y exp` },
      rate:              { pts: ratePts,          max: W.rate,              labelKey: "rank.label_rate",          detail: proposed ? `$${proposed}/hr` : null, detailKey: proposed ? null : "rank.detail_not_specified" },
      commitment:        { pts: commitPts,        max: W.commitment,        labelKey: "rank.label_availability",  detail: app.time_commitment ? `${app.time_commitment}% of ${maxAvail}% avail (${Math.round(ratio * 100)}%)` : "—" },
    },
  };
}

// ─── Team application scoring ─────────────────────────────────────────────────
//
// Evaluation has two layers:
//   • Per-role: each assigned member is scored against their role's required skills
//   • Team aggregate: combined coverage, weighted-average rating, client familiarity
//     fraction, average experience, aggregate commitment
//
// All 7 criteria map to the same breakdown keys as individual scoring so the UI
// renders identically; roleDetails[] carries the per-member drill-down.

function computeTeamScore(app, caseData, profileMap, allRatings, allAssignments, clientWeights = null) {
  const W = _normalizeWeights(clientWeights ?? DEFAULT_WEIGHTS);

  const roleAssignments = app.role_assignments ?? [];
  const requiredRoles   = caseData.required_roles ?? [];

  // Collect unique assigned member IDs (a member can cover multiple roles)
  const assignedIds = [...new Set(roleAssignments.map(ra => ra.consultant_id).filter(Boolean))];

  // ── Per-role skill fit ────────────────────────────────────────────────────
  // For each required role: score the assigned member's skill overlap with that
  // role's required_skills. An unassigned role contributes 0 (maximum penalty).
  const roleDetails = requiredRoles.map(role => {
    const ra = roleAssignments.find(r => r.role_id === role.id);
    if (!ra?.consultant_id) {
      return { roleLabel: role.label, memberName: null, matched: 0, total: (role.required_skills ?? []).length, ratio: 0, unassigned: true };
    }
    const memberProfile = profileMap[ra.consultant_id];
    const overlap = _skillOverlap(memberProfile?.skills ?? [], role.required_skills ?? []);
    return {
      roleLabel:  role.label,
      memberId:   ra.consultant_id,
      memberName: ra.consultant_name ?? memberProfile?.full_name ?? "Unknown",
      matched:    overlap?.matched ?? 0,
      total:      overlap?.total ?? 0,
      ratio:      overlap !== null ? overlap.ratio : 0.5, // neutral if no role skills specified
    };
  });

  // Average role-fit ratio across all required roles
  const avgRoleFitRatio = roleDetails.length > 0
    ? roleDetails.reduce((s, r) => s + r.ratio, 0) / roleDetails.length
    : 0.5;

  // ── Team case-level skill coverage ───────────────────────────────────────
  // Union of all assigned members' skills vs the case's skills_required list.
  // Used alongside role fit to compute the final skills score.
  const caseRequired = [
    ...(caseData.skills_required ?? []),
    caseData.area_sap,
    caseData.area_industry,
  ].filter(Boolean);
  const allMemberSkills = assignedIds.flatMap(id => profileMap[id]?.skills ?? []);
  const caseOverlap = _skillOverlap(allMemberSkills, caseRequired);

  // Blend: role-fit is the primary signal (70%), case-level coverage is secondary (30%).
  const blendedSkillRatio = roleDetails.length > 0
    ? 0.7 * avgRoleFitRatio + 0.3 * (caseOverlap?.ratio ?? avgRoleFitRatio)
    : (caseOverlap?.ratio ?? 0.5);
  const skillPts = Math.round(blendedSkillRatio * W.skills);

  // ── Team average rating (weighted by rating count per member) ─────────────
  const memberRatingSummaries = assignedIds.map(id => {
    const myR = allRatings.filter(r => r.consultant_id === id);
    return { id, avg: myR.length ? myR.reduce((s, r) => s + r.score, 0) / myR.length : null, count: myR.length };
  }).filter(m => m.avg !== null);
  const totalRatingWeight = memberRatingSummaries.reduce((s, m) => s + m.count, 0);
  const teamAvgRating = totalRatingWeight > 0
    ? memberRatingSummaries.reduce((s, m) => s + m.avg * m.count, 0) / totalRatingWeight
    : 0;
  const ratingPts = memberRatingSummaries.length ? Math.round((teamAvgRating / 5) * W.rating) : 0;

  // ── Client familiarity — fraction of assigned members who know this client ─
  const memberClientWorkCounts = assignedIds.map(id => ({
    id,
    count: (allAssignments ?? []).filter(a => a.consultant_id === id && a.case?.client_id === caseData.client_id).length,
  }));
  const membersWithClientWork = memberClientWorkCounts.filter(m => m.count > 0).length;
  const familiarityRatio = assignedIds.length > 0 ? membersWithClientWork / assignedIds.length : 0;
  const familiarityPts = Math.round(familiarityRatio * W.clientFamiliarity);

  // ── Client-specific rating for members who have worked with this client ────
  const clientCaseIds = new Set(
    (allAssignments ?? [])
      .filter(a => assignedIds.includes(a.consultant_id) && a.case?.client_id === caseData.client_id)
      .map(a => a.case_id)
  );
  const clientRatings = allRatings.filter(r => assignedIds.includes(r.consultant_id) && clientCaseIds.has(r.case_id));
  const clientAvg = clientRatings.length ? clientRatings.reduce((s, r) => s + r.score, 0) / clientRatings.length : 0;
  const clientRatingPts = clientRatings.length ? Math.round((clientAvg / 5) * W.clientRating) : 0;

  // ── Experience — average across team vs case minimum ─────────────────────
  const minExp = caseData.min_years_experience ?? 0;
  const expValues = assignedIds.map(id => profileMap[id]?.years_experience ?? 0);
  const avgExp = expValues.length ? expValues.reduce((s, v) => s + v, 0) / expValues.length : 0;
  const expRatio = minExp === 0 ? 1 : avgExp >= minExp * 1.5 ? 1 : avgExp >= minExp ? 0.8 : avgExp >= minExp * 0.75 ? 0.4 : 0;
  const expPts = Math.round(expRatio * W.experience);

  // ── Rate fit — proposed vs sum of all members' profile hourly rates ────────
  const proposed = app.proposed_rate;
  const sumProfileRates = assignedIds.reduce((s, id) => s + (profileMap[id]?.hourly_rate ?? 0), 0);
  let rateRatio = 0.5;
  if (proposed && sumProfileRates > 0) {
    const r = proposed / sumProfileRates;
    rateRatio = r <= 0.9 ? 1 : r <= 1.0 ? 0.8 : r <= 1.15 ? 0.5 : 0.2;
  }
  const ratePts = Math.round(rateRatio * W.rate);

  // ── Commitment — lead's time commitment vs their available capacity ────────
  // Individual members' availability is tracked separately via live recalc.
  const maxAvail = app.max_available_at_submission ?? 100;
  const commitRatio = maxAvail > 0 ? (app.time_commitment ?? 0) / maxAvail : 0;
  const commitPts = !app.time_commitment ? 0
    : commitRatio >= 0.8 ? 5 : commitRatio >= 0.6 ? 4 : commitRatio >= 0.4 ? 3 : commitRatio >= 0.2 ? 2 : 1;

  const total = skillPts + ratingPts + familiarityPts + clientRatingPts + expPts + ratePts + commitPts;

  const assignedCount = roleAssignments.filter(r => r.consultant_id).length;
  const skillDetail = requiredRoles.length > 0
    ? `${assignedCount}/${requiredRoles.length} roles · ${Math.round(avgRoleFitRatio * 100)}% avg fit`
    : caseOverlap !== null
      ? `${caseOverlap.matched}/${caseOverlap.total} case skills covered`
      : "No skill requirements";

  return {
    ...app,
    totalScore: total,
    teamScoring: true,
    roleDetails,
    assignedIds,
    breakdown: {
      skills: {
        pts: skillPts, max: W.skills,
        labelKey: "rank.label_skills",
        detail: skillDetail,
      },
      rating: {
        pts: ratingPts, max: W.rating,
        labelKey: "rank.label_rating",
        detail: memberRatingSummaries.length ? `${teamAvgRating.toFixed(1)}★ avg · ${assignedIds.length} members` : null,
        detailKey: !memberRatingSummaries.length ? "rank.detail_no_ratings" : null,
      },
      clientFamiliarity: {
        pts: familiarityPts, max: W.clientFamiliarity,
        labelKey: "rank.label_client_exp",
        detail: `${membersWithClientWork}/${assignedIds.length} members know client`,
      },
      clientRating: {
        pts: clientRatingPts, max: W.clientRating,
        labelKey: "rank.label_client_rating",
        detail: clientRatings.length ? `${clientAvg.toFixed(1)}★ from client` : null,
        detailKey: !clientRatings.length ? "rank.detail_no_client_ratings" : null,
      },
      experience: {
        pts: expPts, max: W.experience,
        labelKey: "rank.label_experience",
        detail: minExp ? `${avgExp.toFixed(0)}y avg / min ${minExp}y` : `${avgExp.toFixed(0)}y team avg`,
      },
      rate: {
        pts: ratePts, max: W.rate,
        labelKey: "rank.label_rate",
        detail: proposed ? `$${proposed}/hr proposed` : null,
        detailKey: !proposed ? "rank.detail_not_specified" : null,
      },
      commitment: {
        pts: commitPts, max: W.commitment,
        labelKey: "rank.label_availability",
        detail: app.time_commitment ? `${app.time_commitment}% of ${maxAvail}% avail (lead)` : "—",
      },
    },
  };
}

// ─── Ranking hook ─────────────────────────────────────────────────────────────

function useApplicantRanking(caseData, applications) {
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(false);
  const [clientSettings, setClientSettings] = useState(null);

  useEffect(() => {
    if (!caseData?.client_id) return;
    supabase.from("client_profiles")
      .select("assignment_settings")
      .eq("id", caseData.client_id)
      .maybeSingle()
      .then(({ data }) => setClientSettings(data?.assignment_settings ?? null));
  }, [caseData?.client_id]);

  useEffect(() => {
    if (!caseData?.id || !applications?.length) { setRanking([]); return; }

    // Collect ALL consultant IDs: applicants + every member in role_assignments
    const applicantIds = [...new Set(applications.map(a => a.consultant_id))];
    const teamMemberIds = [...new Set(
      applications.flatMap(a => (a.role_assignments ?? []).map(ra => ra.consultant_id).filter(Boolean))
    )];
    const allIds = [...new Set([...applicantIds, ...teamMemberIds])];

    (async () => {
      setLoading(true);
      const [{ data: rawProfiles }, { data: rawRatings }, { data: assignments }] = await Promise.all([
        supabase.from("consultant_profiles")
          .select("id, full_name, skills, hourly_rate, years_experience, external_occupancy_pct")
          .in("id", allIds),
        supabase.from("case_ratings")
          .select("ratee_id, scores, case_id, case:case_id(client_id)")
          .in("ratee_id", allIds)
          .eq("ratee_role", "consultant"),
        supabase.from("case_assignments")
          .select("consultant_id, case_id, case:case_id(client_id)")
          .in("consultant_id", allIds),
      ]);

      const profileMap = Object.fromEntries((rawProfiles ?? []).map(p => [p.id, p]));

      const ratings = (rawRatings ?? []).map(r => {
        const vals = Object.values(r.scores ?? {});
        return {
          consultant_id: r.ratee_id,
          score: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0,
          case_id: r.case_id,
          case: r.case,
        };
      });

      const weights = clientSettings ? {
        skills:            clientSettings.weight_skills             ?? 25,
        rating:            clientSettings.weight_rating             ?? 20,
        clientFamiliarity: clientSettings.weight_client_familiarity ?? 15,
        clientRating:      clientSettings.weight_client_rating      ?? 15,
        experience:        clientSettings.weight_experience         ?? 10,
        rate:              clientSettings.weight_rate               ?? 10,
        commitment:        clientSettings.weight_commitment         ?? 5,
      } : null;

      const scored = applications
        .map(app => {
          const isTeam = app.application_type === "team" && (app.role_assignments?.length > 0 || (caseData.required_roles?.length > 0));
          if (isTeam) {
            return computeTeamScore(app, caseData, profileMap, ratings, assignments ?? [], weights);
          }
          return computeApplicantScore(app, caseData, assignments ?? [], ratings ?? [], weights);
        })
        .sort((a, b) => b.totalScore - a.totalScore);

      setRanking(scored);
      setLoading(false);
    })();
  }, [caseData?.id, applications?.length, clientSettings]);

  return { ranking, loading, clientSettings };
}

export { computeApplicantScore, computeTeamScore, useApplicantRanking };
