import { useState } from "react";
import { Briefcase, Check, ChevronLeft, ChevronRight, Crosshair, Send, X } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { notify } from "../lib/utils.js";
import { Spinner } from "./ProfileComponents.jsx";

const STEPS = [
  { id: "overview",    label: "Case Overview" },
  { id: "proposal",    label: "Your Proposal" },
  { id: "confirm",     label: "Confirm & Send" },
];

export function HHProposalWizard({ caseData, auth, onComplete, onCancel }) {
  const [step, setStep]     = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);
  const [form, setForm]     = useState({
    message:                  "",
    candidate_count_estimate: "",
    proposed_commission_pct:  "15",
  });

  function patch(k, v) { setForm(p => ({ ...p, [k]: v })); }

  const isResourceNeed = caseData.case_type === "resource_need";
  const title          = caseData.title ?? "Untitled";
  const client         = caseData.client?.client_profiles?.company_name || caseData.client?.full_name || "—";

  async function submit() {
    setSaving(true);
    setError(null);
    const payload = {
      case_id:                  caseData.id,
      headhunter_id:            auth.user.id,
      message:                  form.message.trim() || null,
      candidate_count_estimate: form.candidate_count_estimate ? parseInt(form.candidate_count_estimate, 10) : null,
      proposed_commission_pct:  form.proposed_commission_pct ? parseFloat(form.proposed_commission_pct) : null,
    };
    const { error: err } = await supabase.from("hh_proposals").insert(payload);
    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }
    await notify(caseData.client_id ?? null, "New headhunter proposal", `${auth.user.full_name ?? "A headhunter"} submitted a proposal for "${title}".`).catch(() => {});
    onComplete?.();
  }

  const canNext = step < STEPS.length - 1;
  const canBack = step > 0;

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#EAF4FD,#F5F0FF)', display:'flex', alignItems:'center', justifyContent:'center', padding:'24px 16px' }}>
      <div style={{ width:'100%', maxWidth:560, background:'white', borderRadius:20, boxShadow:'0 8px 40px rgba(0,0,0,.10)', overflow:'hidden' }}>
        {/* Header */}
        <div style={{ background:'linear-gradient(135deg,#5B21B6,#7C3AED)', padding:'20px 24px', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:'50%', background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Crosshair size={18} color="white" />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ color:'white', fontSize:16, fontWeight:700 }}>Apply to Manage</div>
            <div style={{ color:'rgba(255,255,255,0.75)', fontSize:12 }}>Submit a headhunter proposal</div>
          </div>
          <button onClick={onCancel} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'white' }}>
            <X size={16} />
          </button>
        </div>

        {/* Step indicator */}
        <div style={{ display:'flex', borderBottom:'1px solid #F1F5F9', background:'#FAFAFA' }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'12px 8px' }}>
              <div style={{ width:24, height:24, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, background: i < step ? '#22C55E' : i === step ? '#7C3AED' : '#E2E8F0', color: i <= step ? 'white' : '#94A3B8', flexShrink:0, transition:'all .2s' }}>
                {i < step ? <Check size={12} /> : i + 1}
              </div>
              <span style={{ fontSize:10, fontWeight:600, color: i === step ? '#7C3AED' : '#94A3B8', textAlign:'center', whiteSpace:'nowrap' }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding:'24px', minHeight:280 }}>
          {/* Step 0: Overview */}
          {step === 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{ background:'#F8FAFC', borderRadius:12, padding:'16px', border:'1px solid #E2E8F0' }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                  <div style={{ width:40, height:40, borderRadius:10, background:'linear-gradient(135deg,#7C3AED,#A78BFA)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <Briefcase size={18} color="white" />
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:15, fontWeight:700, color:'#0F172A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{title}</div>
                    <div style={{ fontSize:12, color:'#64748B', marginTop:2 }}>Client: {client}</div>
                    {isResourceNeed && (
                      <span style={{ display:'inline-block', marginTop:6, fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, background:'rgba(124,58,237,0.1)', color:'#7C3AED' }}>Resource Need</span>
                    )}
                  </div>
                </div>
              </div>
              {caseData.description && (
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Case description</div>
                  <p style={{ fontSize:13, color:'#475569', lineHeight:1.6, margin:0 }}>{caseData.description}</p>
                </div>
              )}
              {(caseData.skills_required ?? []).length > 0 && (
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Required skills</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                    {caseData.skills_required.map(s => (
                      <span key={s} style={{ fontSize:11, padding:'3px 8px', borderRadius:99, background:'#EFF6FF', color:'#2563EB', fontWeight:600 }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ background:'#EFF6FF', borderRadius:10, padding:'12px 14px', border:'1px solid #BFDBFE', fontSize:12, color:'#1D4ED8', lineHeight:1.5 }}>
                By submitting this proposal you are indicating your interest in managing the recruitment process for this case. The client or manager will review all proposals before assigning a headhunter.
              </div>
            </div>
          )}

          {/* Step 1: Proposal details */}
          {step === 1 && (
            <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6 }}>
                  Cover message <span style={{ fontWeight:400, color:'#9CA3AF' }}>(optional)</span>
                </label>
                <textarea
                  rows={4}
                  placeholder="Describe your approach, relevant experience, and why you are a strong fit for this case..."
                  value={form.message}
                  onChange={e => patch("message", e.target.value)}
                  style={{ width:'100%', borderRadius:10, border:'1.5px solid #E2E8F0', padding:'10px 12px', fontSize:13, color:'#0F172A', resize:'vertical', outline:'none', fontFamily:'inherit', boxSizing:'border-box' }}
                />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6 }}>
                    Candidate estimate <span style={{ fontWeight:400, color:'#9CA3AF' }}>(#)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 5"
                    value={form.candidate_count_estimate}
                    onChange={e => patch("candidate_count_estimate", e.target.value)}
                    style={{ width:'100%', borderRadius:10, border:'1.5px solid #E2E8F0', padding:'9px 12px', fontSize:13, color:'#0F172A', outline:'none', fontFamily:'inherit', boxSizing:'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6 }}>
                    Commission % <span style={{ fontWeight:400, color:'#9CA3AF' }}>(proposed)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    placeholder="15"
                    value={form.proposed_commission_pct}
                    onChange={e => patch("proposed_commission_pct", e.target.value)}
                    style={{ width:'100%', borderRadius:10, border:'1.5px solid #E2E8F0', padding:'9px 12px', fontSize:13, color:'#0F172A', outline:'none', fontFamily:'inherit', boxSizing:'border-box' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Confirm */}
          {step === 2 && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'#0F172A' }}>Review your proposal</div>
              <div style={{ background:'#F8FAFC', borderRadius:12, padding:'16px', border:'1px solid #E2E8F0', display:'flex', flexDirection:'column', gap:10 }}>
                <Row label="Case"       value={title} />
                <Row label="Message"    value={form.message.trim() || "—"} />
                <Row label="Candidates" value={form.candidate_count_estimate || "—"} />
                <Row label="Commission" value={form.proposed_commission_pct ? `${form.proposed_commission_pct}%` : "—"} />
              </div>
              {error && (
                <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#DC2626' }}>{error}</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop:'1px solid #F1F5F9', padding:'16px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', background:'#FAFAFA' }}>
          <button onClick={canBack ? () => setStep(s => s - 1) : onCancel}
            style={{ display:'flex', alignItems:'center', gap:6, background:'white', border:'1.5px solid #E2E8F0', borderRadius:10, padding:'9px 16px', fontSize:13, fontWeight:600, color:'#64748B', cursor:'pointer' }}>
            <ChevronLeft size={14} />{canBack ? "Back" : "Cancel"}
          </button>
          {canNext ? (
            <button onClick={() => setStep(s => s + 1)}
              style={{ display:'flex', alignItems:'center', gap:6, background:'linear-gradient(135deg,#5B21B6,#7C3AED)', border:'none', borderRadius:10, padding:'9px 18px', fontSize:13, fontWeight:700, color:'white', cursor:'pointer', boxShadow:'0 4px 14px rgba(124,58,237,0.3)' }}>
              Next<ChevronRight size={14} />
            </button>
          ) : (
            <button onClick={submit} disabled={saving}
              style={{ display:'flex', alignItems:'center', gap:6, background: saving ? '#A78BFA' : 'linear-gradient(135deg,#5B21B6,#7C3AED)', border:'none', borderRadius:10, padding:'9px 18px', fontSize:13, fontWeight:700, color:'white', cursor: saving ? 'default' : 'pointer', boxShadow:'0 4px 14px rgba(124,58,237,0.3)' }}>
              {saving ? <><Spinner size={14} />&nbsp;Sending…</> : <><Send size={14} />Submit Proposal</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
      <span style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.06em', minWidth:80, flexShrink:0 }}>{label}</span>
      <span style={{ fontSize:13, color:'#0F172A', flex:1, wordBreak:'break-word' }}>{value}</span>
    </div>
  );
}
