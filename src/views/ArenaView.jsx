import { useState, useEffect, useRef } from "react";
import {
  BarChart2, Bookmark, BookmarkCheck, Briefcase, Building2, Check,
  CheckCircle2, ChevronLeft, ChevronRight, Crosshair, ExternalLink,
  LayoutGrid, Lock, Mail, Phone, Send, Star, Trophy, User, X,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { useCases, useApplications, useRatings } from "../hooks/useCaseHooks.js";
import { useProjects } from "../hooks/useCoreHooks.js";
import { usePlanConfig, useSystemSettings, useVisibilitySettings } from "../hooks/useSystemSettings.jsx";
import { logEvent, notify } from "../lib/utils.js";
import { Badge, Spinner, TrustBadge, TierProgressBar, VouchingPanel } from "../components/ProfileComponents.jsx";
import { ConsultantProfileView } from "../components/ConsultantProfileView.jsx";
import { EmptyState, Input, Modal, Select } from "../components/ui.jsx";
import { AVAIL_LABEL_KEYS, EXPERTISE_LABEL_KEYS, PRIORITY_LABEL_KEYS, WORK_MODE_LABEL_KEYS, cap, fmt, fmtDate, timeAgo } from "../lib/uiUtils.jsx";
import { APP_STATUS_COLORS, DEFAULT_PLAN_CONFIG, INDUSTRY_AREAS, PLAN_BADGE, PRIORITY_COLORS, PROJECT_TYPES, ROLE_COLORS, ROLE_TO_PLAN_TYPE, SAP_AREAS, STATUS_COLORS, getLifecycleStages } from "../lib/businessConstants.js";
import { stars } from "../components/FeedComponents.jsx";
import { ApplicantRankingSection } from "../components/RankingComponents.jsx";
import { useLifecycleTemplates } from "../hooks/useLifecycleHooks.js";
import { useLeaderboard } from "../hooks/useNotificationHooks.js";
import { useConsultantProfile } from "../hooks/useProfileHooks.js";
import { ApplyWizard } from "./ApplyWizard.jsx";
import { PersonAvatar, ProjectAvatar, UserAvatar } from "./Projects.jsx";

function useConsultantShortlist() {
  const [shortlist, setShortlist] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('consultant_shortlist') || '[]')); }
    catch { return new Set(); }
  });

  function toggle(id) {
    setShortlist(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      try { localStorage.setItem('consultant_shortlist', JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  return { shortlist, toggle, isShortlisted: id => shortlist.has(id) };
}

// ============================================================
// CONSULTANT PROFILE PANEL (drawer used inside Arena)
// ============================================================
function ConsultantProfilePanel({ consultantId, initialRole, onClose, onAddToCompare, inCompare, auth, isShortlisted, onToggleShortlist, openCases, onOpenClientProfile }) {
  const { t } = useT();
  const { profile, availability, loading } = useConsultantProfile(consultantId);
  const { ratings, avgRating } = useRatings(consultantId);
  const [userName, setUserName]         = useState('');
  const [avatarUrl, setAvatarUrl]       = useState(null);
  const [userEmail, setUserEmail]       = useState('');
  const [userRole, setUserRole]         = useState(initialRole ?? '');
  const [userStatus, setUserStatus]     = useState('');
  const [panelView, setPanelView]       = useState('card'); // 'card' | 'profile'
  const [resetSent, setResetSent]       = useState(false);
  const [resetting, setResetting]       = useState(false);

  useEffect(() => {
    if (!consultantId) return;
    setPanelView('card');
    supabase.from('users').select('full_name, avatar_url, email, role, verification_status').eq('id', consultantId).maybeSingle()
      .then(({ data }) => {
        setUserName(data?.full_name ?? '');
        setAvatarUrl(data?.avatar_url ?? null);
        setUserEmail(data?.email ?? '');
        setUserRole(data?.role ?? '');
        setUserStatus(data?.verification_status ?? '');
      });
  }, [consultantId]);

  const winRate = ratings.length > 0
    ? Math.round((ratings.filter(r => r.score >= 4).length / ratings.length) * 100)
    : null;

  const [assignCaseId, setAssignCaseId] = useState('');
  const [assigning, setAssigning]       = useState(false);
  const [assignDone, setAssignDone]     = useState(false);
  const [panelTab, setPanelTab]         = useState('profile');
  const panelCarouselRef = useRef(null);
  const panelCarouselScrolling = useRef(false);
  const [panelMountedSlides, setPanelMountedSlides] = useState(() => new Set(["profile"]));
  const [panelManualCompletions, setPanelManualCompletionsRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`tc_panelmc_panel`) ?? "{}"); } catch { return {}; }
  });
  function setPanelManualComplete(tabId, done) {
    setPanelManualCompletionsRaw(prev => {
      const next = { ...prev, [tabId]: done };
      try { localStorage.setItem(`tc_panelmc_panel`, JSON.stringify(next)); } catch {}
      return next;
    });
  }
  const canAssign = auth && (auth.isAdmin || auth.isManager || auth.isHeadhunter);
  const canAdmin  = auth && (auth.isAdmin || auth.isManager);
  const planCfg = usePlanConfig();
  const panelVisCfg = useVisibilitySettings();
  const roleType = ROLE_TO_PLAN_TYPE[userRole] ?? null;
  const userPlan = roleType ? planCfg.getUserPlan(consultantId) : null;
  const [changingPlan, setChangingPlan] = useState(false);
  const CLIENT_ROLES = ['client', 'key_user', 'final_user', 'internal_consultant', 'project_manager'];
  const isConsultantRole = userRole === 'consultant';
  const isHeadhunterRole = userRole === 'headhunter';
  const isClientRole     = CLIENT_ROLES.includes(userRole);
  const hasProfile       = isConsultantRole || isHeadhunterRole || isClientRole;

  const [clientProfile, setClientProfile] = useState(null);
  const [clientCaseStats, setClientCaseStats] = useState(null);
  const [clientTeamMembers, setClientTeamMembers] = useState([]);

  useEffect(() => {
    if (!isClientRole || !consultantId) {
      setClientProfile(null); setClientCaseStats(null); setClientTeamMembers([]);
      return;
    }
    setClientProfile(null); setClientCaseStats(null); setClientTeamMembers([]);
    (async () => {
      let companyId = null;
      if (userRole === 'client') {
        const { data } = await supabase.from('client_profiles')
          .select('id, company_name, industry, website, description, created_at')
          .eq('id', consultantId).maybeSingle();
        setClientProfile(data ? { type: 'client', company: data } : null);
        companyId = consultantId;
      } else if (userEmail) {
        const { data: tm } = await supabase.from('client_team_members')
          .select('role_title, system_role, phone, client_id, is_primary, full_name')
          .eq('email', userEmail).maybeSingle();
        if (tm?.client_id) {
          const { data: co } = await supabase.from('client_profiles')
            .select('id, company_name, industry, website, description, created_at').eq('id', tm.client_id).maybeSingle();
          setClientProfile({ type: 'team', member: tm, company: co });
          companyId = tm.client_id;
        }
      }
      if (companyId) {
        const [{ data: cases }, { data: members }] = await Promise.all([
          supabase.from('cases').select('id, status').eq('client_id', companyId),
          supabase.from('client_team_members').select('full_name, email, role_title, system_role, phone, is_primary').eq('client_id', companyId),
        ]);
        if (cases) {
          const total = cases.length;
          const open  = cases.filter(c => !['closed','completed','cancelled'].includes(c.status)).length;
          const closed = total - open;
          setClientCaseStats({ total, open, closed });
        }
        setClientTeamMembers(members ?? []);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClientRole, userRole, consultantId, userEmail]);

  const PANEL_ROLE_COLORS = {
    consultant:          'bg-blue-100 text-blue-700',
    client:              'bg-green-100 text-green-700',
    headhunter:          'bg-purple-100 text-purple-700',
    manager:             'bg-orange-100 text-orange-700',
    key_user:            'bg-amber-100 text-amber-700',
    final_user:          'bg-teal-100 text-teal-700',
    internal_consultant: 'bg-indigo-100 text-indigo-700',
    project_manager:     'bg-rose-100 text-rose-700',
  };

  const STATUS_BADGE = {
    approved: 'bg-green-100 text-green-700',
    pending:  'bg-amber-100 text-amber-700',
    rejected: 'bg-red-100 text-red-700',
  };

  async function handleResetPassword() {
    if (!userEmail) return;
    setResetting(true);
    await supabase.auth.resetPasswordForEmail(userEmail);
    setResetting(false);
    setResetSent(true);
    setTimeout(() => setResetSent(false), 4000);
  }

  async function handleAssign() {
    if (!assignCaseId || !consultantId) return;
    setAssigning(true);
    try {
      await supabase.from('case_assignments').upsert({
        case_id: assignCaseId, consultant_id: consultantId, time_commitment: 100,
      }, { onConflict: 'case_id,consultant_id' });
      setAssignDone(true);
      setTimeout(() => setAssignDone(false), 3000);
    } catch(e) { alert(e.message); }
    finally { setAssigning(false); }
  }

  const panelTabs = [
    { id: 'profile', label: 'Profile', icon: User,  count: null },
    { id: 'ratings', label: 'Ratings', icon: Star,  count: ratings.length > 0 ? ratings.length : null },
  ];

  const panelTabStatus = (() => {
    const r = {};
    for (const tab of panelTabs) {
      if (panelManualCompletions[tab.id] !== undefined) {
        r[tab.id] = panelManualCompletions[tab.id] ? "complete" : "none"; continue;
      }
      r[tab.id] = "none";
    }
    return r;
  })();

  useEffect(() => {
    setPanelMountedSlides(prev => { const s = new Set(prev); s.add(panelTab); return s; });
    const el = panelCarouselRef.current;
    if (!el) return;
    const idx = panelTabs.findIndex(t => t.id === panelTab);
    if (idx < 0) return;
    const slide = el.children[idx];
    if (!slide) return;
    const targetLeft = slide.offsetLeft - (el.offsetWidth - slide.offsetWidth) / 2;
    panelCarouselScrolling.current = true;
    el.scrollTo({ left: targetLeft, behavior: 'smooth' });
    const tid = setTimeout(() => { panelCarouselScrolling.current = false; }, 600);
    return () => clearTimeout(tid);
  }, [panelTab]);

  return (
    <div className="w-full max-w-md bg-white h-full flex flex-col shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          {panelView === 'profile' && (
            <button onClick={() => setPanelView('card')} className="text-gray-400 hover:text-gray-700 transition-colors mr-1">
              <ChevronLeft size={18} />
            </button>
          )}
          <h2 className="font-bold text-gray-900 text-base">
            {panelView === 'card' ? 'User' : 'Profile'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {onToggleShortlist && (
            <button onClick={onToggleShortlist}
              title={isShortlisted ? "Remove from shortlist" : "Add to shortlist"}
              className={`transition-colors ${isShortlisted ? "text-amber-500 hover:text-amber-600" : "text-gray-400 hover:text-amber-400"}`}>
              {isShortlisted ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
            </button>
          )}
          {panelView === 'profile' && onAddToCompare && (
            <button onClick={onAddToCompare}
              className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition-colors ${
                inCompare ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600"}`}>
              {inCompare ? "✓ In Compare" : "+ Compare"}
            </button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ── CARD VIEW ── */}
      {panelView === 'card' && (
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Identity */}
          <div className="flex items-center gap-4">
            <PersonAvatar name={userName} avatarUrl={avatarUrl} size={64} />
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 text-lg leading-tight">{userName || '—'}</h3>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                {userRole && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PANEL_ROLE_COLORS[userRole] ?? 'bg-gray-100 text-gray-500'}`}>
                    {userRole.replace(/_/g, ' ')}
                  </span>
                )}
                {userStatus && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[userStatus] ?? 'bg-gray-100 text-gray-500'}`}>
                    {userStatus}
                  </span>
                )}
              </div>
              {userEmail && <p className="text-xs text-gray-400 mt-1">{userEmail}</p>}
            </div>
          </div>

          {canAdmin && userPlan && roleType && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-400 font-medium">Plan:</span>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${PLAN_BADGE[userPlan] ?? PLAN_BADGE.free}`}>{(planCfg.config[roleType]?.[userPlan] ?? DEFAULT_PLAN_CONFIG[roleType]?.[userPlan])?.label ?? userPlan}</span>
              <select value={userPlan}
                onChange={async e => {
                  setChangingPlan(true);
                  await planCfg.setUserPlan(consultantId, e.target.value, roleType);
                  setChangingPlan(false);
                }}
                disabled={changingPlan}
                className="ml-auto text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
                {Object.keys(planCfg.config[roleType] ?? DEFAULT_PLAN_CONFIG[roleType] ?? {}).map(pk => (
                  <option key={pk} value={pk}>{(planCfg.config[roleType]?.[pk] ?? DEFAULT_PLAN_CONFIG[roleType]?.[pk])?.label ?? pk}</option>
                ))}
              </select>
            </div>
          )}

          {/* Stats mini row */}
          {(profile?.years_experience != null || avgRating != null) && (
            <div className="flex gap-3">
              {profile?.years_experience != null && (
                <div className="flex-1 bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                  <div className="font-bold text-gray-900">{profile.years_experience}<span className="text-xs font-normal text-gray-400">y</span></div>
                  <div className="text-xs text-gray-400 mt-0.5">Experience</div>
                </div>
              )}
              {avgRating != null && (
                <div className="flex-1 bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                  <div className="font-bold text-gray-900">{avgRating} <span className="text-yellow-400 text-sm">★</span></div>
                  <div className="text-xs text-gray-400 mt-0.5">{ratings.length} rating{ratings.length !== 1 ? 's' : ''}</div>
                </div>
              )}
              {profile?.hourly_rate != null && (
                <div className="flex-1 bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                  <div className="font-bold text-gray-900 text-sm">${profile.hourly_rate}<span className="text-[10px] font-normal text-gray-400">/h</span></div>
                  <div className="text-xs text-gray-400 mt-0.5">Rate</div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            {hasProfile && (
              <button onClick={() => setPanelView('profile')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
                <User size={14} /> View Profile
              </button>
            )}
            {canAdmin && userEmail && (
              <button onClick={handleResetPassword} disabled={resetting || resetSent}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border transition-colors ${
                  resetSent
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:text-blue-600'}`}>
                {resetSent ? <><CheckCircle2 size={14} /> Reset email sent</> : resetting ? <>Sending…</> : <><Lock size={14} /> Reset Password</>}
              </button>
            )}
            {hasProfile && canAssign && openCases?.length > 0 && (
              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Send size={12} />Assign to Case
                </p>
                <select value={assignCaseId} onChange={e => setAssignCaseId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select a case…</option>
                  {openCases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
                <button disabled={!assignCaseId || assigning} onClick={handleAssign}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-semibold rounded-xl transition-colors">
                  {assigning ? "Assigning…" : assignDone ? "✓ Assigned!" : "Assign Consultant"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PROFILE VIEW ── */}
      {panelView === 'profile' && isClientRole && (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {clientProfile?.company ? (
            <>
              {/* Person avatar */}
              <div className="flex items-center gap-3">
                <PersonAvatar name={userName} avatarUrl={avatarUrl} size={56} />
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-gray-900 text-base leading-tight">{userName}</h3>
                  {userEmail && <p className="text-xs text-gray-400 truncate">{userEmail}</p>}
                </div>
              </div>

              {/* Company header */}
              <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl p-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Building2 size={18} className="text-green-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold text-gray-800 text-sm leading-tight">{clientProfile.company.company_name || clientProfile.company.name}</h4>
                  {clientProfile.company.industry && (
                    <p className="text-xs text-gray-500 mt-0.5 capitalize">{clientProfile.company.industry}</p>
                  )}
                  {clientProfile.company.created_at && (
                    <p className="text-xs text-gray-400 mt-0.5">Member since {new Date(clientProfile.company.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</p>
                  )}
                </div>
              </div>

              {/* This user's role in the company (team members only) */}
              {clientProfile.type === 'team' && clientProfile.member && (
                <div className="flex items-center gap-2 flex-wrap">
                  {clientProfile.member.role_title && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 font-medium">{clientProfile.member.role_title}</span>
                  )}
                  {clientProfile.member.system_role && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-medium capitalize">{clientProfile.member.system_role.replace(/_/g,' ')}</span>
                  )}
                  {clientProfile.member.is_primary && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">Primary contact</span>
                  )}
                </div>
              )}

              {/* Description */}
              {clientProfile.company.description && (
                <p className="text-sm text-gray-600 leading-relaxed">{clientProfile.company.description}</p>
              )}

              {/* Contact info */}
              <div className="space-y-2">
                {clientProfile.type === 'team' && clientProfile.member?.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone size={13} className="text-gray-400 flex-shrink-0" />{clientProfile.member.phone}
                  </div>
                )}
                {clientProfile.company.website && (
                  <a href={clientProfile.company.website} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                    <ExternalLink size={13} />{clientProfile.company.website}
                  </a>
                )}
              </div>

              {/* Case stats */}
              {clientCaseStats && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Cases</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Total',  value: clientCaseStats.total,  color: 'bg-gray-50 border-gray-200 text-gray-700' },
                      { label: 'Open',   value: clientCaseStats.open,   color: 'bg-blue-50 border-blue-100 text-blue-700' },
                      { label: 'Closed', value: clientCaseStats.closed, color: 'bg-green-50 border-green-100 text-green-700' },
                    ].map(s => (
                      <div key={s.label} className={`border rounded-xl p-3 text-center ${s.color}`}>
                        <p className="text-xl font-bold leading-none">{s.value}</p>
                        <p className="text-xs mt-1 opacity-70">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Team members */}
              {clientTeamMembers.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Team ({clientTeamMembers.length})</p>
                  <div className="space-y-2">
                    {clientTeamMembers.map((m, i) => (
                      <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                        <PersonAvatar name={m.full_name || m.email} size={32} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 truncate">{m.full_name || m.email}</p>
                          <p className="text-xs text-gray-400 truncate">{m.role_title || (m.system_role ? m.system_role.replace(/_/g,' ') : m.email)}</p>
                        </div>
                        {m.is_primary && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium flex-shrink-0">Primary</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Admin: open full profile button */}
              {canAdmin && (() => {
                const companyId = clientProfile.type === 'client' ? consultantId : clientProfile.member?.client_id;
                if (!companyId || !onOpenClientProfile) return null;
                return (
                  <div className="border-t border-gray-100 pt-4">
                    <button
                      onClick={() => { onClose?.(); onOpenClientProfile(companyId); }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
                      <ExternalLink size={14} /> Open Full Company Profile
                    </button>
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="text-center py-10">
              <Building2 size={32} className="text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No company profile found</p>
            </div>
          )}
        </div>
      )}

      {panelView === 'profile' && isHeadhunterRole && (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="flex items-center gap-3">
            <PersonAvatar name={userName} avatarUrl={avatarUrl} size={56} />
            <div className="min-w-0">
              <h3 className="font-bold text-gray-900 text-base leading-tight">{userName}</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">Headhunter</span>
            </div>
          </div>
          {profile?.headline && (
            <p className="text-sm text-gray-600 italic leading-relaxed">"{profile.headline}"</p>
          )}
          {profile?.bio && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">About</p>
              <p className="text-sm text-gray-600 leading-relaxed">{profile.bio}</p>
            </div>
          )}
          {userEmail && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Mail size={13} className="text-gray-400 flex-shrink-0" />{userEmail}
            </div>
          )}
          {profile?.linkedin_url && (
            <a href={profile.linkedin_url} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
              <ExternalLink size={13} />LinkedIn Profile
            </a>
          )}
          {!profile?.headline && !profile?.bio && !profile?.linkedin_url && (
            <div className="text-center py-8">
              <Crosshair size={32} className="text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No profile details on record</p>
            </div>
          )}
        </div>
      )}

      {panelView === 'profile' && isConsultantRole && (
        <div className="flex-1 overflow-y-auto p-3">
          {/* Progress bar */}
          {(() => {
            const done = panelTabs.filter(t => panelTabStatus[t.id] === "complete").length;
            if (done === 0) return null;
            return (
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <div style={{ flex:1, height:4, borderRadius:99, background:'#E2E8F0', overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${(done/panelTabs.length)*100}%`, background:'linear-gradient(90deg,#1A4B8C,#3B82F6)', borderRadius:99, transition:'width .4s' }}/>
                </div>
                <span style={{ fontSize:11, fontWeight:700, color:'#1A4B8C', whiteSpace:'nowrap' }}>{done}/{panelTabs.length} done</span>
              </div>
            );
          })()}

          {/* Section Carousel */}
          {(() => {
            const carouselIdx = Math.max(0, panelTabs.findIndex(t => t.id === panelTab));
            function scrollTo(idx) {
              setPanelTab(panelTabs[Math.max(0, Math.min(idx, panelTabs.length - 1))]?.id ?? panelTab);
            }
            function onScroll() {
              if (panelCarouselScrolling.current) return;
              const el = panelCarouselRef.current;
              if (!el) return;
              const center = el.scrollLeft + el.offsetWidth / 2;
              let closest = 0, minDist = Infinity;
              Array.from(el.children).forEach((child, i) => {
                const dist = Math.abs((child.offsetLeft + child.offsetWidth / 2) - center);
                if (dist < minDist) { minDist = dist; closest = i; }
              });
              const t2 = panelTabs[closest];
              if (t2 && t2.id !== panelTab) setPanelTab(t2.id);
            }
            return (
              <div style={{ position:'relative' }}>
                {carouselIdx > 0 && (
                  <button onClick={() => scrollTo(carouselIdx - 1)}
                    style={{ position:'absolute', left:4, top:'50%', transform:'translateY(-50%)', zIndex:10, width:28, height:28, borderRadius:'50%', border:'1.5px solid #CBD5E1', background:'white', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.08)', marginTop:-16 }}>
                    <ChevronLeft size={14} style={{color:'#64748B'}}/>
                  </button>
                )}
                {carouselIdx < panelTabs.length - 1 && (
                  <button onClick={() => scrollTo(carouselIdx + 1)}
                    style={{ position:'absolute', right:4, top:'50%', transform:'translateY(-50%)', zIndex:10, width:28, height:28, borderRadius:'50%', border:'1.5px solid #CBD5E1', background:'white', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.08)', marginTop:-16 }}>
                    <ChevronRight size={14} style={{color:'#64748B'}}/>
                  </button>
                )}
                <div ref={panelCarouselRef} onScroll={onScroll}
                  style={{ display:'flex', overflowX:'scroll', scrollSnapType:'x mandatory', scrollbarWidth:'none', WebkitOverflowScrolling:'touch', gap:8, padding:'0 44px' }}>
                  {panelTabs.map((tab, i) => {
                    const isActive = tab.id === panelTab;
                    const Icon = tab.icon;
                    const st = panelTabStatus[tab.id];
                    return (
                      <div key={tab.id}
                        style={{ flex:'0 0 calc(100% - 88px)', width:'calc(100% - 88px)', maxWidth:'calc(100% - 88px)', minWidth:0, overflow:'hidden', scrollSnapAlign:'center', scrollSnapStop:'always', opacity:isActive?1:0.5, transform:isActive?'scale(1)':'scale(0.97)', transition:'opacity .25s, transform .25s' }}>
                        <div style={{ borderRadius:12, border:`1px solid ${isActive?'#CBD5E1':'#E2E8F0'}`, background:'white', overflow:'hidden', width:'100%', boxSizing:'border-box', minHeight:540, display:'flex', flexDirection:'column', boxShadow:isActive?'0 4px 20px rgba(0,0,0,.08)':'none', transition:'box-shadow .25s' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderBottom:'1px solid #F1F5F9', background:isActive?'#F8FAFC':'#FAFAFA', flexShrink:0, cursor:isActive?'default':'pointer' }}
                            onClick={() => !isActive && scrollTo(i)}>
                            {st === "complete"
                              ? <div style={{width:16,height:16,borderRadius:'50%',background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Check size={9} color="white" strokeWidth={3}/></div>
                              : st === "in_progress"
                                ? <div style={{width:8,height:8,borderRadius:'50%',background:'#3B82F6',flexShrink:0,marginRight:2}}/>
                                : <div style={{width:8,height:8,borderRadius:'50%',background:'#CBD5E1',flexShrink:0,marginRight:2}}/>}
                            <Icon size={13} style={{color:isActive?'#1A4B8C':'#94A3B8',flexShrink:0}}/>
                            <span style={{flex:1,fontSize:12,fontWeight:700,color:isActive?'#0F172A':'#94A3B8',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tab.label}</span>
                            {tab.count !== null && <span style={{fontSize:10,fontWeight:600,padding:'1px 6px',borderRadius:99,background:isActive?'#DBEAFE':'#F1F5F9',color:isActive?'#2563EB':'#94A3B8',flexShrink:0}}>{tab.count}</span>}
                            {isActive && (
                              <button onClick={e => { e.stopPropagation(); setPanelManualComplete(tab.id, st !== "complete"); }}
                                title={st === "complete" ? "Mark incomplete" : "Mark complete"}
                                style={{ flexShrink:0,display:'flex',alignItems:'center',gap:3,fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:99,border:`1px solid ${st==="complete"?'#BBF7D0':'#E2E8F0'}`,background:st==="complete"?'#F0FDF4':'#F8FAFC',color:st==="complete"?'#16A34A':'#94A3B8',cursor:'pointer',transition:'all .15s',whiteSpace:'nowrap' }}>
                                <Check size={9} strokeWidth={3}/>
                                {st === "complete" ? "Done" : "Mark done"}
                              </button>
                            )}
                          </div>
                          {panelMountedSlides.has(tab.id) ? (
                            <div style={{ flex:1, overflowY:'auto', padding:'16px' }} className="space-y-4">

              {/* Profile tab */}
              {tab.id === 'profile' && (loading ? <Spinner /> : (
                <>
                  {/* Avatar + identity */}
                  <div className="flex items-center gap-4">
                    <PersonAvatar name={userName} avatarUrl={avatarUrl} size={64} />
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-900 text-lg leading-tight">{userName}</h3>
                      {profile?.headline && <p className="text-sm text-gray-500 mt-0.5">{profile.headline}</p>}
                      {avgRating != null && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-yellow-400 text-xs">{stars(avgRating)}</span>
                          <span className="text-sm font-semibold text-gray-700">{avgRating}</span>
                          <span className="text-xs text-gray-400">({ratings.length} rating{ratings.length !== 1 ? 's' : ''})</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-3 gap-2">
                    {profile?.years_experience != null && (
                      <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                        <div className="font-bold text-gray-900 text-lg">{profile.years_experience}<span className="text-xs font-normal text-gray-400">y</span></div>
                        <div className="text-xs text-gray-400 mt-0.5">Experience</div>
                      </div>
                    )}
                    {profile?.hourly_rate != null && (
                      <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                        <div className="font-bold text-gray-900 text-base">${profile.hourly_rate}<span className="text-[10px] font-normal text-gray-400">/h</span></div>
                        <div className="text-xs text-gray-400 mt-0.5">Rate</div>
                      </div>
                    )}
                    {availability?.available_percentage != null && (
                      <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                        <div className={`font-bold text-lg ${availability.available_percentage >= 50 ? "text-green-600" : "text-orange-500"}`}>
                          {availability.available_percentage}<span className="text-xs font-normal text-gray-400">%</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">Available</div>
                      </div>
                    )}
                  </div>

                  {/* Badges row */}
                  <div className="flex flex-wrap gap-2">
                    {profile?.expertise_level && (
                      <span className="px-2.5 py-1 bg-violet-50 text-violet-700 rounded-lg text-xs font-semibold capitalize">{profile.expertise_level}</span>
                    )}
                    {profile?.availability_type && (
                      <span className="px-2.5 py-1 bg-sky-50 text-sky-700 rounded-lg text-xs font-semibold capitalize">{profile.availability_type.replace(/_/g, ' ')}</span>
                    )}
                    {profile?.travel_available && (
                      <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-semibold">Travel OK</span>
                    )}
                  </div>

                  {/* Top Skills — featured first, else first 5 */}
                  {(() => {
                    const featured = profile?.featured_skills ?? [];
                    const topSkills = featured.length > 0
                      ? featured.slice(0, 6)
                      : (profile?.skills ?? []).slice(0, 5);
                    return topSkills.length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                          Top Skills {featured.length > 0 && <span className="normal-case text-gray-300 font-normal">· featured</span>}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {topSkills.map(s => (
                            <span key={s} className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">
                              {featured.includes(s) && <Star size={9} className="text-amber-400 fill-amber-400" />}
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}

                  {/* Top Experience — top 3 clients + top 3 projects */}
                  {(profile?.consultant_customers?.length > 0 || profile?.consultant_projects?.length > 0) && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Top Experience</p>
                      {profile?.consultant_customers?.slice(0, 3).map((cu, i) => (
                        <div key={i} className="flex items-center gap-2.5">
                          <UserAvatar name={cu.company_name ?? '?'} size={30} />
                          <div className="min-w-0">
                            <div className="font-medium text-sm text-gray-900 truncate">{cu.company_name}</div>
                            <div className="text-xs text-gray-400">{cu.role}{cu.start_year ? ` · ${cu.start_year}` : ''}</div>
                          </div>
                        </div>
                      ))}
                      {profile?.consultant_projects?.slice(0, 3).map((p, i) => (
                        <div key={i} className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <Briefcase size={12} className="text-blue-600" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm text-gray-900 truncate">{p.project_name ?? p.name ?? "SAP Project"}</div>
                            {p.module && <div className="text-xs text-gray-400">{p.module}{p.year ? ` · ${p.year}` : ''}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* LinkedIn */}
                  {profile?.linkedin_url && (
                    <a href={profile.linkedin_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                      <ExternalLink size={14} />View LinkedIn Profile
                    </a>
                  )}
                </>
              ))}

              {/* Ratings tab */}
              {tab.id === 'ratings' && (
                ratings.length === 0 ? (
                  <div className="text-center py-10">
                    <Star size={32} className="text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No ratings yet</p>
                  </div>
                ) : (
                  <>
                    {/* Summary */}
                    <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-100 rounded-xl p-4">
                      <div className="text-3xl font-bold text-gray-900">{avgRating}</div>
                      <div>
                        <div className="text-yellow-400 text-lg">{stars(avgRating)}</div>
                        <p className="text-xs text-gray-500 mt-0.5">{ratings.length} rating{ratings.length !== 1 ? 's' : ''}</p>
                      </div>
                      {winRate != null && (
                        <div className="ml-auto text-right">
                          <div className="text-lg font-bold text-green-600">{winRate}%</div>
                          <p className="text-xs text-gray-400">win rate</p>
                        </div>
                      )}
                    </div>
                    {/* Individual ratings */}
                    <div className="space-y-3">
                      {ratings.map((r, i) => (
                        <div key={i} className="border border-gray-100 rounded-xl p-3 bg-white">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-yellow-400 text-sm">{stars(r.score)}</span>
                              <span className="text-sm font-bold text-gray-800">{r.score}/5</span>
                            </div>
                            <span className="text-xs text-gray-400">{fmtDate(r.created_at)}</span>
                          </div>
                          {r.case?.title && <p className="text-xs text-blue-600 font-medium mb-1">{r.case.title}</p>}
                          {r.comment && <p className="text-sm text-gray-600 italic">"{r.comment}"</p>}
                        </div>
                      ))}
                    </div>
                  </>
                )
              )}

                            </div>
                          ) : (
                            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
                              <Spinner />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Footer pill bar */}
                <div style={{ marginTop:8, background:'white', borderRadius:12, border:'1px solid #E2E8F0', padding:'8px 12px', display:'flex', gap:6, overflowX:'auto', scrollbarWidth:'none' }}>
                  {panelTabs.map((tab, i) => {
                    const Icon = tab.icon;
                    const isActive = tab.id === panelTab;
                    const st = panelTabStatus[tab.id];
                    return (
                      <button key={tab.id} onClick={() => scrollTo(i)}
                        style={{ flexShrink:0, display:'flex', alignItems:'center', gap:4, padding:'5px 10px', borderRadius:99, border:`1.5px solid ${isActive?'#1A4B8C':st==="complete"?'#BBF7D0':'#E2E8F0'}`, background:isActive?'#1A4B8C':st==="complete"?'#F0FDF4':'white', color:isActive?'white':st==="complete"?'#16A34A':'#64748B', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', transition:'all .15s' }}>
                        {st === "complete" && !isActive
                          ? <div style={{width:13,height:13,borderRadius:'50%',background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Check size={8} color="white" strokeWidth={3}/></div>
                          : <Icon size={11}/>}
                        <span>{tab.label}</span>
                        {tab.count !== null && <span style={{fontSize:10,padding:'1px 5px',borderRadius:99,background:isActive?'rgba(255,255,255,.2)':st==="complete"?'#DCFCE7':'#F1F5F9',color:isActive?'rgba(255,255,255,.7)':st==="complete"?'#16A34A':'#94A3B8'}}>{tab.count}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ARENA (COMPETITIVE BIDDING)
// ============================================================
let _arenaCaseIdx = 0; // persists carousel position across ArenaView remounts
function ArenaView({ auth }) {
  const { t } = useT();
  const visCfg = useVisibilitySettings();
  const [arenaTab, setArenaTab]             = useState("cases");
  const arenaCarouselRef = useRef(null);
  const arenaCarouselScrolling = useRef(false);
  const caseCarouselRef = useRef(null);
  const caseCarouselScrolling = useRef(false);
  const [arenaMountedSlides, setArenaMountedSlides] = useState(() => new Set(["cases"]));
  const [arenaManualCompletions, setArenaManualCompletionsRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`tc_arenamc_arena`) ?? "{}"); } catch { return {}; }
  });
  function setArenaManualComplete(tabId, done) {
    setArenaManualCompletionsRaw(prev => {
      const next = { ...prev, [tabId]: done };
      try { localStorage.setItem(`tc_arenamc_arena`, JSON.stringify(next)); } catch {}
      return next;
    });
  }
  const [applyingToCase, setApplying]       = useState(null);
  const [arenaSelectedCase, setArenaSelected] = useState(null);
  const [profileView, setProfileView]       = useState(null);  // consultant id for drawer
  const [compareSet, setCompareSet]         = useState([]);    // ids selected for compare
  const { leaderboard, loading: lbLoading } = useLeaderboard();
  const { cases, loading: casesLoading, updateCase } = useCases();
  const { shortlist, toggle: toggleShortlist, isShortlisted } = useConsultantShortlist();
  const { applications, reviewApplication, refetch: refetchApps } = useApplications();
  const { templates: arenaLcTemplates } = useLifecycleTemplates();
  const [caseSort, setCaseSort] = useState('match');
  const [caseCarouselIdx, setCaseCarouselIdx] = useState(_arenaCaseIdx);

  function toggleCompare(id) {
    setCompareSet(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function handleArenaReviewApplication(appId, appStatus, notes) {
    await reviewApplication(appId, appStatus, notes);
    if (appStatus === "accepted" && arenaSelectedCase) {
      const c = arenaSelectedCase;
      if (c.status === "assigned") return;
      const stages = getLifecycleStages(c.case_lifecycle, arenaLcTemplates);
      const curStage = stages.find(s => s.key === c.status);
      const isTerminal = curStage?.is_terminal ?? ["completed","cancelled"].includes(c.status);
      if (isTerminal) return;
      const allowedNextKeys = curStage?.allowed_next?.length
        ? curStage.allowed_next
        : stages.map(s => s.key).filter(k => k !== c.status);
      const autoStage = stages.find(s =>
        allowedNextKeys.includes(s.key) &&
        (s.trigger === "auto" || s.trigger === "both")
      );
      await updateCase(c.id, { status: autoStage?.key ?? "assigned" });
    }
  }

  const openCases       = cases.filter(c => {
    if (c.status !== "estimated" || (c.case_assignments && c.case_assignments.length > 0)) return false;
    const vis = visCfg.getCaseVisibility(c.id, c.client_id);
    if (vis === 'private') return false;
    if (vis === 'invite-only') {
      // Only show to invited consultants
      if (auth.isConsultant || auth.isHeadhunter) {
        const invites = visCfg.getCaseInvitations(c.id);
        return invites.some(i => i.consultantId === auth.user?.id);
      }
      return auth.isAdmin || auth.isManager;
    }
    return true;
  });
  const myApplications  = applications.filter(a => a.consultant_id === auth.user?.id);
  const appliedCaseIds  = new Set(myApplications.map(a => a.case_id));
  const canViewRanking  = auth.isAdmin || auth.isManager || auth.isClient;

  const renderCases = () => {
    if (casesLoading) return <Spinner />;

    const cpObj = Array.isArray(auth.profile?.consultant_profiles)
      ? auth.profile.consultant_profiles[0]
      : auth.profile?.consultant_profiles;
    const mySkills = new Set((cpObj?.skills ?? []).map(s => String(s).toLowerCase()));

    function matchScore(cs) {
      if (!auth.isConsultant) return null;
      const req = cs.skills_required ?? [];
      if (req.length === 0) return 50;
      const hits = req.filter(s => mySkills.has(String(s).toLowerCase())).length;
      return Math.round(Math.max(5, Math.min(100, (hits / req.length) * 70 + 30)));
    }

    const orbColors = ['#10B981','#3B82F6','#8B5CF6','#EC4899','#F59E0B','#0EA5E9','#F97316'];

    if (openCases.length === 0) return (
      <div className="bg-blue-50 rounded-2xl p-12 text-center text-blue-400 text-sm border border-blue-100">
        {t("arena.no_cases")}
      </div>
    );

    const sorted = [...openCases].sort((a, b) => {
      if (caseSort === 'match')    return (matchScore(b) ?? 0) - (matchScore(a) ?? 0);
      if (caseSort === 'deadline') {
        const da = a.due_date ? new Date(a.due_date) : new Date(9e15);
        const db = b.due_date ? new Date(b.due_date) : new Date(9e15);
        return da - db;
      }
      if (caseSort === 'budget')   return (Number(b.budget) || 0) - (Number(a.budget) || 0);
      return 0;
    });

    const safeIdx = Math.max(0, Math.min(caseCarouselIdx, sorted.length - 1));

    function scrollToCase(idx) {
      const el = caseCarouselRef.current;
      if (!el) { setCaseCarouselIdx(idx); return; }
      caseCarouselScrolling.current = true;
      const slide = el.children[Math.max(0, Math.min(idx, sorted.length - 1))];
      if (slide) {
        const targetLeft = slide.offsetLeft - (el.offsetWidth - slide.offsetWidth) / 2;
        el.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
      }
      setCaseCarouselIdx(idx);
      setTimeout(() => { caseCarouselScrolling.current = false; }, 600);
    }

    function renderCard(c) {
      const companyName = c.client?.client_profiles?.company_name || c.client?.full_name;
      const alreadyApplied = appliedCaseIds.has(c.id);
      const appCount = c.applications?.length ?? 0;
      const appsSorted = [...(c.applications ?? [])].sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));
      const score = matchScore(c);
      const now = Date.now();
      const dueMs = c.due_date ? new Date(c.due_date).getTime() : null;
      const startMs = c.start_date ? new Date(c.start_date).getTime() : null;
      const daysLeft = dueMs ? Math.max(0, Math.ceil((dueMs - now) / 86400000)) : null;
      const totalDays = (dueMs && startMs) ? Math.max(1, Math.ceil((dueMs - startMs) / 86400000)) : 14;
      const timePct = daysLeft != null ? Math.max(0, Math.min(1, daysLeft / totalDays)) : null;
      const mc = score == null ? '#2563EB' : score >= 75 ? '#10B981' : score >= 50 ? '#F59E0B' : '#EF4444';
      const mcDim = score == null ? 'rgba(37,99,235,0.25)' : score >= 75 ? 'rgba(16,185,129,0.25)' : score >= 50 ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)';
      const tc = timePct == null ? '#3B82F6' : timePct <= 0.15 ? '#EF4444' : timePct <= 0.4 ? '#F59E0B' : '#10B981';
      const svgR = 43, svgCx = 48, svgCy = 48;
      const circ = 2 * Math.PI * svgR;
      const filled = score != null ? circ * (score / 100) : 0;
      const dayChipColor = timePct == null ? '#3B82F6' : timePct <= 0.15 ? '#DC2626' : timePct <= 0.4 ? '#D97706' : '#3B82F6';
      const dayChipBorder = timePct == null ? 'rgba(59,130,246,0.3)' : timePct <= 0.15 ? 'rgba(220,38,38,0.35)' : timePct <= 0.4 ? 'rgba(217,119,6,0.35)' : 'rgba(59,130,246,0.3)';
      const dayChipBg = timePct == null ? 'rgba(59,130,246,0.07)' : timePct <= 0.15 ? 'rgba(220,38,38,0.07)' : timePct <= 0.4 ? 'rgba(217,119,6,0.07)' : 'rgba(59,130,246,0.07)';
      const chip = (color, border, bg, label) => (
        <span style={{ fontSize:10, fontWeight:600, letterSpacing:'0.07em', textTransform:'uppercase', padding:'3px 9px', borderRadius:99, border:`1px solid ${border}`, color, background:bg }}>{label}</span>
      );

      // Leaderboard (solar) data for this card
      const lbSys = 150;
      const lbInnerR = lbSys * 0.24, lbOuterR = lbSys * 0.36, lbTimeR = lbSys * 0.46;
      const lbCirc = 2 * Math.PI * lbTimeR;
      const lbFilled = timePct != null ? lbCirc * timePct : 0;
      const otherCount = Math.max(0, appCount - (alreadyApplied ? 1 : 0));
      const innerSlots = Math.min(2, otherCount);
      const outerSlots = Math.min(5, Math.max(0, otherCount - innerSlots));

      function OrbiterNode({ label, color, r, slotIdx, total, dur, isYou }) {
        const startDeg = (slotIdx / Math.max(total, 1)) * 360 + (r === lbInnerR ? 0 : 40);
        return (
          <div style={{ position:'absolute', top:'50%', left:'50%', width:0, height:0,
            animation:`arena-solar-orbit ${dur}s linear infinite`,
            '--start':`${startDeg}deg`, '--r':`${r}px` }}>
            <div style={{ position:'absolute', width:26, height:26, margin:-13, borderRadius:'50%', background:color,
              border: isYou ? '2px solid #2563EB' : '2px solid rgba(255,255,255,0.5)',
              boxShadow: isYou ? '0 0 7px rgba(37,99,235,0.35)' : '0 1px 3px rgba(0,0,0,0.15)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontFamily:"'Barlow Condensed',sans-serif", fontSize:8, fontWeight:700, color:'#fff' }}>
              {label}
            </div>
          </div>
        );
      }

      return (
        <div style={{ background:'#EEF5FF', borderRadius:22, border:'1px solid #BFDBFE', overflow:'hidden', position:'relative', boxShadow:'0 4px 20px rgba(37,99,235,0.08)', height:'100%', display:'flex', flexDirection:'column' }}>
          <div style={{ position:'absolute', left:0, top:'20%', bottom:'20%', width:3, borderRadius:'0 3px 3px 0', background:mc, boxShadow:`0 0 10px ${mcDim}` }} />
          <div style={{ height:4, background:'rgba(26,75,140,0.07)', position:'relative', overflow:'hidden' }}>
            {timePct != null && <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${timePct*100}%`, background:tc, opacity:0.8 }} />}
          </div>
          <div style={{ padding:'18px 22px 16px', display:'flex', flexDirection:'column', gap:12, flex:1 }}>
            {/* Ring + score */}
            <div style={{ display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ position:'relative', width:84, height:84, flexShrink:0 }}>
                <svg viewBox="0 0 96 96" fill="none" style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}>
                  <circle cx={svgCx} cy={svgCy} r={svgR} stroke="rgba(26,75,140,0.12)" strokeWidth="6"/>
                  {score != null && (
                    <circle cx={svgCx} cy={svgCy} r={svgR} stroke={mc} strokeWidth="6"
                      strokeDasharray={`${circ.toFixed(1)}`} strokeDashoffset={`${(circ-filled).toFixed(1)}`}
                      strokeLinecap="round" transform={`rotate(-90 ${svgCx} ${svgCy})`}
                      style={{ filter:`drop-shadow(0 0 5px ${mcDim})` }} />
                  )}
                </svg>
                <div style={{ position:'absolute', inset:12, borderRadius:'50%', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff' }}>
                  <ProjectAvatar project={c.project ?? { name: companyName || c.title, client: c.client }} size={60} />
                </div>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                {score != null ? (
                  <>
                    <div style={{ fontFamily:"'Barlow Condensed', sans-serif", fontSize:46, fontWeight:800, lineHeight:1, color:mc, letterSpacing:'-0.01em' }}>
                      {score}<span style={{ fontSize:22, opacity:0.5 }}>%</span>
                    </div>
                    <div style={{ fontSize:10, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase', color:'#6B8AB8', marginTop:2 }}>Match score</div>
                    {(c.skills_required?.length ?? 0) > 0 && (
                      <div style={{ fontSize:11, color:'#4A6B9A', marginTop:3, lineHeight:1.4 }}>
                        {c.skills_required.filter(s => mySkills.has(String(s).toLowerCase())).length} of {c.skills_required.length} skills matched
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize:14, color:'#1A4B8C', fontWeight:600 }}>{companyName || c.title}</div>
                )}
              </div>
            </div>
            {/* Title */}
            <div>
              <div style={{ fontFamily:"'Barlow Condensed', sans-serif", fontSize:22, fontWeight:700, letterSpacing:'0.02em', color:'#0F172A', lineHeight:1.2 }}>{c.title}</div>
              {c.description && <div style={{ fontSize:12, color:'#4A6B9A', lineHeight:1.5, marginTop:4 }}>{c.description}</div>}
            </div>
            {/* Chips */}
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
              {c.area_sap      && chip('#0066CC','rgba(0,102,204,0.3)','rgba(0,102,204,0.07)', c.area_sap)}
              {c.area_industry && chip('#0369A1','rgba(3,105,161,0.3)','rgba(3,105,161,0.07)', c.area_industry)}
              {c.budget        && chip('#059669','rgba(5,150,105,0.3)','rgba(5,150,105,0.07)', `$${Number(c.budget).toLocaleString()}`)}
              {daysLeft != null && chip(dayChipColor, dayChipBorder, dayChipBg, daysLeft === 1 ? '1 day left' : `${daysLeft} days left`)}
              {companyName     && chip('#1A4B8C','rgba(26,75,140,0.25)','rgba(26,75,140,0.06)', companyName)}
            </div>
            <div style={{ height:1, background:'rgba(26,75,140,0.1)' }} />

            {/* Solar leaderboard inside the card */}
            <div style={{ display:'flex', gap:12, alignItems:'flex-start', flexWrap:'wrap', background:'rgba(26,75,140,0.04)', borderRadius:14, padding:'10px 12px', border:'1px solid rgba(26,75,140,0.09)' }}>
              {/* Solar system */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <div style={{ position:'relative', width:lbSys, height:lbSys }}>
                  {[lbInnerR, lbOuterR].map(r => (
                    <div key={r} style={{ position:'absolute', borderRadius:'50%', border:'1px solid rgba(26,75,140,0.1)', top:'50%', left:'50%', width:r*2, height:r*2, transform:'translate(-50%,-50%)' }} />
                  ))}
                  <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', overflow:'visible' }} viewBox={`0 0 ${lbSys} ${lbSys}`}>
                    <circle cx={lbSys/2} cy={lbSys/2} r={lbTimeR} fill="none" stroke="rgba(26,75,140,0.07)" strokeWidth="3.5"/>
                    {timePct != null && (
                      <circle cx={lbSys/2} cy={lbSys/2} r={lbTimeR} fill="none" stroke={tc} strokeWidth="3.5"
                        strokeDasharray={`${lbFilled.toFixed(1)} ${(lbCirc-lbFilled).toFixed(1)}`}
                        strokeLinecap="round" transform={`rotate(-90 ${lbSys/2} ${lbSys/2})`}
                        style={{ filter:`drop-shadow(0 0 4px ${tc}88)` }}/>
                    )}
                  </svg>
                  <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:46, height:46, borderRadius:'50%', background:'#fff', border:'2px solid rgba(37,99,235,0.22)', boxShadow:'0 2px 8px rgba(37,99,235,0.12)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', zIndex:10 }}>
                    <ProjectAvatar project={c.project ?? { name: companyName || c.title, client: c.client }} size={34} />
                  </div>
                  {[...Array(innerSlots)].map((_, i) => <OrbiterNode key={`in${i}`} label={`#${i+1}`} color={orbColors[i%orbColors.length]} r={lbInnerR} slotIdx={i} total={innerSlots+(alreadyApplied?1:0)} dur={10} isYou={false} />)}
                  {alreadyApplied && <OrbiterNode label="You" color="#3B82F6" r={lbInnerR} slotIdx={innerSlots} total={innerSlots+1} dur={10} isYou={true} />}
                  {[...Array(outerSlots)].map((_, i) => <OrbiterNode key={`out${i}`} label={`#${innerSlots+i+1}`} color={orbColors[(innerSlots+i)%orbColors.length]} r={lbOuterR} slotIdx={i} total={Math.max(outerSlots,1)} dur={17} isYou={false} />)}
                  {daysLeft != null && (
                    <div style={{ position:'absolute', bottom:0, left:'50%', transform:'translateX(-50%)', fontSize:7, fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase', color:tc, whiteSpace:'nowrap' }}>
                      {daysLeft === 1 ? '1 day' : `${daysLeft} days`} left
                    </div>
                  )}
                </div>
              </div>
              {/* Ranked list */}
              <div style={{ flex:1, minWidth:140 }}>
                {auth.isConsultant && score != null && (
                  <div style={{ marginBottom:6 }}>
                    <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:30, fontWeight:800, lineHeight:1, color:mc }}>{score}%</span>
                    <span style={{ fontSize:8, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#6B8AB8', marginLeft:5 }}>match</span>
                  </div>
                )}
                <p style={{ fontSize:9, fontWeight:700, color:'#4A6B9A', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:5 }}>{appCount} applied</p>
                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                  {appsSorted.slice(0, 4).map((app, i) => {
                    const name = app.consultant?.full_name ?? 'Consultant';
                    const initials = name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
                    const avatarUrl = app.consultant?.avatar_url;
                    return (
                      <div key={app.consultant_id} style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(26,75,140,0.05)', borderRadius:7, padding:'4px 8px', border:'1px solid rgba(26,75,140,0.1)' }}>
                        <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:12, fontWeight:700, width:12, textAlign:'center', color: i===0?'#D97706':i===1?'#6B8AB8':i===2?'#B45309':'#93AECF' }}>{i+1}</span>
                        <div style={{ width:18, height:18, borderRadius:'50%', background: avatarUrl ? 'transparent' : orbColors[i%orbColors.length], display:'flex', alignItems:'center', justifyContent:'center', fontSize:6, fontWeight:700, color:'#fff', overflow:'hidden', flexShrink:0 }}>
                          {avatarUrl ? <img src={avatarUrl} alt={name} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : initials}
                        </div>
                        <span style={{ flex:1, fontSize:10, color:'#334155', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>
                      </div>
                    );
                  })}
                  {!alreadyApplied && auth.isConsultant && (
                    <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(59,130,246,0.06)', borderRadius:7, padding:'4px 8px', border:'1px dashed rgba(59,130,246,0.3)' }}>
                      <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:12, fontWeight:700, width:12, textAlign:'center', color:'#2563EB' }}>?</span>
                      <div style={{ width:18, height:18, borderRadius:'50%', background:'rgba(59,130,246,0.1)', border:'1.5px dashed #3B82F6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:6, fontWeight:700, color:'#3B82F6' }}>Me</div>
                      <span style={{ flex:1, fontSize:10, color:'#2563EB' }}>Your spot</span>
                      {score != null && <span style={{ fontSize:9, fontWeight:700, color:mc }}>{score}%</span>}
                    </div>
                  )}
                  {alreadyApplied && auth.isConsultant && (
                    <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(59,130,246,0.08)', borderRadius:7, padding:'4px 8px', border:'1px solid rgba(59,130,246,0.3)' }}>
                      <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:12, fontWeight:700, width:12, textAlign:'center', color:'#2563EB' }}>✓</span>
                      <div style={{ width:18, height:18, borderRadius:'50%', background:'#3B82F6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:6, fontWeight:700, color:'#fff' }}>Me</div>
                      <span style={{ flex:1, fontSize:10, color:'#1D4ED8', fontWeight:600 }}>Applied{score != null ? ` · ${score}%` : ''}</span>
                    </div>
                  )}
                </div>
                {canViewRanking && (
                  <button onClick={() => setArenaSelected(c)}
                    style={{ marginTop:6, background:'transparent', border:'1px solid rgba(26,75,140,0.22)', borderRadius:8, color:'#1A4B8C', fontSize:10, fontWeight:600, padding:'4px 10px', cursor:'pointer', whiteSpace:'nowrap' }}>
                    View ranking ›
                  </button>
                )}
              </div>
            </div>

            {/* Apply CTA */}
            {auth.isConsultant && (
              alreadyApplied ? (
                <button disabled style={{ width:'100%', background:'rgba(5,150,105,0.1)', border:'1px solid rgba(5,150,105,0.3)', borderRadius:12, color:'#059669', fontSize:14, fontWeight:600, padding:'11px', cursor:'default', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  <Check size={13} />{t('arena.applied')}
                </button>
              ) : (
                <button onClick={() => setApplying(c)}
                  style={{ width:'100%', background:'linear-gradient(135deg,#1A4B8C,#2563EB)', border:'none', borderRadius:12, color:'#fff', fontSize:14, fontWeight:600, padding:'11px', cursor:'pointer', boxShadow:'0 4px 16px rgba(37,99,235,0.3)' }}>
                  {t('arena.apply')}
                </button>
              )
            )}
          </div>
        </div>
      );
    }

    return (
      <div>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&display=swap');
          @keyframes arena-solar-orbit {
            from { transform: rotate(var(--start)) translateX(var(--r)) rotate(calc(-1 * var(--start))); }
            to   { transform: rotate(calc(var(--start) + 360deg)) translateX(var(--r)) rotate(calc(-1 * (var(--start) + 360deg))); }
          }
        `}</style>

        {/* Sort bar */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:8 }}>
          <span style={{ fontSize:12, color:'#6B8AB8', fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase' }}>
            {sorted.length === 1 ? t('arena.open_count_one') : t('arena.open_count_many').replace('{n}', sorted.length)}
          </span>
          <div style={{ display:'flex', gap:5, alignItems:'center' }}>
            <span style={{ fontSize:11, color:'#6B8AB8', textTransform:'uppercase', letterSpacing:'0.1em', marginRight:2 }}>Sort</span>
            {['match','deadline','budget'].map(key => (
              <button key={key} onClick={() => { setCaseSort(key); scrollToCase(0); }}
                style={{ background: caseSort===key ? '#1A4B8C' : 'rgba(26,75,140,0.07)', border:`1px solid ${caseSort===key ? '#2563EB' : 'rgba(26,75,140,0.2)'}`, borderRadius:99, color: caseSort===key ? '#fff' : '#1A4B8C', fontSize:11, fontWeight:600, letterSpacing:'0.06em', padding:'4px 12px', cursor:'pointer', textTransform:'uppercase', transition:'all .15s' }}>
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Case cards – peek scroll-snap carousel, same style as outer */}
        <div style={{ position:'relative' }}>
          {safeIdx > 0 && (
            <button onClick={() => scrollToCase(safeIdx - 1)}
              style={{ position:'absolute', left:4, top:'50%', transform:'translateY(-50%)', zIndex:10, width:28, height:28, borderRadius:'50%', background:'rgba(26,75,140,0.08)', border:'1px solid rgba(26,75,140,0.18)', color:'#1A4B8C', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.08)', transition:'all .15s' }}>
              ‹
            </button>
          )}
          <div ref={caseCarouselRef}
            style={{ display:'flex', overflowX:'scroll', scrollSnapType:'x mandatory', scrollBehavior:'smooth', scrollbarWidth:'none', WebkitOverflowScrolling:'touch', gap:10, padding:'0 40px', alignItems:'stretch' }}
            onScroll={() => {
              if (caseCarouselScrolling.current) return;
              const el = caseCarouselRef.current;
              if (!el) return;
              const center = el.scrollLeft + el.offsetWidth / 2;
              let closest = 0, minDist = Infinity;
              Array.from(el.children).forEach((child, i) => {
                const dist = Math.abs((child.offsetLeft + child.offsetWidth / 2) - center);
                if (dist < minDist) { minDist = dist; closest = i; }
              });
              if (closest !== caseCarouselIdx) setCaseCarouselIdx(closest);
            }}>
            {sorted.map((cs, i) => {
              const isActive = i === safeIdx;
              return (
                <div key={cs.id} style={{ flex:`0 0 calc(100% - 88px)`, width:'calc(100% - 88px)', maxWidth:'calc(100% - 88px)', minWidth:0, scrollSnapAlign:'center', scrollSnapStop:'always', opacity: isActive ? 1 : 0.55, transform: isActive ? 'scale(1)' : 'scale(0.95)', transition:'opacity .25s, transform .25s', display:'flex', flexDirection:'column' }}>
                  <div style={{ flex:1, display:'flex', flexDirection:'column' }}>
                    {renderCard(cs)}
                  </div>
                </div>
              );
            })}
          </div>
          {safeIdx < sorted.length - 1 && (
            <button onClick={() => scrollToCase(safeIdx + 1)}
              style={{ position:'absolute', right:4, top:'50%', transform:'translateY(-50%)', zIndex:10, width:28, height:28, borderRadius:'50%', background:'rgba(26,75,140,0.08)', border:'1px solid rgba(26,75,140,0.18)', color:'#1A4B8C', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.08)', transition:'all .15s' }}>
              ›
            </button>
          )}
        </div>

        {/* Dots + counter */}
        <div style={{ marginTop:12, display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
          <div style={{ display:'flex', gap:5 }}>
            {sorted.map((_, i) => (
              <button key={i} onClick={() => scrollToCase(i)}
                style={{ width: i===safeIdx ? 18 : 6, height:6, borderRadius:4, background: i===safeIdx ? '#2563EB' : 'rgba(26,75,140,0.2)', border:'none', cursor:'pointer', transition:'all .2s', padding:0 }} />
            ))}
          </div>
          <span style={{ fontSize:11, color:'#6B8AB8', fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase' }}>
            {safeIdx + 1} of {sorted.length}
          </span>
        </div>
      </div>
    );
  };

  const renderLeaderboard = () => {
    if (lbLoading) return <Spinner />;
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">{t("arena.col_rank")}</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">{t("arena.col_consultant")}</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">{t("arena.col_rating")}</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">{t("arena.col_won")}</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">{t("arena.col_apps")}</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {leaderboard.map((c, i) => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => setProfileView(c.id)}>
                <td className="px-5 py-4">
                  {i === 0 ? <span className="font-bold text-yellow-500">#1</span>
                    : i === 1 ? <span className="font-bold text-gray-400">#2</span>
                    : i === 2 ? <span className="font-bold text-amber-600">#3</span>
                    : <span className="font-bold text-gray-300">{`#${i + 1}`}</span>}
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <PersonAvatar name={c.user?.full_name} avatarUrl={c.user?.avatar_url} size={36} />
                    <div>
                      <div className="font-medium text-gray-900">{c.user?.full_name}</div>
                      <div className="text-xs text-gray-400">{c.headline ?? t("arena.years_exp").replace("{n}", c.years_experience ?? 0)}</div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-gray-900">{c.avgRating > 0 ? c.avgRating : "—"}</span>
                    {c.avgRating > 0 && <span className="text-yellow-400 text-xs">{stars(c.avgRating)}</span>}
                    <span className="text-xs text-gray-400 ml-1">({c.ratingCount})</span>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span className="font-semibold text-gray-900">{c.acceptedCases}</span>
                </td>
                <td className="px-5 py-4">
                  <span className="text-gray-600">{c.totalApps}</span>
                </td>
                <td className="px-3 py-4" onClick={e => e.stopPropagation()}>
                  <button onClick={() => toggleCompare(c.id)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors font-semibold ${
                      compareSet.includes(c.id)
                        ? "bg-blue-600 text-white border-blue-600"
                        : "border-gray-200 text-gray-400 hover:border-blue-400 hover:text-blue-600"
                    }`}>
                    {compareSet.includes(c.id) ? "✓" : "+"}
                  </button>
                </td>
              </tr>
            ))}
            {leaderboard.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400 text-sm">{t("arena.no_consultants")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {leaderboard.map((c, i) => {
        const inCompare = compareSet.includes(c.id);
        const winRate = c.totalApps > 0 ? Math.round((c.acceptedCases / c.totalApps) * 100) : 0;
        return (
          <div key={c.id}
            className={`bg-white rounded-2xl border shadow-sm p-5 hover:shadow-md transition-all cursor-pointer ${
              inCompare ? "border-blue-400 ring-2 ring-blue-100" : "border-gray-100"
            }`}
            onClick={() => setProfileView(c.id)}>
            {/* Header */}
            <div className="flex items-start gap-3 mb-3">
              <PersonAvatar name={c.user?.full_name} avatarUrl={c.user?.avatar_url} size={48} className="rounded-2xl flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 truncate">{c.user?.full_name}</div>
                <div className="text-xs text-gray-500 truncate">{c.headline ?? t("arena.default_headline")}</div>
                {c.avgRating > 0 && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-yellow-400 text-xs">{stars(c.avgRating)}</span>
                    <span className="text-xs text-gray-500 font-semibold">{c.avgRating}</span>
                    <span className="text-xs text-gray-400">({c.ratingCount})</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                {i < 3 && (
                  <span className={`font-bold text-sm ${i === 0 ? "text-yellow-500" : i === 1 ? "text-gray-400" : "text-amber-600"}`}>
                    #{i + 1}
                  </span>
                )}
                <button onClick={e => { e.stopPropagation(); toggleCompare(c.id); }}
                  className={`text-xs px-2 py-1 rounded-lg border transition-colors font-semibold ${
                    inCompare
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-gray-200 text-gray-400 hover:border-blue-400 hover:text-blue-600"
                  }`}>
                  {inCompare ? "✓" : "+ Compare"}
                </button>
              </div>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-1 mb-3">
              {c.expertise_level && (
                <span className="px-1.5 py-0.5 bg-violet-50 text-violet-700 rounded text-xs font-semibold capitalize">{c.expertise_level}</span>
              )}
              {c.availability_type && (
                <span className="px-1.5 py-0.5 bg-sky-50 text-sky-700 rounded text-xs font-semibold capitalize">{c.availability_type.replace(/_/g, ' ')}</span>
              )}
              {c.hourly_rate != null && (
                <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-xs font-semibold">${c.hourly_rate}/h</span>
              )}
            </div>

            {/* Win rate bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1 text-xs">
                <span className="text-gray-400">Win rate</span>
                <span className="font-semibold text-gray-700">{winRate}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${winRate}%` }} />
              </div>
            </div>

            {/* Stats row */}
            <div className="flex gap-3 text-xs text-gray-500 mb-3">
              <span><strong className="text-gray-800">{c.acceptedCases}</strong> {t("arena.stat_won")}</span>
              <span><strong className="text-gray-800">{c.totalApps}</strong> {t("arena.stat_apps")}</span>
              <span><strong className="text-gray-800">{c.years_experience ?? 0}y</strong> exp</span>
            </div>

            {/* Skills */}
            {c.skills?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {c.skills.slice(0, 4).map(s => (
                  <span key={s} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{s}</span>
                ))}
                {c.skills.length > 4 && (
                  <span className="px-2 py-0.5 bg-gray-50 text-gray-400 rounded text-xs">+{c.skills.length - 4}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderCompare = () => {
    const selected = compareSet.length >= 2
      ? leaderboard.filter(c => compareSet.includes(c.id))
      : leaderboard.slice(0, Math.min(3, leaderboard.length));

    if (selected.length < 2) return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
        <p className="text-gray-400 text-sm mb-3">Select at least 2 consultants from Cards or Leaderboard to compare.</p>
        <button onClick={() => setArenaTab("cards")}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
          Go to Cards →
        </button>
      </div>
    );

    // Compute "best" values per metric for highlighting
    const bestRating  = Math.max(...selected.map(c => c.avgRating  ?? 0));
    const bestWon     = Math.max(...selected.map(c => c.acceptedCases ?? 0));
    const bestWinRate = Math.max(...selected.map(c => c.totalApps > 0 ? c.acceptedCases / c.totalApps : 0));
    const bestExp     = Math.max(...selected.map(c => c.years_experience ?? 0));
    const bestRate    = Math.max(...selected.map(c => c.hourly_rate ?? 0));

    const colCount = selected.length;
    const gridCols = colCount === 2 ? "md:grid-cols-2" : colCount === 3 ? "md:grid-cols-3" : "md:grid-cols-4";

    return (
      <div>
        {/* Selection info bar */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">
            Comparing <strong>{selected.length}</strong> consultants
            {compareSet.length < 2 && <span className="text-gray-400"> (showing top {selected.length} by default)</span>}
          </p>
          {compareSet.length >= 2 && (
            <button onClick={() => setCompareSet([])}
              className="text-xs text-gray-400 hover:text-gray-600 underline">Clear selection</button>
          )}
        </div>

        <div className={`grid grid-cols-1 ${gridCols} gap-4`}>
          {selected.map((c) => {
            const winRate   = c.totalApps > 0 ? Math.round((c.acceptedCases / c.totalApps) * 100) : 0;
            const isBestRating  = c.avgRating   > 0 && c.avgRating   === bestRating;
            const isBestWon     = c.acceptedCases > 0 && c.acceptedCases === bestWon;
            const isBestWinRate = c.totalApps > 0 && (c.acceptedCases / c.totalApps) === bestWinRate;
            const isBestExp     = (c.years_experience ?? 0) > 0 && (c.years_experience ?? 0) === bestExp;
            const isCheapest    = (c.hourly_rate ?? 0) > 0 && (c.hourly_rate ?? 0) < bestRate;

            const rank = leaderboard.findIndex(l => l.id === c.id);
            const rankColor = rank === 0 ? "border-yellow-300" : rank === 1 ? "border-gray-300" : rank === 2 ? "border-orange-300" : "border-gray-100";

            return (
              <div key={c.id} className={`bg-white rounded-2xl border-2 shadow-sm p-5 ${rankColor}`}>
                {/* Header */}
                <div className="text-center mb-4">
                  <PersonAvatar name={c.user?.full_name} avatarUrl={c.user?.avatar_url} size={56} className="mx-auto mb-2 rounded-2xl" />
                  <div className="font-bold text-gray-900">{c.user?.full_name}</div>
                  {c.headline && <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">{c.headline}</div>}
                  {rank < 3 && (
                    <div className={`text-sm font-bold mt-1 ${rank === 0 ? "text-yellow-500" : rank === 1 ? "text-gray-400" : "text-amber-600"}`}>
                      #{rank + 1} Ranked
                    </div>
                  )}
                  <button onClick={() => setProfileView(c.id)}
                    className="mt-2 text-xs text-blue-600 hover:underline">View full profile →</button>
                </div>

                {/* Rating */}
                <div className={`rounded-xl p-3 mb-3 ${isBestRating ? "bg-green-50 border border-green-200" : "bg-gray-50"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Rating</span>
                    {isBestRating && <span className="text-[10px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded">BEST</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-black text-gray-900">{c.avgRating > 0 ? c.avgRating : "—"}</span>
                    {c.avgRating > 0 && <span className="text-yellow-400 text-sm">{stars(c.avgRating)}</span>}
                  </div>
                  <span className="text-xs text-gray-400">{c.ratingCount} rating{c.ratingCount !== 1 ? 's' : ''}</span>
                  {c.avgRating > 0 && (
                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${(c.avgRating / 5) * 100}%`, backgroundColor: isBestRating ? "#22c55e" : "#3b82f6" }} />
                    </div>
                  )}
                </div>

                {/* Win rate */}
                <div className={`rounded-xl p-3 mb-3 ${isBestWinRate ? "bg-green-50 border border-green-200" : "bg-gray-50"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Win Rate</span>
                    {isBestWinRate && <span className="text-[10px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded">BEST</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-black text-gray-900">{winRate}%</span>
                    <span className="text-xs text-gray-400">{c.acceptedCases}/{c.totalApps} apps</span>
                  </div>
                  <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${winRate}%`, backgroundColor: isBestWinRate ? "#22c55e" : "#3b82f6" }} />
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className={`rounded-xl p-2.5 ${isBestWon ? "bg-green-50 border border-green-200" : "bg-gray-50"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase">Won</span>
                      {isBestWon && <span className="text-[10px] font-bold text-green-600">BEST</span>}
                    </div>
                    <div className="font-black text-gray-900 text-lg">{c.acceptedCases}</div>
                    <div className="text-[10px] text-gray-400">cases</div>
                  </div>
                  <div className={`rounded-xl p-2.5 ${isBestExp ? "bg-green-50 border border-green-200" : "bg-gray-50"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase">Exp</span>
                      {isBestExp && <span className="text-[10px] font-bold text-green-600">BEST</span>}
                    </div>
                    <div className="font-black text-gray-900 text-lg">{c.years_experience ?? 0}<span className="text-xs font-normal">y</span></div>
                    <div className="text-[10px] text-gray-400">experience</div>
                  </div>
                  {c.hourly_rate != null && (
                    <div className={`rounded-xl p-2.5 ${isCheapest ? "bg-green-50 border border-green-200" : "bg-gray-50"}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase">Rate</span>
                        {isCheapest && <span className="text-[10px] font-bold text-green-600">LOWEST</span>}
                      </div>
                      <div className="font-black text-gray-900 text-base">${c.hourly_rate}<span className="text-xs font-normal text-gray-400">/h</span></div>
                    </div>
                  )}
                  <div className="bg-gray-50 rounded-xl p-2.5">
                    <div className="text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Level</div>
                    <div className="font-semibold text-gray-900 text-sm capitalize">{c.expertise_level ?? "—"}</div>
                  </div>
                </div>

                {/* Availability */}
                {c.availability_type && (
                  <div className="mb-3">
                    <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded-lg text-xs font-semibold capitalize">
                      {c.availability_type.replace(/_/g, ' ')}
                    </span>
                  </div>
                )}

                {/* Top Skills */}
                {(() => {
                  const topSkills = c.featured_skills?.length ? c.featured_skills : (c.skills ?? []).slice(0, 5);
                  return topSkills.length > 0 ? (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Top Skills</p>
                      <div className="flex flex-wrap gap-1">
                        {topSkills.map(s => (
                          <span key={s} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">{s}</span>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const arenaTabs = [
    { id: "cases",       label: t("arena.open_cases"),  icon: Briefcase,  count: openCases.length > 0 ? openCases.length : null },
    { id: "leaderboard", label: t("arena.leaderboard"), icon: Trophy,     count: null },
    { id: "cards",       label: t("arena.cards"),       icon: LayoutGrid, count: null },
    { id: "compare",     label: t("arena.compare"),     icon: BarChart2,  count: compareSet.length >= 2 ? compareSet.length : null },
  ];

  const arenaTabStatus = (() => {
    const r = {};
    for (const tab of arenaTabs) {
      if (arenaManualCompletions[tab.id] !== undefined) {
        r[tab.id] = arenaManualCompletions[tab.id] ? "complete" : "none"; continue;
      }
      r[tab.id] = "none";
    }
    return r;
  })();

  useEffect(() => {
    setArenaMountedSlides(prev => { const s = new Set(prev); s.add(arenaTab); return s; });
    const el = arenaCarouselRef.current;
    if (!el) return;
    const idx = arenaTabs.findIndex(t => t.id === arenaTab);
    if (idx < 0) return;
    const slide = el.children[idx];
    if (!slide) return;
    const targetLeft = slide.offsetLeft - (el.offsetWidth - slide.offsetWidth) / 2;
    arenaCarouselScrolling.current = true;
    el.scrollTo({ left: targetLeft, behavior: 'smooth' });
    const tid = setTimeout(() => { arenaCarouselScrolling.current = false; }, 600);
    return () => clearTimeout(tid);
  }, [arenaTab]);

  // Sync case carousel index to module-level var so it survives remounts
  useEffect(() => { _arenaCaseIdx = caseCarouselIdx; }, [caseCarouselIdx]);

  // When returning from ranking detail, scroll case carousel back to remembered position
  useEffect(() => {
    if (arenaSelectedCase) return;
    if (_arenaCaseIdx === 0) return;
    const tid = setTimeout(() => {
      const el = caseCarouselRef.current;
      if (!el) return;
      const slide = el.children[_arenaCaseIdx];
      if (!slide) return;
      caseCarouselScrolling.current = true;
      const targetLeft = slide.offsetLeft - (el.offsetWidth - slide.offsetWidth) / 2;
      el.scrollTo({ left: Math.max(0, targetLeft), behavior: 'instant' });
      setTimeout(() => { caseCarouselScrolling.current = false; }, 100);
    }, 50);
    return () => clearTimeout(tid);
  }, [arenaSelectedCase]);

  if (applyingToCase) {
    return (
      <div className="min-h-screen bg-[#EAF4FD] p-6">
        <ApplyWizard
          caseData={applyingToCase}
          auth={auth}
          onComplete={() => { setApplying(null); refetchApps(); }}
          onCancel={() => setApplying(null)}
        />
      </div>
    );
  }

  if (arenaSelectedCase && canViewRanking) {
    const c = arenaSelectedCase;
    const companyName = c.client?.client_profiles?.company_name || c.client?.full_name;
    const caseApps = applications.filter(a => a.case_id === c.id);
    const appCount = caseApps.length;
    return (
      <div className="space-y-5">
        <button onClick={() => setArenaSelected(null)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          {t("arena.back")}
        </button>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-gray-900 leading-tight">{c.title}</h1>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge className={PRIORITY_COLORS[c.priority]}>{PRIORITY_LABEL_KEYS[c.priority] ? t(PRIORITY_LABEL_KEYS[c.priority]) : cap(c.priority)}</Badge>
                {c.area_sap      && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">{c.area_sap}</span>}
                {c.area_industry && <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded-lg text-xs font-medium">{c.area_industry}</span>}
                {c.is_confidential && <span className="px-2 py-0.5 bg-gray-800 text-white rounded-lg text-xs font-semibold">{t("arena.private")}</span>}
                {c.nda_required  && <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-lg text-xs font-semibold">{t("arena.nda")}</span>}
              </div>
            </div>
            <div className="flex-shrink-0 text-right">
              <div className="text-2xl font-black text-gray-900">{appCount}</div>
              <div className="text-xs text-gray-400">{appCount !== 1 ? t("arena.applicant_pl") : t("arena.applicant_sg")}</div>
            </div>
          </div>
          {companyName && <p className="text-sm text-blue-600 font-semibold mb-2">{companyName}</p>}
          {c.description && <p className="text-sm text-gray-600 leading-relaxed mb-4">{c.description}</p>}
          <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-4">
            {c.start_date && <span><span className="font-medium text-gray-700">{t("arena.label_start")}</span> {fmtDate(c.start_date)}</span>}
            {c.due_date   && <span><span className="font-medium text-gray-700">{t("arena.label_due_short")}</span> {fmtDate(c.due_date)}</span>}
            {c.budget     && <span><span className="font-medium text-gray-700">{t("arena.label_budget_short")}</span> ${Number(c.budget).toLocaleString()}</span>}
            {c.min_years_experience > 0 && <span><span className="font-medium text-gray-700">{t("arena.label_experience")}</span> {c.min_years_experience}{t("arena.yrs_suffix")}</span>}
          </div>
          {c.skills_required?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {c.skills_required.map(s => (
                <span key={s} className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">{s}</span>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">{t("arena.applicant_ranking")}</p>
          <ApplicantRankingSection
            caseData={c}
            auth={auth}
            applications={caseApps}
            reviewApplication={handleArenaReviewApplication}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("arena.title")}</h1>
          <p className="text-gray-500 text-sm mt-1">{t("arena.subtitle")}</p>
        </div>
        {openCases.length > 0 && (
          <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-semibold rounded-xl">
            {openCases.length === 1 ? t("arena.open_count_one") : t("arena.open_count_many").replace("{n}", openCases.length)}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {(() => {
        const done = arenaTabs.filter(t => arenaTabStatus[t.id] === "complete").length;
        if (done === 0) return null;
        return (
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
            <div style={{ flex:1, height:4, borderRadius:99, background:'#E2E8F0', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${(done/arenaTabs.length)*100}%`, background:'linear-gradient(90deg,#1A4B8C,#3B82F6)', borderRadius:99, transition:'width .4s' }}/>
            </div>
            <span style={{ fontSize:11, fontWeight:700, color:'#1A4B8C', whiteSpace:'nowrap' }}>{done}/{arenaTabs.length} done</span>
          </div>
        );
      })()}

      {/* Section Carousel */}
      {(() => {
        const carouselIdx = Math.max(0, arenaTabs.findIndex(t => t.id === arenaTab));
        function scrollTo(idx) {
          setArenaTab(arenaTabs[Math.max(0, Math.min(idx, arenaTabs.length - 1))]?.id ?? arenaTab);
        }
        function onScroll() {
          if (arenaCarouselScrolling.current) return;
          const el = arenaCarouselRef.current;
          if (!el) return;
          const center = el.scrollLeft + el.offsetWidth / 2;
          let closest = 0, minDist = Infinity;
          Array.from(el.children).forEach((child, i) => {
            const dist = Math.abs((child.offsetLeft + child.offsetWidth / 2) - center);
            if (dist < minDist) { minDist = dist; closest = i; }
          });
          const t2 = arenaTabs[closest];
          if (t2 && t2.id !== arenaTab) setArenaTab(t2.id);
        }
        return (
          <div style={{ position:'relative' }}>
            {carouselIdx > 0 && (
              <button onClick={() => scrollTo(carouselIdx - 1)}
                style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', zIndex:10, width:32, height:32, borderRadius:'50%', border:'1.5px solid #CBD5E1', background:'white', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.08)', marginTop:-20 }}>
                <ChevronLeft size={16} style={{color:'#64748B'}}/>
              </button>
            )}
            {carouselIdx < arenaTabs.length - 1 && (
              <button onClick={() => scrollTo(carouselIdx + 1)}
                style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', zIndex:10, width:32, height:32, borderRadius:'50%', border:'1.5px solid #CBD5E1', background:'white', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.08)', marginTop:-20 }}>
                <ChevronRight size={16} style={{color:'#64748B'}}/>
              </button>
            )}
            <div ref={arenaCarouselRef} onScroll={onScroll}
              style={{ display:'flex', overflowX:'scroll', scrollSnapType:'x mandatory', scrollbarWidth:'none', WebkitOverflowScrolling:'touch', gap:10, padding:'0 60px' }}>
              {arenaTabs.map((tab, i) => {
                const isActive = tab.id === arenaTab;
                const Icon = tab.icon;
                const st = arenaTabStatus[tab.id];
                return (
                  <div key={tab.id}
                    style={{ flex:'0 0 calc(100% - 120px)', width:'calc(100% - 120px)', maxWidth:'calc(100% - 120px)', minWidth:0, overflow:'hidden', scrollSnapAlign:'center', scrollSnapStop:'always', opacity:isActive?1:0.5, transform:isActive?'scale(1)':'scale(0.97)', transition:'opacity .25s, transform .25s' }}>
                    <div style={{ borderRadius:12, border:`1px solid ${isActive?'#CBD5E1':'#E2E8F0'}`, background:'white', overflow:'hidden', width:'100%', boxSizing:'border-box', height:700, display:'flex', flexDirection:'column', boxShadow:isActive?'0 4px 20px rgba(0,0,0,.08)':'none', transition:'box-shadow .25s' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderBottom:'1px solid #F1F5F9', background:isActive?'#F8FAFC':'#FAFAFA', flexShrink:0, cursor:isActive?'default':'pointer' }}
                        onClick={() => !isActive && scrollTo(i)}>
                        {st === "complete"
                          ? <div style={{width:16,height:16,borderRadius:'50%',background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Check size={9} color="white" strokeWidth={3}/></div>
                          : st === "in_progress"
                            ? <div style={{width:8,height:8,borderRadius:'50%',background:'#3B82F6',flexShrink:0,marginRight:2}}/>
                            : <div style={{width:8,height:8,borderRadius:'50%',background:'#CBD5E1',flexShrink:0,marginRight:2}}/>}
                        <Icon size={13} style={{color:isActive?'#1A4B8C':'#94A3B8',flexShrink:0}}/>
                        <span style={{flex:1,fontSize:12,fontWeight:700,color:isActive?'#0F172A':'#94A3B8',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tab.label}</span>
                        {tab.count !== null && <span style={{fontSize:10,fontWeight:600,padding:'1px 6px',borderRadius:99,background:isActive?'#DBEAFE':'#F1F5F9',color:isActive?'#2563EB':'#94A3B8',flexShrink:0}}>{tab.count}</span>}
                        {isActive && (
                          <button onClick={e => { e.stopPropagation(); setArenaManualComplete(tab.id, st !== "complete"); }}
                            title={st === "complete" ? "Mark incomplete" : "Mark complete"}
                            style={{ flexShrink:0,display:'flex',alignItems:'center',gap:3,fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:99,border:`1px solid ${st==="complete"?'#BBF7D0':'#E2E8F0'}`,background:st==="complete"?'#F0FDF4':'#F8FAFC',color:st==="complete"?'#16A34A':'#94A3B8',cursor:'pointer',transition:'all .15s',whiteSpace:'nowrap' }}>
                            <Check size={9} strokeWidth={3}/>
                            {st === "complete" ? "Done" : "Mark done"}
                          </button>
                        )}
                      </div>
                      {arenaMountedSlides.has(tab.id) ? (
                        <div style={{ flex:1, overflowY:'auto', padding:'18px 20px' }}>

          {tab.id === "cases"       && renderCases()}
          {tab.id === "leaderboard" && renderLeaderboard()}
          {tab.id === "cards"       && renderCards()}
          {tab.id === "compare"     && renderCompare()}

                        </div>
                      ) : (
                        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <Spinner />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Footer pill bar */}
            <div style={{ marginTop:10, background:'white', borderRadius:12, border:'1px solid #E2E8F0', padding:'10px 14px', display:'flex', gap:6, overflowX:'auto', scrollbarWidth:'none' }}>
              {arenaTabs.map((tab, i) => {
                const Icon = tab.icon;
                const isActive = tab.id === arenaTab;
                const st = arenaTabStatus[tab.id];
                return (
                  <button key={tab.id} onClick={() => scrollTo(i)}
                    style={{ flexShrink:0, display:'flex', alignItems:'center', gap:4, padding:'5px 10px', borderRadius:99, border:`1.5px solid ${isActive?'#1A4B8C':st==="complete"?'#BBF7D0':'#E2E8F0'}`, background:isActive?'#1A4B8C':st==="complete"?'#F0FDF4':'white', color:isActive?'white':st==="complete"?'#16A34A':'#64748B', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', transition:'all .15s' }}>
                    {st === "complete" && !isActive
                      ? <div style={{width:13,height:13,borderRadius:'50%',background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Check size={8} color="white" strokeWidth={3}/></div>
                      : <Icon size={11}/>}
                    <span>{tab.label}</span>
                    {tab.count !== null && <span style={{fontSize:10,padding:'1px 5px',borderRadius:99,background:isActive?'rgba(255,255,255,.2)':st==="complete"?'#DCFCE7':'#F1F5F9',color:isActive?'rgba(255,255,255,.7)':st==="complete"?'#16A34A':'#94A3B8'}}>{tab.count}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}


      {/* Floating compare bar */}
      {compareSet.length >= 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-2xl">
          <span className="text-sm font-semibold">{compareSet.length} consultants selected</span>
          <button onClick={() => { setArenaTab("compare"); }}
            className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold rounded-xl transition-colors">
            Compare →
          </button>
          <button onClick={() => setCompareSet([])}
            className="text-gray-400 hover:text-white transition-colors ml-1">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Consultant profile drawer */}
      {profileView && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setProfileView(null)} />
          <ConsultantProfilePanel
            consultantId={profileView}
            onClose={() => setProfileView(null)}
            onAddToCompare={() => toggleCompare(profileView)}
            inCompare={compareSet.includes(profileView)}
            auth={auth}
            isShortlisted={isShortlisted(profileView)}
            onToggleShortlist={() => toggleShortlist(profileView)}
            openCases={cases.filter(c => c.status === 'estimated' || c.status === 'open')}
          />
        </div>
      )}
    </div>
  );
}

export { useConsultantShortlist, ConsultantProfilePanel, ArenaView };
