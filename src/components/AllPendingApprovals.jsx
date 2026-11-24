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

// What an admin can do on behalf of the person: [approve label | null, reject label]. A null approve
// means only the invitee can accept (they must create an account / answer) — the admin can revoke.
const ACTIONS = {
  team_invite: ['Accept on their behalf', 'Decline'], client_team_invite: ['Activate', 'Deactivate'],
  case_invite: [null, 'Revoke'], customer_invite: [null, 'Revoke'], hh_invite: ['Accept on their behalf', 'Decline'],
  partner_signup: ['Approve', 'Reject'], seller_signup: ['Approve', 'Reject'],
  application: ['Accept', 'Reject'], hh_proposal: ['Accept', 'Reject'], delivery_bid: ['Accept / award', 'Decline'],
  spec_review: ['Approve on behalf of the customer', 'Request changes'], spec_questions: [null, 'Revoke link'],
  proposal: ['Accept on behalf of the customer', 'Reject'], blueprint_approval: ['Approve all objects', 'Reject all objects'],
  transport: ['Approve', 'Reject'],
};
const NOTE_REQUIRED = new Set(['spec_review', 'proposal']);

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
  const [acting, setActing] = useState(null);   // { key, approve }
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);       // { text, err }

  async function decide(r, approve) {
    setBusy(true); setDone(null);
    const { data, error: e } = await supabase.rpc('admin_decide_approval', { p_kind: r.kind, p_id: r.id, p_approve: approve, p_note: note.trim() || null });
    setBusy(false);
    if (e) { setDone({ err: true, text: e.message }); return; }
    setDone({ err: false, text: `${KINDS[r.kind]?.label ?? r.kind} — ${r.title || r.approver}: ${data?.result ?? 'done'}.` });
    setActing(null); setNote('');
    await load();
  }

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
        <span className="text-xs text-gray-400 flex-1">Everything waiting for someone on the platform. You can decide on their behalf — it is recorded in the audit log.</span>
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
      {done && <p className={`px-5 py-2 text-sm ${done.err ? 'text-red-600' : 'text-green-700'}`}>{done.err ? '' : '✓ '}{done.text}</p>}
      {rows === null ? (
        <p className="px-5 py-8 text-center text-sm text-gray-400">Loading…</p>
      ) : !list.length ? (
        <p className="px-5 py-8 text-center text-sm text-gray-400">Nothing pending{kind !== 'all' || q ? ' for this filter' : ''}.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {list.map(r => {
            const k = KINDS[r.kind] ?? { label: r.kind, Icon: Inbox, who: '' };
            const exp = isExpired(r);
            const key = `${r.kind}:${r.id}`;
            const [okLabel, noLabel] = ACTIONS[r.kind] ?? [null, null];
            const open = acting?.key === key;
            return (
              <div key={key} className="px-5 py-3 flex flex-wrap items-start gap-3">
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
                {!open && (
                  <div className="flex gap-1.5 flex-shrink-0">
                    {okLabel && <button onClick={() => { setActing({ key, approve: true }); setNote(''); setDone(null); }} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700">{okLabel}</button>}
                    {noLabel && <button onClick={() => { setActing({ key, approve: false }); setNote(''); setDone(null); }} className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50">{noLabel}</button>}
                  </div>
                )}
                {open && (
                  <div className="basis-full pl-11 flex flex-wrap items-center gap-2">
                    <span className={`text-xs font-semibold ${acting.approve ? 'text-green-700' : 'text-red-600'}`}>{acting.approve ? okLabel : noLabel}:</span>
                    <input autoFocus value={note} onChange={e => setNote(e.target.value)}
                      placeholder={!acting.approve && NOTE_REQUIRED.has(r.kind) ? 'Comment (required) — what has to change / why' : 'Note (optional) — recorded and sent with the decision'}
                      className="flex-1 min-w-[220px] px-3 py-1.5 border border-gray-200 rounded-lg text-xs" />
                    <button disabled={busy || (!acting.approve && NOTE_REQUIRED.has(r.kind) && !note.trim())} onClick={() => decide(r, acting.approve)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40 ${acting.approve ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>{busy ? 'Saving…' : 'Confirm'}</button>
                    <button onClick={() => setActing(null)} className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-600">Cancel</button>
                    <p className="basis-full text-[11px] text-gray-400">Recorded in the audit log as decided by you on behalf of {r.approver || 'them'}; they are notified.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
