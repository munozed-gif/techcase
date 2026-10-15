import { useState, useEffect, useRef } from "react";
import { AlertCircle, CheckCircle2, Clock, MessageSquare, ChevronLeft, ChevronRight, Loader2, ThumbsUp, FileText, Code2, Users, LayoutTemplate, Cpu, ArrowRight, User, Briefcase, Tag, Calendar, FolderOpen, Globe } from "lucide-react";
import { supabase } from "../lib/supabase.js";

const REVIEW_LANGS = {
  en: {
    specReview:         'Spec Review',
    funcSpecReview:     'Functional Specification Review',
    docsGenerated:      'Documents Generated',
    reviewAll:          n => `Review all ${n} spec${n !== 1 ? 's' : ''} before submitting your decision.`,
    approveSpecs:       'Approve Specs',
    requestChanges:     'Request Changes',
    addFeedback:        'Add feedback…',
    submitChanges:      'Submit Changes',
    feedbackPh:         'Describe the changes needed…',
    sending:            'Sending…',
    approvedTitle:      'Specs Approved',
    approvedMsg:        'Thank you for your review. The team has been notified of your approval and will proceed with implementation.',
    feedbackTitle:      'Feedback Received',
    feedbackMsg:        'Your change request has been sent to the team. They will review your feedback and reach out shortly.',
    linkNotFound:       'Link not found',
    linkExpired:        'Review link not found or has expired.',
    linkContact:        'If you believe this is a mistake, please contact the team that sent you this link.',
    failedLoad:         'Failed to load document.',
    failedReview:       'Failed to load review.',
    overview:           'Overview',
    daysLeft:           d => `${d}d left`,
    lblProject:         'Project',
    lblModule:          'SAP Module',
    lblIndustry:        'Industry',
    lblPriority:        'Priority',
    lblDueDate:         'Due Date',
    lblPreparedBy:      'Prepared by',
    tabDescA:           'Custom ABAP development approach — RICEFW objects, technical design, and implementation plan.',
    tabDescB:           'Standard SAP configuration path — recommended transactions, Customizing settings, and best practices.',
    tabDescC:           'Customer-facing proposal with executive summary, scope, effort estimates, and investment breakdown.',
    tabDescD:           'Client-ready specification with use cases, acceptance criteria, and delivery timeline.',
    tabDescProto:       'Interactive HTML prototype simulating the proposed SAP screen or Fiori app for stakeholder review.',
  },
  es: {
    specReview:         'Revisión de Especificación',
    funcSpecReview:     'Revisión de Especificación Funcional',
    docsGenerated:      'Documentos Generados',
    reviewAll:          n => `Revisa los ${n} documento${n !== 1 ? 's' : ''} antes de enviar tu decisión.`,
    approveSpecs:       'Aprobar Especificaciones',
    requestChanges:     'Solicitar Cambios',
    addFeedback:        'Agregar comentarios…',
    submitChanges:      'Enviar Cambios',
    feedbackPh:         'Describe los cambios necesarios…',
    sending:            'Enviando…',
    approvedTitle:      'Especificaciones Aprobadas',
    approvedMsg:        'Gracias por tu revisión. El equipo ha sido notificado de tu aprobación y procederá con la implementación.',
    feedbackTitle:      'Comentarios Recibidos',
    feedbackMsg:        'Tu solicitud de cambios fue enviada al equipo. Revisarán tus comentarios y se pondrán en contacto pronto.',
    linkNotFound:       'Enlace no encontrado',
    linkExpired:        'El enlace de revisión no fue encontrado o ha expirado.',
    linkContact:        'Si crees que esto es un error, contacta al equipo que te envió este enlace.',
    failedLoad:         'No se pudo cargar el documento.',
    failedReview:       'No se pudo cargar la revisión.',
    overview:           'Resumen',
    daysLeft:           d => `${d}d restantes`,
    lblProject:         'Proyecto',
    lblModule:          'Módulo SAP',
    lblIndustry:        'Industria',
    lblPriority:        'Prioridad',
    lblDueDate:         'Fecha límite',
    lblPreparedBy:      'Preparado por',
    tabDescA:           'Enfoque de desarrollo ABAP personalizado — objetos RICEFW, diseño técnico y plan de implementación.',
    tabDescB:           'Ruta de configuración SAP estándar — transacciones recomendadas, parametrización Customizing y mejores prácticas.',
    tabDescC:           'Propuesta orientada al cliente con resumen ejecutivo, alcance, estimaciones de esfuerzo y desglose de inversión.',
    tabDescD:           'Especificación lista para el cliente con casos de uso, criterios de aceptación y cronograma de entrega.',
    tabDescProto:       'Prototipo HTML interactivo que simula la pantalla SAP o app Fiori propuesta para revisión de stakeholders.',
  },
};

const SUPPORTED_REVIEW_LANGS = ['en', 'es'];

function getInitialReviewLang() {
  try {
    const saved = localStorage.getItem('tc_lang');
    if (saved && REVIEW_LANGS[saved]) return saved;
  } catch {}
  const nav = (navigator.language || 'en').split('-')[0];
  return REVIEW_LANGS[nav] ? nav : 'en';
}

export default function CustomerSpecReviewView({ token }) {
  const [tokenData, setTokenData]     = useState(null);
  const [caseDetails, setCaseDetails] = useState(null);
  const [creatorName, setCreatorName] = useState(null);
  const [documents, setDocuments]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [activeTab, setActiveTab]     = useState(null); // null = overview screen
  const [branding, setBranding]       = useState({ name: 'TechCase', tagline: 'SAP Solutions' });
  const [submitting, setSubmitting]   = useState(false);
  const [feedback, setFeedback]       = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [docContents, setDocContents] = useState({});
  const [docLoading, setDocLoading]   = useState({});
  const [reviewLang, setReviewLang]   = useState(getInitialReviewLang);
  const tabBarRef = useRef(null);

  const L = REVIEW_LANGS[reviewLang] ?? REVIEW_LANGS.en;

  function toggleLang() {
    const next = SUPPORTED_REVIEW_LANGS[(SUPPORTED_REVIEW_LANGS.indexOf(reviewLang) + 1) % SUPPORTED_REVIEW_LANGS.length];
    setReviewLang(next);
    try { localStorage.setItem('tc_lang', next); } catch {}
  }

  const SPEC_TABS_L = [
    { key: 'a',     label: 'Spec A',    desc: 'Custom ABAP',      detail: L.tabDescA,     Icon: Code2,          color: '#6366F1' },
    { key: 'b',     label: 'Spec B',    desc: 'Standard SAP',     detail: L.tabDescB,     Icon: Cpu,            color: '#0EA5E9' },
    { key: 'c',     label: 'Spec C',    desc: L.lblProject ? 'Customer' : 'Customer', detail: L.tabDescC, Icon: Users, color: '#10B981' },
    { key: 'd',     label: 'Spec D',    desc: 'Client Spec',      detail: L.tabDescD,     Icon: FileText,       color: '#F59E0B' },
    { key: 'proto', label: 'Prototype', desc: 'Interactive',      detail: L.tabDescProto, Icon: LayoutTemplate, color: '#EC4899' },
  ];

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [brandRes, tokenRes] = await Promise.all([
          supabase.from('system_settings').select('key, value').in('key', ['platform_name', 'platform_tagline']),
          supabase.from('spec_review_tokens').select('*').eq('token', token).single(),
        ]);

        if (tokenRes.error || !tokenRes.data) {
          setError(REVIEW_LANGS[getInitialReviewLang()]?.linkExpired ?? 'Review link not found or has expired.');
          setLoading(false);
          return;
        }

        const tkn = tokenRes.data;
        setTokenData(tkn);

        // Use branding embedded in token first (RLS blocks anon reads of system_settings)
        const tokenPlatform = tkn.doc_ids?._platform;
        if (tokenPlatform?.name) {
          setBranding({ name: tokenPlatform.name, tagline: tokenPlatform.tagline || 'SAP Solutions' });
        } else if (brandRes.data?.length) {
          const map = Object.fromEntries(brandRes.data.map(r => [r.key, r.value]));
          setBranding({ name: map.platform_name || 'TechCase', tagline: map.platform_tagline || 'SAP Solutions' });
        }

        // Fetch case details (accessible via anon policy for tokens)
        if (tkn.case_id) {
          const { data: cd } = await supabase
            .from('cases')
            .select('description, area_sap, area_industry, priority, due_date, projects(name)')
            .eq('id', tkn.case_id)
            .maybeSingle();
          if (cd) setCaseDetails(cd);
        }

        // Try to get creator's name from users table (may not be anon-accessible)
        if (tkn.created_by) {
          try {
            const { data: creator } = await supabase
              .from('users')
              .select('full_name')
              .eq('id', tkn.created_by)
              .maybeSingle();
            if (creator?.full_name) setCreatorName(creator.full_name);
          } catch (_) {}
        }

        const docIds = tkn.doc_ids ?? {};
        const allDocIds = Object.entries(docIds)
          .filter(([k]) => k !== '_platform')
          .map(([, v]) => v)
          .filter(v => v && typeof v === 'string');
        if (allDocIds.length > 0) {
          const { data: docs } = await supabase
            .from('case_documents')
            .select('id, file_name, file_url, file_type')
            .in('id', allDocIds);
          setDocuments(docs ?? []);
        }
      } catch (e) {
        setError(e.message || (REVIEW_LANGS[getInitialReviewLang()]?.failedReview ?? 'Failed to load review.'));
      } finally {
        setLoading(false);
      }
    }
    if (token) load();
  }, [token]);

  // Lazily fetch HTML content when a tab becomes active
  useEffect(() => {
    if (!activeTab || !tokenData) return;
    const docId = tokenData.doc_ids?.[activeTab];
    if (!docId || docContents[docId] !== undefined) return;
    const doc = documents.find(d => d.id === docId);
    if (!doc?.file_url) return;
    setDocLoading(prev => ({ ...prev, [docId]: true }));
    fetch(doc.file_url)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
      .then(html => setDocContents(prev => ({ ...prev, [docId]: html })))
      .catch(() => setDocContents(prev => ({ ...prev, [docId]: null })))
      .finally(() => setDocLoading(prev => ({ ...prev, [docId]: false })));
  }, [activeTab, tokenData, documents, docContents]);

  async function handleApprove() {
    setSubmitting(true);
    try {
      const { error: upErr } = await supabase
        .from('spec_review_tokens')
        .update({ status: 'approved', approved_at: new Date().toISOString(), feedback: feedback || null })
        .eq('token', token).eq('status', 'pending');
      if (upErr) throw upErr;
      setTokenData(p => ({ ...p, status: 'approved' }));
    } catch (e) { alert(e.message || 'Failed to submit approval.'); }
    finally { setSubmitting(false); }
  }

  async function handleRequestChanges() {
    if (!feedback.trim()) { setShowFeedback(true); return; }
    setSubmitting(true);
    try {
      const { error: upErr } = await supabase
        .from('spec_review_tokens')
        .update({ status: 'changes_requested', feedback })
        .eq('token', token).eq('status', 'pending');
      if (upErr) throw upErr;
      setTokenData(p => ({ ...p, status: 'changes_requested' }));
    } catch (e) { alert(e.message || 'Failed to submit feedback.'); }
    finally { setSubmitting(false); }
  }

  function scrollTabs(dir) {
    tabBarRef.current?.scrollBy({ left: dir * 140, behavior: 'smooth' });
  }

  const BG = {
    minHeight: '100dvh',
    background: '#0B0F1A',
    backgroundImage: 'radial-gradient(circle at 70% -10%,rgba(79,110,247,.22) 0%,transparent 65%)',
    display: 'flex',
    flexDirection: 'column',
  };

  if (loading) {
    return (
      <div style={BG} className="items-center justify-center flex">
        <div className="w-8 h-8 border-4 border-blue-800 border-t-blue-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={BG} className="flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-red-900/40 border border-red-700/40 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={24} className="text-red-400" />
          </div>
          <h2 className="text-white text-lg font-bold mb-2">{L.linkNotFound}</h2>
          <p className="text-gray-400 text-sm leading-relaxed">{error}</p>
          <p className="text-gray-500 text-xs mt-3">{L.linkContact}</p>
        </div>
      </div>
    );
  }

  if (tokenData?.status === 'approved') {
    return (
      <div style={BG} className="flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-green-900/40 border border-green-700/40 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={28} className="text-green-400" />
          </div>
          <h2 className="text-white text-xl font-bold mb-2">{L.approvedTitle}</h2>
          <p className="text-gray-400 text-sm leading-relaxed">{L.approvedMsg}</p>
          {tokenData.approved_at && (
            <p className="text-gray-500 text-xs mt-4 flex items-center justify-center gap-1.5">
              <Clock size={11} />{new Date(tokenData.approved_at).toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' })}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (tokenData?.status === 'changes_requested') {
    return (
      <div style={BG} className="flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-amber-900/40 border border-amber-700/40 flex items-center justify-center mx-auto mb-4">
            <MessageSquare size={28} className="text-amber-400" />
          </div>
          <h2 className="text-white text-xl font-bold mb-2">{L.feedbackTitle}</h2>
          <p className="text-gray-400 text-sm leading-relaxed">{L.feedbackMsg}</p>
          {tokenData.feedback && (
            <div className="mt-4 p-3 rounded-xl text-left" style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)' }}>
              <p className="text-gray-300 text-xs leading-relaxed">{tokenData.feedback}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const availableTabs = SPEC_TABS_L.filter(tab => tokenData?.doc_ids?.[tab.key]);
  const activeDocId = tokenData?.doc_ids?.[activeTab];
  const activeDocContent = activeDocId ? docContents[activeDocId] : undefined;
  const activeDocIsLoading = activeDocId ? docLoading[activeDocId] : false;
  const daysLeft = tokenData?.expires_at
    ? Math.ceil((new Date(tokenData.expires_at) - Date.now()) / 86400000)
    : null;

  const HEADER = (
    <header style={{ borderBottom: '1px solid rgba(79,110,247,.2)', background: 'rgba(11,15,26,.97)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 20 }}
      className="px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center font-bold text-sm text-white"
          style={{ background: 'linear-gradient(135deg,#4F6EF7,#7C3AED)' }}>
          {branding.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm leading-none">{branding.name}</p>
          <p className="text-gray-500 text-xs mt-0.5">{branding.tagline}</p>
        </div>
      </div>
      <div className="text-right min-w-0 flex-1">
        <p className="text-gray-400 text-xs">{L.specReview}</p>
        <p className="text-white text-sm font-semibold truncate">{tokenData?.case_title || 'Case Review'}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {daysLeft !== null && daysLeft <= 7 && (
          <div className="text-xs text-amber-400 flex items-center gap-1">
            <Clock size={11} />{L.daysLeft(daysLeft)}
          </div>
        )}
        <button onClick={toggleLang} title="Change language"
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold text-gray-400 hover:text-white transition-colors"
          style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)' }}>
          <Globe size={11} />
          {reviewLang.toUpperCase()}
        </button>
      </div>
    </header>
  );

  const ACTION_FOOTER = (
    <div style={{ borderTop: '1px solid rgba(79,110,247,.2)', background: 'rgba(11,15,26,.98)', position: 'sticky', bottom: 0 }}
      className="px-4 py-3">
      {showFeedback && (
        <textarea value={feedback} onChange={e => setFeedback(e.target.value)}
          className="w-full mb-3 p-3 rounded-xl text-sm text-white resize-none focus:outline-none"
          style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.15)' }}
          rows={2} placeholder={L.feedbackPh} autoFocus />
      )}
      <div className="flex items-center gap-3 justify-between">
        <p className="text-gray-500 text-xs hidden sm:block">
          {L.reviewAll(availableTabs.length)}
        </p>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => { if (showFeedback && feedback.trim()) { handleRequestChanges(); } else { setShowFeedback(p => !p); } }}
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl text-white disabled:opacity-50 transition-colors"
            style={{ background: showFeedback ? 'rgba(245,158,11,.25)' : 'rgba(255,255,255,.08)', border: '1px solid rgba(245,158,11,.35)' }}>
            <MessageSquare size={13} />
            {submitting && showFeedback && feedback.trim() ? L.sending : showFeedback ? (feedback.trim() ? L.submitChanges : L.addFeedback) : L.requestChanges}
          </button>
          <button onClick={handleApprove} disabled={submitting}
            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-xl text-white disabled:opacity-50 transition-colors"
            style={{ background: '#16A34A', border: '1px solid rgba(22,163,74,.5)' }}>
            {submitting && !showFeedback ? <Loader2 size={13} className="animate-spin" /> : <ThumbsUp size={13} />}
            {L.approveSpecs}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Overview landing screen ──────────────────────────────────
  if (!activeTab) {
    const meta = [
      caseDetails?.projects?.name && { icon: FolderOpen, label: L.lblProject,    value: caseDetails.projects.name },
      caseDetails?.area_sap       && { icon: Cpu,        label: L.lblModule,     value: caseDetails.area_sap },
      caseDetails?.area_industry  && { icon: Briefcase,  label: L.lblIndustry,   value: caseDetails.area_industry },
      caseDetails?.priority       && { icon: Tag,        label: L.lblPriority,   value: caseDetails.priority.toUpperCase() },
      caseDetails?.due_date       && { icon: Calendar,   label: L.lblDueDate,    value: new Date(caseDetails.due_date + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) },
      creatorName                 && { icon: User,       label: L.lblPreparedBy, value: creatorName },
    ].filter(Boolean);

    return (
      <div style={BG}>
        {HEADER}

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

            {/* Case title + description */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'rgba(99,102,241,.8)' }}>{L.funcSpecReview}</p>
              <h1 className="text-2xl font-bold text-white leading-tight mb-3">{tokenData?.case_title || 'Case Review'}</h1>
              {caseDetails?.description && (
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(209,213,219,.75)' }}>{caseDetails.description}</p>
              )}
            </div>

            {/* Metadata grid */}
            {meta.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {meta.map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-3 rounded-xl p-3"
                    style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: 'rgba(79,110,247,.15)' }}>
                      <Icon size={13} className="text-indigo-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                      <p className="text-sm font-medium text-white truncate">{value}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Generated documents */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'rgba(156,163,175,.6)' }}>
                {L.docsGenerated} · {availableTabs.length}
              </p>
              <div className="space-y-2">
                {availableTabs.map(tab => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                    className="w-full flex items-center gap-4 rounded-xl p-4 text-left transition-all group"
                    style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = tab.color + '55'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)'}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: tab.color + '20', border: `1px solid ${tab.color}40` }}>
                      <tab.Icon size={18} style={{ color: tab.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold text-white">{tab.label}</p>
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: tab.color + '20', color: tab.color }}>{tab.desc}</span>
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: 'rgba(156,163,175,.75)' }}>{tab.detail}</p>
                    </div>
                    <ArrowRight size={15} className="text-gray-600 group-hover:text-gray-400 flex-shrink-0 transition-colors" />
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>

        {ACTION_FOOTER}
      </div>
    );
  }

  // ── Document viewer (tab is active) ─────────────────────────
  return (
    <div style={BG}>
      {HEADER}

      {/* Tab bar */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,.08)', background: 'rgba(11,15,26,.85)', position: 'sticky', top: '55px', zIndex: 19 }}
        className="flex items-center">
        <button onClick={() => setActiveTab(null)} className="flex-shrink-0 px-3 py-3 text-gray-500 hover:text-white transition-colors text-xs flex items-center gap-1.5 border-r"
          style={{ borderColor: 'rgba(255,255,255,.08)' }}>
          <ChevronLeft size={14} />{L.overview}
        </button>
        <button onClick={() => scrollTabs(-1)} className="flex-shrink-0 p-2 text-gray-500 hover:text-white transition-colors">
          <ChevronLeft size={16} />
        </button>
        <div ref={tabBarRef} className="flex items-center gap-0 overflow-x-auto flex-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {availableTabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={activeTab === tab.key
                ? { borderBottom: `2px solid ${tab.color}`, color: tab.color, background: tab.color + '12' }
                : { borderBottom: '2px solid transparent', color: '#6B7280' }}
              className="flex items-center gap-2 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all hover:text-white flex-shrink-0">
              <tab.Icon size={12} />
              <span>{tab.label}</span>
              <span className="hidden sm:block opacity-60" style={{ fontSize: '10px' }}>{tab.desc}</span>
            </button>
          ))}
        </div>
        <button onClick={() => scrollTabs(1)} className="flex-shrink-0 p-2 text-gray-500 hover:text-white transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Document viewer */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', background: '#fff' }}>
        {activeDocIsLoading && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#f9fafb', zIndex: 5 }}>
            <Loader2 size={24} className="animate-spin text-blue-600" />
          </div>
        )}
        {activeTab && activeDocContent === null && !activeDocIsLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-2">
            <AlertCircle size={20} />
            <p className="text-sm">{L.failedLoad}</p>
          </div>
        )}
        {activeTab && activeDocContent && (
          <iframe key={activeDocId} srcDoc={activeDocContent}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block', minHeight: 'calc(100dvh - 200px)' }}
            title={`Spec ${activeTab}`}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" />
        )}
      </div>

      {ACTION_FOOTER}
    </div>
  );
}
