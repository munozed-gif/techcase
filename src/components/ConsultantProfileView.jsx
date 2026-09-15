import { useState, useEffect, useRef } from "react";
import {
  Activity, BarChart2, Briefcase, Camera, Check, ChevronLeft, ChevronRight,
  CreditCard, GraduationCap, Heart, Pencil, Plus, Star, Trash2, Trophy, X,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { Spinner, TrustBadge, TierProgressBar, VouchingPanel, PlanUsageCard, ResumeImporter, ConsultantProjectsHierarchy } from "./ProfileComponents.jsx";
import { PersonAvatar } from "../views/Projects.jsx";

function ConsultantProfileView({ userId, onBack }) {
  const auth = useAuth();
  const { t } = useT();
  const targetUserId = userId ?? auth.profile?.id ?? auth.user?.id;
  const isOwnProfile = !userId || userId === auth.user?.id;

  const DEFAULT_THRESHOLDS = {
    silver:   { cases: 3,  min_rating: 3.5 },
    gold:     { cases: 10, min_rating: 4.2 },
    platinum: { cases: 25, min_rating: 4.5 },
  };

  const [section, setSection] = useState('overview');
  const cvCarouselRef = useRef(null);
  const cvCarouselScrolling = useRef(false);
  const [cvMountedSlides, setCvMountedSlides] = useState(() => new Set(["overview"]));
  const [cvManualCompletions, setCvManualCompletionsRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`tc_cvmc_${userId ?? 'me'}`) ?? "{}"); } catch { return {}; }
  });
  function setCvManualComplete(tabId, done) {
    setCvManualCompletionsRaw(prev => {
      const next = { ...prev, [tabId]: done };
      try { localStorage.setItem(`tc_cvmc_${userId ?? 'me'}`, JSON.stringify(next)); } catch {}
      return next;
    });
  }
  const [profileData, setProfileData]   = useState(null);
  const [cpData, setCpData]             = useState(null);
  const [ratingsData, setRatingsData]   = useState([]);
  const [dimensions, setDimensions]     = useState([]);
  const [assignedCount, setAssignedCount] = useState(0);
  const [activity, setActivity]         = useState([]);
  const [thresholds, setThresholds]     = useState(DEFAULT_THRESHOLDS);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarFileRef = useRef(null);
  const [cpEditingProj, setCpEditingProj] = useState(null);
  const [cpSaving, setCpSaving] = useState(false);
  const EMPTY_CP_PROJ = { title: '', consulting_company: '', client_name: '', role: '', url: '', description: '', _tech: '' };
  const EMPTY_CP_CUST = { company_name: '', role_held: '', start_date: '', end_date: '', description: '' };
  const [cpNewProj, setCpNewProj] = useState(null);
  const [cpNewCust, setCpNewCust] = useState(null);
  const [cpEditingCust, setCpEditingCust] = useState(null);

  async function handleCpSaveProj() {
    if (!cpEditingProj) return;
    setCpSaving(true);
    try {
      const { id, _tech, ...rest } = cpEditingProj;
      const data = { ...rest, tech_stack: (_tech ?? '').split(',').map(s => s.trim()).filter(Boolean) };
      const { error: err } = await supabase.from('consultant_projects').update(data).eq('id', id);
      if (err) throw err;
      setCpData(prev => prev ? {
        ...prev,
        consultant_projects: prev.consultant_projects.map(p => p.id === id ? { ...p, ...data } : p),
      } : prev);
      setCpEditingProj(null);
    } catch (e) { alert(e.message); }
    setCpSaving(false);
  }

  async function handleCpAddProj() {
    if (!cpNewProj?.title) return;
    setCpSaving(true);
    try {
      const { _tech, ...rest } = cpNewProj;
      const data = { ...rest, consultant_id: targetUserId, tech_stack: (_tech ?? '').split(',').map(s => s.trim()).filter(Boolean) };
      const { data: inserted, error: err } = await supabase.from('consultant_projects').insert(data).select().single();
      if (err) throw err;
      setCpData(prev => prev ? {
        ...prev,
        consultant_projects: [...(prev.consultant_projects ?? []), inserted],
      } : prev);
      setCpNewProj(null);
    } catch (e) { alert(e.message); }
    setCpSaving(false);
  }

  async function handleCpAddCust() {
    if (!cpNewCust?.company_name) return;
    setCpSaving(true);
    try {
      const { data: inserted, error: err } = await supabase
        .from('consultant_customers').insert({ ...cpNewCust, consultant_id: targetUserId }).select().single();
      if (err) throw err;
      setCpData(prev => prev ? {
        ...prev,
        consultant_customers: [...(prev.consultant_customers ?? []), inserted],
      } : prev);
      setCpNewCust(null);
    } catch (e) { alert(e.message); }
    setCpSaving(false);
  }

  async function handleCpSaveCust() {
    if (!cpEditingCust) return;
    setCpSaving(true);
    try {
      const { id, ...data } = cpEditingCust;
      const { error: err } = await supabase.from('consultant_customers').update(data).eq('id', id);
      if (err) throw err;
      setCpData(prev => prev ? {
        ...prev,
        consultant_customers: prev.consultant_customers.map(c => c.id === id ? { ...c, ...data } : c),
      } : prev);
      setCpEditingCust(null);
    } catch (e) { alert(e.message); }
    setCpSaving(false);
  }

  async function handleCpDeleteCust(id) {
    if (!window.confirm('Delete this company?')) return;
    const { error: err } = await supabase.from('consultant_customers').delete().eq('id', id);
    if (err) { alert(err.message); return; }
    setCpData(prev => prev ? {
      ...prev,
      consultant_customers: prev.consultant_customers.filter(c => c.id !== id),
    } : prev);
  }

  async function handleCpDeleteProj(id) {
    if (!window.confirm('Delete this project?')) return;
    const { error: err } = await supabase.from('consultant_projects').delete().eq('id', id);
    if (err) { alert(err.message); return; }
    setCpData(prev => prev ? {
      ...prev,
      consultant_projects: prev.consultant_projects.filter(p => p.id !== id),
    } : prev);
  }

  async function handleCpToggleFeatured(proj) {
    const next = !proj.featured;
    const { error: err } = await supabase.from('consultant_projects').update({ featured: next }).eq('id', proj.id);
    if (err) { alert(err.message); return; }
    setCpData(prev => prev ? {
      ...prev,
      consultant_projects: prev.consultant_projects.map(p => p.id === proj.id ? { ...p, featured: next } : p),
    } : prev);
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      const path = `consultant-avatars/${targetUserId}.${ext}`;
      const { error: upErr } = await supabase.storage.from('project-avatars').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('project-avatars').getPublicUrl(path);
      await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', targetUserId);
      await supabase.from('consultant_profiles').update({ photo_url: publicUrl }).eq('id', targetUserId);
      setProfileData(p => p ? { ...p, avatar_url: publicUrl } : p);
    } catch (err) { alert(`Avatar upload failed: ${err.message}`); }
    setUploadingAvatar(false);
    e.target.value = '';
  }

  useEffect(() => {
    if (!targetUserId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [profRes, ratingsRes, dimsRes, assignRes, logsRes, ssRes, cpRes] = await Promise.all([
          supabase.from('users')
            .select('id, full_name, email, role, trust_level, avg_rating, avatar_url, created_at')
            .eq('id', targetUserId).single(),
          supabase.from('case_ratings')
            .select('id, case_id, scores, created_at, cases(title)')
            .eq('ratee_id', targetUserId)
            .order('created_at', { ascending: false }),
          supabase.from('rating_dimensions')
            .select('key, label').eq('active', true).order('sort_order'),
          supabase.from('case_assignments')
            .select('id', { count: 'exact', head: true })
            .eq('consultant_id', targetUserId),
          supabase.from('audit_logs')
            .select('id, event_type, entity_name, created_at')
            .eq('user_id', targetUserId)
            .order('created_at', { ascending: false }).limit(5),
          supabase.from('system_settings')
            .select('key, value').eq('key', 'trust_thresholds').maybeSingle(),
          supabase.from('consultant_profiles')
            .select('headline, bio, linkedin_url, hourly_rate, years_experience, expertise_level, availability_type, travel_available, skills, external_occupancy_pct, featured_skills, consultant_projects(id, title, role, client_name, consulting_company, description, url, tech_stack, featured), consultant_customers(id, company_name)')
            .eq('id', targetUserId).maybeSingle(),
        ]);
        if (cancelled) return;
        setProfileData(profRes.data ?? null);
        setCpData(cpRes.data ?? null);
        setRatingsData(ratingsRes.data ?? []);
        setDimensions(dimsRes.data ?? []);
        setAssignedCount(assignRes.count ?? 0);
        setActivity(logsRes.data ?? []);
        if (ssRes.data?.value) {
          try {
            const parsed = typeof ssRes.data.value === 'string'
              ? JSON.parse(ssRes.data.value) : ssRes.data.value;
            setThresholds(parsed);
          } catch (_) {}
        }
      } catch (e) {
        if (!cancelled) setError(e.message ?? 'Failed to load profile.');
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [targetUserId]);

  // Compute averages from ratingsData
  const perRatingAvgs = ratingsData.map(r => {
    const vals = Object.values(r.scores ?? {});
    return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  }).filter(v => v !== null);
  const overallAvg = perRatingAvgs.length > 0
    ? (perRatingAvgs.reduce((s, v) => s + v, 0) / perRatingAvgs.length).toFixed(2)
    : null;

  // Avg per dimension
  const dimAvgs = {};
  dimensions.forEach(d => {
    const vals = ratingsData.map(r => r.scores?.[d.key]).filter(v => v != null);
    dimAvgs[d.key] = vals.length > 0
      ? (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2) : null;
  });

  // Group ratings by case for the history view
  const ratingsByCase = [];
  const seenCases = new Set();
  for (const r of ratingsData) {
    if (!seenCases.has(r.case_id)) {
      seenCases.add(r.case_id);
      ratingsByCase.push({ caseId: r.case_id, caseTitle: r.cases?.title ?? r.case_id, ratings: [] });
    }
    const group = ratingsByCase.find(g => g.caseId === r.case_id);
    if (group) group.ratings.push(r);
  }

  const tabs = [
    { id: 'overview',   label: t('profile.tab_overview'),   icon: BarChart2,     count: null },
    { id: 'experience', label: t('profile.tab_experience'),  icon: Briefcase,     count: cpData?.consultant_projects?.length > 0 ? cpData.consultant_projects.length : null },
    { id: 'skills',     label: t('profile.tab_skills'),      icon: GraduationCap, count: cpData?.skills?.length > 0 ? cpData.skills.length : null },
    { id: 'ratings',    label: t('profile.tab_ratings'),     icon: Star,          count: ratingsData.length > 0 ? ratingsData.length : null },
    { id: 'tier',       label: t('profile.tab_tier'),        icon: Trophy,        count: null },
    { id: 'activity',   label: t('profile.tab_activity'),    icon: Activity,      count: activity.length > 0 ? activity.length : null },
    { id: 'vouches',    label: t('vouch.tab'),               icon: Heart,         count: null },
    ...(isOwnProfile ? [{ id: 'plan', label: 'My Plan', icon: CreditCard, count: null }] : []),
  ];

  const cvTabStatus = (() => {
    const r = {};
    for (const tab of tabs) {
      if (cvManualCompletions[tab.id] !== undefined) {
        r[tab.id] = cvManualCompletions[tab.id] ? "complete" : "none"; continue;
      }
      r[tab.id] = "none";
    }
    return r;
  })();

  useEffect(() => {
    setCvMountedSlides(prev => { const s = new Set(prev); s.add(section); return s; });
    const el = cvCarouselRef.current;
    if (!el) return;
    const idx = tabs.findIndex(t => t.id === section);
    if (idx < 0) return;
    const slide = el.children[idx];
    if (!slide) return;
    const targetLeft = slide.offsetLeft - (el.offsetWidth - slide.offsetWidth) / 2;
    cvCarouselScrolling.current = true;
    el.scrollTo({ left: targetLeft, behavior: 'smooth' });
    const tid = setTimeout(() => { cvCarouselScrolling.current = false; }, 600);
    return () => clearTimeout(tid);
  }, [section]);

  if (loading) return <Spinner />;
  if (error) return (
    <div className="p-6 bg-red-50 rounded-2xl border border-red-200 text-red-600 text-sm">{error}</div>
  );

  return (
    <div className="space-y-6">
      {onBack && (
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 font-medium transition-colors -mb-2">
          <ChevronLeft size={16} /> Back to People
        </button>
      )}
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-4 flex-wrap">
          {isOwnProfile ? (
            <div className="relative group cursor-pointer flex-shrink-0" onClick={() => !uploadingAvatar && avatarFileRef.current?.click()}>
              <PersonAvatar name={profileData?.full_name} avatarUrl={profileData?.avatar_url} size={64} className="rounded-2xl" />
              <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploadingAvatar
                  ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Camera className="w-5 h-5 text-white" />}
              </div>
              <input ref={avatarFileRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
            </div>
          ) : (
            <PersonAvatar name={profileData?.full_name} avatarUrl={profileData?.avatar_url} size={64} className="rounded-2xl" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{profileData?.full_name ?? '—'}</h1>
              {profileData?.trust_level && <TrustBadge level={profileData.trust_level} size="sm" />}
            </div>
            {cpData?.headline && (
              <p className="text-sm font-medium text-gray-700 mt-0.5">{cpData.headline}</p>
            )}
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <p className="text-xs text-gray-400 capitalize">
                {profileData?.role} · {t('profile.member_since')} {profileData?.created_at
                  ? new Date(profileData.created_at).toLocaleDateString() : '—'}
              </p>
              {profileData?.email && (
                <p className="text-xs text-gray-400">· {profileData.email}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-2">
              {overallAvg && (
                <span className="text-xs flex items-center gap-1 text-yellow-600 font-semibold">
                  ★ {overallAvg}
                  <span className="text-gray-400 font-normal">({ratingsData.length})</span>
                </span>
              )}
              {cpData?.expertise_level && (
                <span className="px-2 py-0.5 bg-violet-100 text-violet-700 text-xs rounded-full capitalize">
                  {cpData.expertise_level.replace(/_/g, ' ')}
                </span>
              )}
              {cpData?.availability_type && (
                <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-xs rounded-full capitalize">
                  {cpData.availability_type.replace(/_/g, ' ')}
                </span>
              )}
              {cpData?.travel_available && (
                <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full">Travel ✓</span>
              )}
              {cpData?.hourly_rate && (
                <span className="text-xs text-gray-500">${cpData.hourly_rate}/hr</span>
              )}
              {cpData != null && (
                <span className="text-xs text-emerald-600 font-medium">
                  {Math.max(0, 100 - (cpData.external_occupancy_pct ?? 0))}% free
                </span>
              )}
            </div>
          </div>
          {overallAvg && (
            <div className="text-right flex-shrink-0">
              <div className="text-2xl font-bold text-yellow-500">★ {overallAvg}</div>
              <div className="text-xs text-gray-400">{t('profile.overall_avg')}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {ratingsData.length} {t('profile.ratings_received')}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {(() => {
        const done = tabs.filter(t => cvTabStatus[t.id] === "complete").length;
        if (done === 0) return null;
        return (
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
            <div style={{ flex:1, height:4, borderRadius:99, background:'#E2E8F0', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${(done/tabs.length)*100}%`, background:'linear-gradient(90deg,#1A4B8C,#3B82F6)', borderRadius:99, transition:'width .4s' }}/>
            </div>
            <span style={{ fontSize:11, fontWeight:700, color:'#1A4B8C', whiteSpace:'nowrap' }}>{done}/{tabs.length} done</span>
          </div>
        );
      })()}

      {/* Section Carousel */}
      {(() => {
        const carouselIdx = Math.max(0, tabs.findIndex(t => t.id === section));
        function scrollTo(idx) {
          setSection(tabs[Math.max(0, Math.min(idx, tabs.length - 1))]?.id ?? section);
        }
        function onScroll() {
          if (cvCarouselScrolling.current) return;
          const el = cvCarouselRef.current;
          if (!el) return;
          const center = el.scrollLeft + el.offsetWidth / 2;
          let closest = 0, minDist = Infinity;
          Array.from(el.children).forEach((child, i) => {
            const dist = Math.abs((child.offsetLeft + child.offsetWidth / 2) - center);
            if (dist < minDist) { minDist = dist; closest = i; }
          });
          const tab = tabs[closest];
          if (tab && tab.id !== section) setSection(tab.id);
        }
        return (
          <div style={{ position:'relative' }}>
            {carouselIdx > 0 && (
              <button onClick={() => scrollTo(carouselIdx - 1)}
                style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', zIndex:10, width:32, height:32, borderRadius:'50%', border:'1.5px solid #CBD5E1', background:'white', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.08)', marginTop:-20 }}>
                <ChevronLeft size={16} style={{color:'#64748B'}}/>
              </button>
            )}
            {carouselIdx < tabs.length - 1 && (
              <button onClick={() => scrollTo(carouselIdx + 1)}
                style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', zIndex:10, width:32, height:32, borderRadius:'50%', border:'1.5px solid #CBD5E1', background:'white', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.08)', marginTop:-20 }}>
                <ChevronRight size={16} style={{color:'#64748B'}}/>
              </button>
            )}
            <div ref={cvCarouselRef} onScroll={onScroll}
              style={{ display:'flex', overflowX:'scroll', scrollSnapType:'x mandatory', scrollbarWidth:'none', WebkitOverflowScrolling:'touch', gap:10, padding:'0 60px' }}>
              {tabs.map((tab, i) => {
                const isActive = tab.id === section;
                const Icon = tab.icon;
                const st = cvTabStatus[tab.id];
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
                          <button onClick={e => { e.stopPropagation(); setCvManualComplete(tab.id, st !== "complete"); }}
                            title={st === "complete" ? "Mark incomplete" : "Mark complete"}
                            style={{ flexShrink:0,display:'flex',alignItems:'center',gap:3,fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:99,border:`1px solid ${st==="complete"?'#BBF7D0':'#E2E8F0'}`,background:st==="complete"?'#F0FDF4':'#F8FAFC',color:st==="complete"?'#16A34A':'#94A3B8',cursor:'pointer',transition:'all .15s',whiteSpace:'nowrap' }}>
                            <Check size={9} strokeWidth={3}/>
                            {st === "complete" ? "Done" : "Mark done"}
                          </button>
                        )}
                      </div>
                      {cvMountedSlides.has(tab.id) ? (
                        <div style={{ flex:1, overflowY:'auto', padding:'18px 20px' }}>

          {/* Overview */}
          {tab.id === 'overview' && (
            <div className="space-y-6">
              {(cpData?.headline || cpData?.bio) && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-2">
                  {cpData?.headline && <p className="font-semibold text-gray-800">{cpData.headline}</p>}
                  {cpData?.bio && <p className="text-sm text-gray-600 whitespace-pre-line">{cpData.bio}</p>}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                  <h3 className="font-semibold text-gray-900 text-sm">Profile Details</h3>
                  <div className="space-y-3 text-sm">
                    {cpData?.years_experience != null && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Experience</span>
                        <span className="font-medium text-gray-800">{cpData.years_experience} yrs</span>
                      </div>
                    )}
                    {cpData?.expertise_level && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Expertise</span>
                        <span className="font-medium text-gray-800 capitalize">{cpData.expertise_level.replace('_', ' ')}</span>
                      </div>
                    )}
                    {cpData?.hourly_rate != null && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Hourly Rate</span>
                        <span className="font-medium text-gray-800">${cpData.hourly_rate}/hr</span>
                      </div>
                    )}
                    {cpData?.availability_type && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Availability</span>
                        <span className="font-medium text-gray-800 capitalize">{cpData.availability_type.replace('_', ' ')}</span>
                      </div>
                    )}
                    {cpData?.travel_available != null && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Travel</span>
                        <span className="font-medium text-gray-800">{cpData.travel_available ? 'Available' : 'Not available'}</span>
                      </div>
                    )}
                    {cpData?.linkedin_url && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">LinkedIn</span>
                        <a href={cpData.linkedin_url} target="_blank" rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-xs truncate max-w-[160px]">
                          {cpData.linkedin_url.replace(/^https?:\/\/(www\.)?linkedin\.com\//, '')}
                        </a>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-gray-100 pt-3">
                      <span className="text-gray-500">Cases Assigned</span>
                      <span className="font-bold text-blue-600">{assignedCount}</span>
                    </div>
                  </div>
                  {dimensions.length > 0 && (
                    <div className="border-t border-gray-100 pt-4 space-y-2">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                        {t('profile.avg_rating')} {t('profile.by_dimension')}
                      </h4>
                      {dimensions.map(d => (
                        <div key={d.key} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">{d.label}</span>
                          <span className="font-semibold text-gray-800">{dimAvgs[d.key] ?? '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h3 className="font-semibold text-gray-900 text-sm mb-4">{t('profile.tier_progress')}</h3>
                  <TierProgressBar ratingsData={ratingsData} currentTier={profileData?.trust_level} thresholds={thresholds} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
                  <div className="text-3xl font-bold text-blue-700">{cpData?.consultant_projects?.length ?? 0}</div>
                  <div className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">{t("profile.projects")}</div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
                  <div className="text-3xl font-bold text-teal-600">{cpData?.skills?.length ?? 0}</div>
                  <div className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">{t("label.skills")}</div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
                  <div className="text-3xl font-bold text-violet-600">{cpData?.consultant_customers?.length ?? 0}</div>
                  <div className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">Clients</div>
                </div>
              </div>
              {(cpData?.featured_skills?.length ?? 0) > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Top Skills</p>
                  <div className="flex flex-wrap gap-2">
                    {cpData.featured_skills.map(s => (
                      <span key={s} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-sm font-medium">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {(() => {
                const featured = (cpData?.consultant_projects ?? []).filter(p => p.featured);
                return featured.length > 0 ? (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Featured Projects</p>
                    <div className="space-y-3">
                      {featured.map(proj => (
                        <div key={proj.id} className="border border-gray-100 rounded-xl p-3">
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-gray-900">{proj.title}</div>
                              {proj.role && <div className="text-xs text-blue-600 font-medium mt-0.5">{proj.role}</div>}
                              {proj.client_name && <div className="text-xs text-gray-500">{proj.client_name}</div>}
                              {proj.tech_stack?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {proj.tech_stack.slice(0, 5).map(s => (
                                    <span key={s} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">{s}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <Star className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" fill="currentColor" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {/* Ratings history */}
          {tab.id === 'ratings' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">{t('profile.tab_ratings')}</h3>
                {overallAvg && (
                  <span className="text-yellow-500 font-bold">★ {overallAvg} {t('profile.overall_avg')}</span>
                )}
              </div>
              {ratingsByCase.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">{t('profile.no_ratings')}</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {ratingsByCase.map(group => {
                    const gAvgs = group.ratings.map(r => {
                      const vals = Object.values(r.scores ?? {});
                      return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
                    });
                    const gAvg = gAvgs.length > 0
                      ? (gAvgs.reduce((s, v) => s + v, 0) / gAvgs.length).toFixed(2) : '—';
                    return (
                      <div key={group.caseId} className="p-5">
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-medium text-gray-800 text-sm">{group.caseTitle}</span>
                          <span className="text-xs text-yellow-600 font-semibold">★ {gAvg}</span>
                        </div>
                        {group.ratings.map(r => (
                          <div key={r.id} className="ml-3 border-l-2 border-gray-100 pl-3 mt-2 space-y-1.5">
                            <div className="text-xs text-gray-400">
                              {t('label.client')} · {new Date(r.created_at).toLocaleDateString()}
                            </div>
                            {dimensions.map(d => r.scores?.[d.key] != null && (
                              <div key={d.key} className="flex items-center justify-between text-xs">
                                <span className="text-gray-500">{d.label}</span>
                                <div className="flex gap-0.5">
                                  {[1,2,3,4,5].map(s => (
                                    <span key={s} className={s <= r.scores[d.key] ? 'text-yellow-400' : 'text-gray-200'}>★</span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tier progress */}
          {tab.id === 'tier' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className="font-semibold text-gray-900 mb-5">{t('profile.tier_progress')}</h3>
              <TierProgressBar ratingsData={ratingsData} currentTier={profileData?.trust_level} thresholds={thresholds} />
            </div>
          )}

          {/* Activity */}
          {tab.id === 'activity' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="p-5 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">{t('profile.tab_activity')}</h3>
              </div>
              {activity.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">{t('profile.no_activity')}</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {activity.map(log => (
                    <div key={log.id} className="p-4 flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm text-gray-700">{log.entity_name ?? log.event_type}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{new Date(log.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Vouches */}
          {tab.id === 'vouches' && (
            <div className="space-y-4">
              <VouchingPanel targetUserId={targetUserId} targetName={profileData?.full_name} />
            </div>
          )}

          {/* My Plan */}
          {tab.id === 'plan' && isOwnProfile && (
            <PlanUsageCard auth={auth} />
          )}

          {/* Experience */}
          {tab.id === 'experience' && (
            <div className="space-y-4">
              {/* AI Resume Importer */}
              {isOwnProfile && (
                <ResumeImporter onExtracted={async data => {
                  // Update consultant_profiles (headline, bio, skills, etc.)
                  const profileUpdates = {};
                  if (data.headline)         profileUpdates.headline         = data.headline;
                  if (data.bio)              profileUpdates.bio              = data.bio;
                  if (data.linkedin_url)     profileUpdates.linkedin_url     = data.linkedin_url;
                  if (data.hourly_rate)      profileUpdates.hourly_rate      = data.hourly_rate;
                  if (data.years_experience) profileUpdates.years_experience = data.years_experience;
                  if (data.skills?.length)   profileUpdates.skills           = data.skills;
                  if (Object.keys(profileUpdates).length) {
                    await supabase.from('consultant_profiles').update(profileUpdates).eq('id', targetUserId);
                    setCpData(prev => prev ? { ...prev, ...profileUpdates } : prev);
                  }
                  // Add work experience companies
                  const newCustomers = [];
                  for (const exp of (data.work_experience ?? [])) {
                    if (!exp.company_name) continue;
                    const { data: ins } = await supabase.from('consultant_customers')
                      .insert({ consultant_id: targetUserId, company_name: exp.company_name, role_held: exp.role_held ?? null, start_date: exp.start_date ?? null, end_date: exp.end_date ?? null, description: exp.description ?? null })
                      .select().single();
                    if (ins) newCustomers.push(ins);
                  }
                  // Auto-create companies for consulting_company found in projects
                  const existingNames = new Set([
                    ...(cpData?.consultant_customers ?? []).map(c => c.company_name.toLowerCase()),
                    ...newCustomers.map(c => c.company_name.toLowerCase()),
                  ]);
                  const seenCo = new Set();
                  for (const proj of (data.projects ?? [])) {
                    const co = proj.consulting_company?.trim();
                    if (co && !existingNames.has(co.toLowerCase()) && !seenCo.has(co.toLowerCase())) {
                      seenCo.add(co.toLowerCase());
                      const { data: ins } = await supabase.from('consultant_customers')
                        .insert({ consultant_id: targetUserId, company_name: co }).select().single();
                      if (ins) newCustomers.push(ins);
                    }
                  }
                  // Add projects
                  const newProjects = [];
                  for (const proj of (data.projects ?? [])) {
                    if (!proj.title) continue;
                    const { data: ins } = await supabase.from('consultant_projects')
                      .insert({ consultant_id: targetUserId, title: proj.title, consulting_company: proj.consulting_company ?? null, client_name: proj.client_name ?? null, role: proj.role ?? null, description: proj.description ?? null, tech_stack: proj.tech_stack ?? [], url: proj.url ?? null })
                      .select().single();
                    if (ins) newProjects.push(ins);
                  }
                  // Update local state
                  setCpData(prev => prev ? {
                    ...prev,
                    consultant_customers: [...(prev.consultant_customers ?? []), ...newCustomers],
                    consultant_projects:  [...(prev.consultant_projects  ?? []), ...newProjects],
                  } : prev);
                }} />
              )}

              {/* Edit form */}
              {cpEditingProj && (
                <div className="border border-blue-200 bg-blue-50 rounded-2xl p-4">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-3">Edit Project</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input label={t("label.title")} value={cpEditingProj.title ?? ''} onChange={e => setCpEditingProj(p => ({ ...p, title: e.target.value }))} />
                    <Input label="Role" value={cpEditingProj.role ?? ''} onChange={e => setCpEditingProj(p => ({ ...p, role: e.target.value }))} />
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Consulting Company</label>
                      <select value={cpEditingProj.consulting_company ?? ''}
                        onChange={e => setCpEditingProj(p => ({ ...p, consulting_company: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">— None —</option>
                        {(cpData?.consultant_customers ?? []).map(c => (
                          <option key={c.id} value={c.company_name}>{c.company_name}</option>
                        ))}
                      </select>
                    </div>
                    <Input label={t("profile.client_name")} value={cpEditingProj.client_name ?? ''} onChange={e => setCpEditingProj(p => ({ ...p, client_name: e.target.value }))} />
                    <Input label={t("profile.tech_stack")} value={cpEditingProj._tech ?? ''} onChange={e => setCpEditingProj(p => ({ ...p, _tech: e.target.value }))} placeholder="React, Node.js, …" />
                    <Input label={t("profile.url")} value={cpEditingProj.url ?? ''} onChange={e => setCpEditingProj(p => ({ ...p, url: e.target.value }))} />
                  </div>
                  <Textarea label={t("label.description")} value={cpEditingProj.description ?? ''} onChange={e => setCpEditingProj(p => ({ ...p, description: e.target.value }))} />
                  <div className="flex gap-2 mt-2">
                    <button onClick={handleCpSaveProj} disabled={cpSaving}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50">
                      {cpSaving ? t("profile.saving") : t("action.save")}
                    </button>
                    <button onClick={() => setCpEditingProj(null)}
                      className="px-3 py-1.5 border border-gray-200 text-xs font-semibold text-gray-600 rounded-lg hover:bg-gray-50">
                      {t("action.cancel")}
                    </button>
                  </div>
                </div>
              )}

              {/* Work Experience Companies */}
              {isOwnProfile && (
                <div className="border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("profile.past_customers")}</span>
                    {!cpNewCust && !cpEditingCust && (
                      <button onClick={() => setCpNewCust({ ...EMPTY_CP_CUST })}
                        className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
                        <Plus className="w-3.5 h-3.5" />{t("profile.add_customer_btn")}
                      </button>
                    )}
                  </div>

                  {/* Add company form */}
                  {cpNewCust && (
                    <div className="p-4 bg-green-50 border-b border-green-100">
                      <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-3">{t("profile.add_customer")}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Input label={t("profile.company_name")} value={cpNewCust.company_name} onChange={e => setCpNewCust(p => ({ ...p, company_name: e.target.value }))} />
                        <Input label={t("profile.role_held")} value={cpNewCust.role_held} onChange={e => setCpNewCust(p => ({ ...p, role_held: e.target.value }))} />
                        <Input label={t("label.start_date")} type="date" value={cpNewCust.start_date} onChange={e => setCpNewCust(p => ({ ...p, start_date: e.target.value }))} />
                        <Input label={t("label.end_date")} type="date" value={cpNewCust.end_date} onChange={e => setCpNewCust(p => ({ ...p, end_date: e.target.value }))} placeholder={t("profile.blank_if_curr")} />
                      </div>
                      <Textarea label={t("label.description")} value={cpNewCust.description} onChange={e => setCpNewCust(p => ({ ...p, description: e.target.value }))} />
                      <div className="flex gap-2 mt-2">
                        <button onClick={handleCpAddCust} disabled={cpSaving || !cpNewCust.company_name}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50">
                          {cpSaving ? t("profile.saving") : t("profile.add_customer_btn")}
                        </button>
                        <button onClick={() => setCpNewCust(null)}
                          className="px-3 py-1.5 border border-gray-200 text-xs font-semibold text-gray-600 rounded-lg hover:bg-gray-50">
                          {t("action.cancel")}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Company list */}
                  {(cpData?.consultant_customers?.length ?? 0) === 0 && !cpNewCust ? (
                    <p className="text-sm text-gray-400 p-4">{t("profile.no_customers")}</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {(cpData?.consultant_customers ?? []).map(c => (
                        <div key={c.id} className="p-4">
                          {cpEditingCust?.id === c.id ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <Input label={t("profile.company_name")} value={cpEditingCust.company_name} onChange={e => setCpEditingCust(p => ({ ...p, company_name: e.target.value }))} />
                                <Input label={t("profile.role_held")} value={cpEditingCust.role_held ?? ''} onChange={e => setCpEditingCust(p => ({ ...p, role_held: e.target.value }))} />
                                <Input label={t("label.start_date")} type="date" value={cpEditingCust.start_date ?? ''} onChange={e => setCpEditingCust(p => ({ ...p, start_date: e.target.value }))} />
                                <Input label={t("label.end_date")} type="date" value={cpEditingCust.end_date ?? ''} onChange={e => setCpEditingCust(p => ({ ...p, end_date: e.target.value }))} />
                              </div>
                              <Textarea label={t("label.description")} value={cpEditingCust.description ?? ''} onChange={e => setCpEditingCust(p => ({ ...p, description: e.target.value }))} />
                              <div className="flex gap-2">
                                <button onClick={handleCpSaveCust} disabled={cpSaving}
                                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50">
                                  {cpSaving ? t("profile.saving") : t("action.save")}
                                </button>
                                <button onClick={() => setCpEditingCust(null)}
                                  className="px-3 py-1.5 border border-gray-200 text-xs font-semibold text-gray-600 rounded-lg hover:bg-gray-50">
                                  {t("action.cancel")}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-medium text-sm text-gray-900">{c.company_name}</div>
                                {c.role_held && <div className="text-xs text-gray-500 mt-0.5">{c.role_held}</div>}
                                {(c.start_date || c.end_date) && (
                                  <div className="text-xs text-gray-400 mt-0.5">
                                    {c.start_date ? new Date(c.start_date).toLocaleDateString(undefined, { year:'numeric', month:'short' }) : ''}
                                    {' – '}
                                    {c.end_date ? new Date(c.end_date).toLocaleDateString(undefined, { year:'numeric', month:'short' }) : t("label.present")}
                                  </div>
                                )}
                                {c.description && <p className="text-xs text-gray-500 mt-1">{c.description}</p>}
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                <button onClick={() => { setCpNewCust(null); setCpEditingCust({ ...c }); }}
                                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => handleCpDeleteCust(c.id)}
                                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Projects list */}
              {(cpData?.consultant_projects?.length ?? 0) === 0
                ? <p className="text-sm text-gray-400">{t("profile.no_projects")}</p>
                : <ConsultantProjectsHierarchy
                    projects={cpData.consultant_projects}
                    onEdit={isOwnProfile ? p => { setCpNewProj(null); setCpEditingProj({ ...p, _tech: p.tech_stack?.join(', ') ?? '' }); } : undefined}
                    onDelete={isOwnProfile ? handleCpDeleteProj : undefined}
                    onToggleFeatured={isOwnProfile ? handleCpToggleFeatured : undefined}
                  />}

              {/* Add project */}
              {isOwnProfile && (
                cpNewProj ? (
                  <div className="border border-green-200 bg-green-50 rounded-2xl p-4">
                    <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-3">{t("profile.add_project")}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input label={t("label.title")} value={cpNewProj.title} onChange={e => setCpNewProj(p => ({ ...p, title: e.target.value }))} />
                      <Input label="Role" value={cpNewProj.role} onChange={e => setCpNewProj(p => ({ ...p, role: e.target.value }))} />
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Consulting Company</label>
                        <select value={cpNewProj.consulting_company}
                          onChange={e => setCpNewProj(p => ({ ...p, consulting_company: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="">— None —</option>
                          {(cpData?.consultant_customers ?? []).map(c => (
                            <option key={c.id} value={c.company_name}>{c.company_name}</option>
                          ))}
                        </select>
                      </div>
                      <Input label={t("profile.client_name")} value={cpNewProj.client_name} onChange={e => setCpNewProj(p => ({ ...p, client_name: e.target.value }))} />
                      <Input label={t("profile.tech_stack")} value={cpNewProj._tech} onChange={e => setCpNewProj(p => ({ ...p, _tech: e.target.value }))} placeholder="React, Node.js, …" />
                      <Input label={t("profile.url")} value={cpNewProj.url} onChange={e => setCpNewProj(p => ({ ...p, url: e.target.value }))} />
                    </div>
                    <Textarea label={t("label.description")} value={cpNewProj.description} onChange={e => setCpNewProj(p => ({ ...p, description: e.target.value }))} />
                    <div className="flex gap-2 mt-2">
                      <button onClick={handleCpAddProj} disabled={cpSaving || !cpNewProj.title}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50">
                        {cpSaving ? t("profile.saving") : t("profile.add_project_btn")}
                      </button>
                      <button onClick={() => setCpNewProj(null)}
                        className="px-3 py-1.5 border border-gray-200 text-xs font-semibold text-gray-600 rounded-lg hover:bg-gray-50">
                        {t("action.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setCpEditingProj(null); setCpNewProj({ ...EMPTY_CP_PROJ }); }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-semibold text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors">
                    <Plus className="w-4 h-4" />
                    {t("profile.add_project_btn")}
                  </button>
                )
              )}
            </div>
          )}

          {/* Skills */}
          {tab.id === 'skills' && (
            <div className="space-y-4">
              {(cpData?.skills?.length ?? 0) === 0
                ? <p className="text-sm text-gray-400">{t("profile.no_skills")}</p>
                : <div className="flex flex-wrap gap-2">
                    {(cpData.skills ?? []).map(s => {
                      const isFeatured = (cpData?.featured_skills ?? []).includes(s);
                      return (
                        <div key={s} className={`flex items-center rounded-xl text-sm font-medium border ${isFeatured ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-100"}`}>
                          {isOwnProfile ? (
                            <button onClick={async () => {
                              const cur = cpData?.featured_skills ?? [];
                              const next = isFeatured ? cur.filter(f => f !== s) : [...cur, s];
                              await supabase.from('consultant_profiles').update({ featured_skills: next }).eq('id', targetUserId);
                              setCpData(p => p ? { ...p, featured_skills: next } : p);
                            }} title={isFeatured ? "Remove from highlights" : "Add to highlights"}
                              className="flex items-center gap-1.5 px-3 py-1.5 transition-colors hover:opacity-80">
                              <Star className="w-3 h-3 flex-shrink-0" fill={isFeatured ? "currentColor" : "none"} />
                              {s}
                            </button>
                          ) : (
                            <span className="flex items-center gap-1.5 px-3 py-1.5">
                              {isFeatured && <Star className="w-3 h-3 flex-shrink-0" fill="currentColor" />}{s}
                            </span>
                          )}
                          {isOwnProfile && (
                            <button onClick={async () => {
                              const nextSkills   = (cpData?.skills ?? []).filter(sk => sk !== s);
                              const nextFeatured = (cpData?.featured_skills ?? []).filter(f => f !== s);
                              await supabase.from('consultant_profiles').update({ skills: nextSkills, featured_skills: nextFeatured }).eq('id', targetUserId);
                              setCpData(p => p ? { ...p, skills: nextSkills, featured_skills: nextFeatured } : p);
                            }} title="Remove skill"
                              className="pr-2 pl-0.5 py-1.5 hover:text-red-500 transition-colors">
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>}
              {isOwnProfile && (
                <>
                  <p className="text-xs text-gray-400">Tap a skill to highlight it. Star = featured in your overview.</p>
                  <div className="flex gap-2">
                    <input id="cp-skill-input" placeholder={t("profile.skill_ph")}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onKeyDown={async e => {
                        if (e.key !== 'Enter') return;
                        const val = e.target.value.trim();
                        if (!val) return;
                        const current = cpData?.skills ?? [];
                        if (current.includes(val)) return;
                        const next = [...current, val];
                        await supabase.from('consultant_profiles').update({ skills: next }).eq('id', targetUserId);
                        setCpData(p => p ? { ...p, skills: next } : p);
                        e.target.value = '';
                      }} />
                    <button onClick={async () => {
                      const input = document.getElementById('cp-skill-input');
                      const val = input?.value?.trim();
                      if (!val) return;
                      const current = cpData?.skills ?? [];
                      if (current.includes(val)) return;
                      const next = [...current, val];
                      await supabase.from('consultant_profiles').update({ skills: next }).eq('id', targetUserId);
                      setCpData(p => p ? { ...p, skills: next } : p);
                      input.value = '';
                    }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl">
                      {t("profile.add_skill")}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

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
              {tabs.map((tab, i) => {
                const Icon = tab.icon;
                const isActive = tab.id === section;
                const st = cvTabStatus[tab.id];
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
  );
}

export { ConsultantProfileView };
