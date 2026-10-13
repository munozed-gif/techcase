import { useState, useEffect, useRef } from "react";
import { AlertCircle, CheckCircle2, Clock, MessageSquare, ChevronLeft, ChevronRight, Loader2, ExternalLink, ThumbsUp } from "lucide-react";
import { supabase } from "../lib/supabase.js";

const SPEC_TABS = [
  { key: 'a',     prefix: 'SpecA_',      label: 'Spec A',    desc: 'Custom ABAP' },
  { key: 'b',     prefix: 'SpecB_',      label: 'Spec B',    desc: 'Standard SAP' },
  { key: 'c',     prefix: 'SpecC_',      label: 'Spec C',    desc: 'Customer Proposal' },
  { key: 'd',     prefix: 'SpecD_',      label: 'Spec D',    desc: 'Client Spec' },
  { key: 'proto', prefix: 'Prototype_',  label: 'Prototype', desc: 'Interactive' },
];

export default function CustomerSpecReviewView({ token }) {
  const [tokenData, setTokenData] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(null);
  const [branding, setBranding] = useState({ name: 'TechCase', tagline: 'SAP Solutions' });
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [docContents, setDocContents] = useState({});
  const [docLoading, setDocLoading] = useState({});
  const tabBarRef = useRef(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [brandRes, tokenRes] = await Promise.all([
          supabase.from('system_settings').select('key, value').in('key', ['platform_name', 'platform_tagline']),
          supabase.from('spec_review_tokens').select('*').eq('token', token).single(),
        ]);

        if (brandRes.data) {
          const map = Object.fromEntries(brandRes.data.map(r => [r.key, r.value]));
          setBranding({ name: map.platform_name || 'TechCase', tagline: map.platform_tagline || 'SAP Solutions' });
        }

        if (tokenRes.error || !tokenRes.data) {
          setError('Review link not found or has expired.');
          setLoading(false);
          return;
        }

        const tkn = tokenRes.data;
        setTokenData(tkn);

        const docIds = tkn.doc_ids ?? {};
        const allDocIds = Object.values(docIds).filter(Boolean);

        if (allDocIds.length > 0) {
          const { data: docs } = await supabase
            .from('case_documents')
            .select('id, file_name, file_url, file_type')
            .in('id', allDocIds);
          setDocuments(docs ?? []);
          const firstTab = SPEC_TABS.find(tab => docIds[tab.key]);
          if (firstTab) setActiveTab(firstTab.key);
        }
      } catch (e) {
        setError(e.message || 'Failed to load review.');
      } finally {
        setLoading(false);
      }
    }
    if (token) load();
  }, [token]);

  // Lazily fetch HTML content for each document
  useEffect(() => {
    if (!activeTab || !tokenData) return;
    const docId = tokenData.doc_ids?.[activeTab];
    if (!docId || docContents[docId] !== undefined) return;
    const doc = documents.find(d => d.id === docId);
    if (!doc?.file_url) return;

    setDocLoading(prev => ({ ...prev, [docId]: true }));
    fetch(doc.file_url)
      .then(r => r.text())
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
        .eq('token', token)
        .eq('status', 'pending');
      if (upErr) throw upErr;
      setTokenData(p => ({ ...p, status: 'approved' }));
    } catch (e) {
      alert(e.message || 'Failed to submit approval.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestChanges() {
    if (!feedback.trim()) { setShowFeedback(true); return; }
    setSubmitting(true);
    try {
      const { error: upErr } = await supabase
        .from('spec_review_tokens')
        .update({ status: 'changes_requested', feedback })
        .eq('token', token)
        .eq('status', 'pending');
      if (upErr) throw upErr;
      setTokenData(p => ({ ...p, status: 'changes_requested' }));
    } catch (e) {
      alert(e.message || 'Failed to submit feedback.');
    } finally {
      setSubmitting(false);
    }
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
          <h2 className="text-white text-lg font-bold mb-2">Link not found</h2>
          <p className="text-gray-400 text-sm leading-relaxed">{error}</p>
          <p className="text-gray-500 text-xs mt-3">If you believe this is a mistake, please contact the team that sent you this link.</p>
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
          <h2 className="text-white text-xl font-bold mb-2">Specs Approved</h2>
          <p className="text-gray-400 text-sm leading-relaxed">Thank you for your review. The team has been notified of your approval and will proceed with implementation.</p>
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
          <h2 className="text-white text-xl font-bold mb-2">Feedback Received</h2>
          <p className="text-gray-400 text-sm leading-relaxed">Your change request has been sent to the team. They will review your feedback and reach out shortly.</p>
          {tokenData.feedback && (
            <div className="mt-4 p-3 rounded-xl text-left" style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)' }}>
              <p className="text-gray-300 text-xs leading-relaxed">{tokenData.feedback}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const availableTabs = SPEC_TABS.filter(tab => tokenData?.doc_ids?.[tab.key]);
  const activeDocId = tokenData?.doc_ids?.[activeTab];
  const activeDocContent = activeDocId ? docContents[activeDocId] : undefined;
  const activeDocIsLoading = activeDocId ? docLoading[activeDocId] : false;
  const daysLeft = tokenData?.expires_at
    ? Math.ceil((new Date(tokenData.expires_at) - Date.now()) / 86400000)
    : null;

  return (
    <div style={BG}>
      {/* ── Header ── */}
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
          <p className="text-gray-400 text-xs">Spec Review</p>
          <p className="text-white text-sm font-semibold truncate">{tokenData?.case_title || 'Case Review'}</p>
        </div>
        {daysLeft !== null && daysLeft <= 7 && (
          <div className="flex-shrink-0 text-xs text-amber-400 flex items-center gap-1">
            <Clock size={11} />{daysLeft}d left
          </div>
        )}
      </header>

      {/* ── Tab bar ── */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,.08)', background: 'rgba(11,15,26,.85)', position: 'sticky', top: '55px', zIndex: 19 }}
        className="flex items-center">
        <button onClick={() => scrollTabs(-1)} className="flex-shrink-0 p-2 text-gray-500 hover:text-white transition-colors">
          <ChevronLeft size={16} />
        </button>
        <div ref={tabBarRef} className="flex items-center gap-0 overflow-x-auto flex-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {availableTabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={activeTab === tab.key
                ? { borderBottom: '2px solid #4F6EF7', color: '#818CF8', background: 'rgba(79,110,247,.08)' }
                : { borderBottom: '2px solid transparent', color: '#6B7280' }}
              className="flex items-center gap-2 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all hover:text-white flex-shrink-0">
              <span>{tab.label}</span>
              <span className="hidden sm:block opacity-60" style={{ fontSize: '10px' }}>{tab.desc}</span>
            </button>
          ))}
        </div>
        <button onClick={() => scrollTabs(1)} className="flex-shrink-0 p-2 text-gray-500 hover:text-white transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* ── Document viewer ── */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', background: '#fff' }}>
        {activeDocIsLoading && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#f9fafb', zIndex: 5 }}>
            <Loader2 size={24} className="animate-spin text-blue-600" />
          </div>
        )}
        {!activeTab && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400">
            <p className="text-sm">No documents available for review.</p>
          </div>
        )}
        {activeTab && activeDocContent === null && !activeDocIsLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-2">
            <AlertCircle size={20} />
            <p className="text-sm">Failed to load document.</p>
          </div>
        )}
        {activeTab && activeDocContent && (
          <iframe
            key={activeDocId}
            srcDoc={activeDocContent}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block', minHeight: 'calc(100dvh - 200px)' }}
            title={`Spec ${activeTab}`}
            sandbox="allow-scripts allow-forms allow-popups allow-modals"
          />
        )}
      </div>

      {/* ── Action footer ── */}
      <div style={{ borderTop: '1px solid rgba(79,110,247,.2)', background: 'rgba(11,15,26,.98)', position: 'sticky', bottom: 0 }}
        className="px-4 py-3">
        {showFeedback && (
          <textarea value={feedback} onChange={e => setFeedback(e.target.value)}
            className="w-full mb-3 p-3 rounded-xl text-sm text-white resize-none focus:outline-none"
            style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.15)' }}
            rows={2}
            placeholder="Describe the changes needed…"
            autoFocus />
        )}
        <div className="flex items-center gap-3 justify-between">
          <p className="text-gray-500 text-xs hidden sm:block">
            Review all {availableTabs.length} spec{availableTabs.length !== 1 ? 's' : ''} before submitting your decision.
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => {
                if (showFeedback && feedback.trim()) { handleRequestChanges(); }
                else { setShowFeedback(p => !p); }
              }}
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl text-white disabled:opacity-50 transition-colors"
              style={{ background: showFeedback ? 'rgba(245,158,11,.25)' : 'rgba(255,255,255,.08)', border: '1px solid rgba(245,158,11,.35)' }}>
              <MessageSquare size={13} />
              {submitting && showFeedback && feedback.trim()
                ? 'Sending…'
                : showFeedback
                  ? (feedback.trim() ? 'Submit Changes' : 'Add feedback…')
                  : 'Request Changes'}
            </button>
            <button onClick={handleApprove} disabled={submitting}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-xl text-white disabled:opacity-50 transition-colors"
              style={{ background: '#16A34A', border: '1px solid rgba(22,163,74,.5)' }}>
              {submitting && !showFeedback
                ? <Loader2 size={13} className="animate-spin" />
                : <ThumbsUp size={13} />}
              Approve Specs
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
