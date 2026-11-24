// Approvals page (admins / managers): every approval waiting for someone across the platform —
// team and case invitations, sign-ups, applications, proposals, customer reviews, transports —
// from admin_pending_approvals() (other users' rows are not readable from the browser).
import { useState, useEffect, useMemo } from "react";
import { Inbox, RefreshCw, Users, Mail, Briefcase, FileCheck2, HelpCircle, FileText, Truck, UserPlus, Handshake, Store, ClipboardCheck, Clock } from "lucide-react";
import { supabase } from "../lib/supabase.js";

const KINDS = {
  team_invite:        { label: 'Team invitation',          Icon: Users,          who: 'Invitee accepts' },
  client_team_invite: { label: 'Client team invitation',   Icon: Users,          who: 'Invitee accepts' },
  case_invite:        { label: 'Case invitation',          Icon: Mail,           who: 'Invitee accepts' },
  customer_invite:    { label: 'Customer user invitation', Icon: Mail,           who: 'Invitee accepts' },
  hh_invite:          { label: 'Headhunter invitation',    Icon: UserPlus,       who: 'Consultant accepts' },
  partner_signup:     { label: 'Partner sign-up',          Icon: Handshake,      who: 'Platform approves' },
  seller_signup:      { label: 'Seller sign-up',           Icon: Store,          who: 'Approves' },
  application:        { label: 'Case application',         Icon: Briefcase,      who: 'Case manager decides' },
  hh_proposal:        { label: 'Headhunter proposal',      Icon: Briefcase,      who: 'Case manager decides' },
  delivery_bid:       { label: 'Delivery bid',             Icon: Handshake,      who: 'Seller decides' },
  spec_review:        { label: 'Spec review (customer)',   Icon: FileCheck2,     who: 'Customer approves' },
  spec_questions:     { label: 'Questions to customer',    Icon: HelpCircle,     who: 'Customer answers' },
  proposal:           { label: 'Proposal sent',            Icon: FileText,       who: 'Customer decides' },
  blueprint_approval: { label: 'Blueprint approval',       Icon: ClipboardCheck, who: 'Reviewer approves' },
  transport:          { label: 'Transport approval',       Icon: Truck,          who: 'Approver' },
};

const ago = iso => {
  if (!iso) return '';
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`;
};

export function AllPendingApprovals() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [hideExpired, setHideExpired] = useState(true);

  async function load() {
    setError(null);
    const { data, error: e } = await supabase.rpc('admin_pending_approvals');
    if (e) { setError(e.message); setRows([]); return; }
    setRows(data ?? []);
  }
  useEffect(() => { load(); }, []);

  const isExpired = r => r.expires_at && new Date(r.expires_at) < new Date();
  const visible = useMemo(() => (rows ?? []).filter(r => !hideExpired || !isExpired(r)), [rows, hideExpired]);
  const counts = useMemo(() => visible.reduce((m, r) => ({ ...m, [r.kind]: (m[r.kind] ?? 0) + 1 }), {}), [visible]);
  const nExpired = (rows ?? []).filter(isExpired).length;
  const list = visible.filter(r => (kind === 'all' || r.kind === kind)
    && (!q.trim() || [r.title, r.approver, r.approver_email, r.requested_by].some(v => v?.toLowerCase().includes(q.trim().toLowerCase()))));

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
        <Inbox size={18} className="text-gray-500" />
        <h3 className="text-base font-bold text-gray-900">All pending approvals</h3>
        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-xs font-semibold text-gray-600">{visible.length}</span>
        <span className="text-xs text-gray-400 flex-1">Everything waiting for someone on the platform — invitations, sign-ups, applications, customer reviews, transports.</span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-48" />
        <button onClick={load} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50" title="Refresh"><RefreshCw size={14} /></button>
      </div>
      <div className="px-5 py-3 flex flex-wrap gap-2 border-b border-gray-100">
        <button onClick={() => setKind('all')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${kind === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>All ({visible.length})</button>
        {Object.entries(KINDS).filter(([k]) => counts[k]).map(([k, v]) => (
          <button key={k} onClick={() => setKind(k)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${kind === k ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            <v.Icon size={12} />{v.label} ({counts[k]})
          </button>
        ))}
        {nExpired > 0 && (
          <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
            <input type="checkbox" checked={hideExpired} onChange={e => setHideExpired(e.target.checked)} />Hide expired links ({nExpired})
          </label>
        )}
      </div>
      {error && <p className="px-5 py-3 text-sm text-red-600">{error}</p>}
      {rows === null ? (
        <p className="px-5 py-8 text-center text-sm text-gray-400">Loading…</p>
      ) : !list.length ? (
        <p className="px-5 py-8 text-center text-sm text-gray-400">Nothing pending{kind !== 'all' || q ? ' for this filter' : ''}.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {list.map(r => {
            const k = KINDS[r.kind] ?? { label: r.kind, Icon: Inbox, who: '' };
            const exp = isExpired(r);
            return (
              <div key={`${r.kind}:${r.id}`} className="px-5 py-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"><k.Icon size={15} className="text-gray-500" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800 truncate">{r.title || k.label}</span>
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-semibold">{k.label}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${exp ? 'bg-gray-100 text-gray-500' : 'bg-amber-50 text-amber-700'}`}>{exp ? 'Link expired' : r.status}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>Waiting on: <span className="text-gray-700 font-medium">{r.approver || '—'}</span>{r.approver_email && r.approver_email !== r.approver ? ` · ${r.approver_email}` : ''}{k.who ? ` (${k.who.toLowerCase()})` : ''}</span>
                    {r.requested_by && <span>Requested by: <span className="text-gray-700">{r.requested_by}</span></span>}
                    <span className="inline-flex items-center gap-1"><Clock size={11} />{ago(r.created_at)}</span>
                    {r.expires_at && !exp && <span>expires {new Date(r.expires_at).toLocaleDateString()}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
