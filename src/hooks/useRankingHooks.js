import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";

// computeApplicantScore, useApplicantRanking

function computeApplicantScore(app, caseData, pastAssignments, allRatings, clientWeights = null) {
  // Normalize client weights so they always sum to 100
  const RAW_W = clientWeights ?? { skills: 25, rating: 20, clientFamiliarity: 15, clientRating: 15, experience: 10, rate: 10, commitment: 5 };
  const wSum = Object.values(RAW_W).reduce((s, v) => s + (v || 0), 0) || 100;
  const wKeys = ["skills","rating","clientFamiliarity","clientRating","experience","rate","commitment"];
  let allocated = 0;
  const W = {};
  wKeys.forEach((k, i) => {
    if (i === wKeys.length - 1) { W[k] = 100 - allocated; }
    else { W[k] = Math.round(((RAW_W[k] ?? 0) / wSum) * 100); allocated += W[k]; }
  });

  const profile = Array.isArray(app.consultant?.consultant_profiles)
    ? app.consultant.consultant_profiles[0]
    : app.consultant?.consultant_profiles;
  const consultantSkills = profile?.skills ?? [];
  const required = [
    ...(caseData.skills_required ?? []),
    caseData.area_sap, caseData.area_industry,
  ].filter(Boolean);

  // 1. Skill match
  const matched = required.length
    ? required.filter(r => consultantSkills.some(s =>
        s.toLowerCase().includes(r.toLowerCase()) || r.toLowerCase().includes(s.toLowerCase())
      )).length
    : 0;
  const skillPts = required.length ? Math.round((matched / required.length) * W.skills) : Math.round(W.skills * 0.5);

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

  // 6. Rate fit vs profile hourly rate
  const profileRate = profile?.hourly_rate;
  const proposed = app.proposed_rate;
  let rateRatio = 0.5;
  if (proposed && profileRate) {
    const r = proposed / profileRate;
    rateRatio = r <= 0.9 ? 1 : r <= 1.0 ? 0.8 : r <= 1.15 ? 0.5 : 0.2;
  }
  const ratePts = Math.round(rateRatio * W.rate);

  // 7. Time commitment vs available capacity (5 pts)
  // Score how much of their free capacity they're committing, not raw %.
  const maxAvail = app.max_available_at_submission ?? 100;
  const ratio = maxAvail > 0 ? (app.time_commitment ?? 0) / maxAvail : 0;
  const commitPts = !app.time_commitment ? 0
    : ratio >= 0.8 ? 5
    : ratio >= 0.6 ? 4
    : ratio >= 0.4 ? 3
    : ratio >= 0.2 ? 2
    : 1;
  const commitDetail = app.time_commitment
    ? `${app.time_commitment}% of ${maxAvail}% avail (${Math.round(ratio * 100)}%)`
    : "—";

  const total = skillPts + ratingPts + familiarityPts + clientRatingPts + expPts + ratePts + commitPts;
  return {
    ...app,
    totalScore: total,
    breakdown: {
      skills:            { pts: skillPts,        max: W.skills,            labelKey: "rank.label_skills",        detail: required.length ? `${matched}/${required.length} matched` : null, detailKey: required.length ? null : "rank.detail_no_req" },
      rating:            { pts: ratingPts,        max: W.rating,            labelKey: "rank.label_rating",        detail: myRatings.length ? `${avgRating.toFixed(1)}★ (${myRatings.length})` : null, detailKey: myRatings.length ? null : "rank.detail_no_ratings" },
      clientFamiliarity: { pts: familiarityPts,   max: W.clientFamiliarity, labelKey: "rank.label_client_exp",   detail: clientWork.length ? `${clientWork.length}× with client` : null, detailKey: clientWork.length ? null : "rank.detail_first_time" },
      clientRating:      { pts: clientRatingPts,  max: W.clientRating,      labelKey: "rank.label_client_rating", detail: clientRatings.length ? `${clientAvg.toFixed(1)}★ from client` : null, detailKey: clientRatings.length ? null : "rank.detail_no_client_ratings" },
      experience:        { pts: expPts,           max: W.experience,        labelKey: "rank.label_experience",    detail: minExp ? `${theirExp}y / min ${minExp}y` : `${theirExp}y exp` },
      rate:              { pts: ratePts,          max: W.rate,              labelKey: "rank.label_rate",          detail: proposed ? `$${proposed}/hr` : null, detailKey: proposed ? null : "rank.detail_not_specified" },
      commitment:        { pts: commitPts,        max: W.commitment,        labelKey: "rank.label_availability",  detail: commitDetail },
    },
  };
}

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
    const ids = [...new Set(applications.map(a => a.consultant_id))];
    (async () => {
      setLoading(true);
      const [{ data: rawRatings }, { data: assignments }] = await Promise.all([
        supabase.from("case_ratings").select("ratee_id, scores, case_id, case:case_id(client_id)").in("ratee_id", ids).eq("ratee_role", "consultant"),
        supabase.from("case_assignments").select("consultant_id, case_id, case:case_id(client_id)").in("consultant_id", ids),
      ]);
      const ratings = (rawRatings ?? []).map(r => {
        const vals = Object.values(r.scores ?? {});
        return { consultant_id: r.ratee_id, score: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0, case_id: r.case_id, case: r.case };
      });
      const weights = clientSettings ? {
        skills:            clientSettings.weight_skills            ?? 25,
        rating:            clientSettings.weight_rating            ?? 20,
        clientFamiliarity: clientSettings.weight_client_familiarity ?? 15,
        clientRating:      clientSettings.weight_client_rating      ?? 15,
        experience:        clientSettings.weight_experience         ?? 10,
        rate:              clientSettings.weight_rate               ?? 10,
        commitment:        clientSettings.weight_commitment         ?? 5,
      } : null;
      const scored = applications
        .map(app => computeApplicantScore(app, caseData, assignments ?? [], ratings ?? [], weights))
        .sort((a, b) => b.totalScore - a.totalScore);
      setRanking(scored);
      setLoading(false);
    })();
  }, [caseData?.id, applications?.length, clientSettings]);
  return { ranking, loading, clientSettings };
}

export { computeApplicantScore, useApplicantRanking };
