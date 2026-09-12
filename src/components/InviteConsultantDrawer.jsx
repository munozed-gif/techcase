import { useState, useEffect } from "react";
import { Check, Search, X } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { notify } from "../lib/utils.js";
import { Badge } from "../components/ProfileComponents.jsx";
import { Input } from "../components/ui.jsx";

function InviteConsultantDrawer({ caseData, auth, onClose }) {
  const { t } = useT();
  const visCfg = useVisibilitySettings();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(null);
  const invitations = visCfg.getCaseInvitations(caseData.id);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase.from('users')
        .select('id, full_name, email, avatar_url, role')
        .in('role', ['consultant', 'headhunter'])
        .ilike('full_name', `%${search}%`)
        .limit(10);
      setResults(data ?? []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  async function invite(consultant, type) {
    setSaving(consultant.id + type);
    await visCfg.addCaseInvitation(caseData.id, consultant.id, type, consultant.full_name);
    if (type === 'direct') {
      await supabase.from('case_assignments').upsert(
        { case_id: caseData.id, consultant_id: consultant.id },
        { onConflict: 'case_id,consultant_id' }
      );
    }
    setSaving(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">{t('case.invite_title')}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{caseData.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={t('case.invite_search')}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {invitations.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Already Invited</p>
              {invitations.map(inv => (
                <div key={inv.consultantId} className="flex items-center justify-between py-2 px-3 bg-green-50 rounded-xl border border-green-100 mb-1">
                  <span className="text-sm font-medium text-gray-800">{inv.consultantName}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${inv.type === 'direct' ? 'bg-blue-100 text-blue-700' : 'bg-teal-100 text-teal-700'}`}>
                      {inv.type === 'direct' ? t('case.invite_direct') : t('case.invite_apply')}
                    </span>
                    <button onClick={() => visCfg.removeCaseInvitation(caseData.id, inv.consultantId)} className="text-gray-300 hover:text-red-400"><X size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {searching && <div className="text-center text-xs text-gray-400 py-4">Searching…</div>}
          {!searching && search && results.length === 0 && (
            <div className="text-center text-xs text-gray-400 py-4">No consultants found</div>
          )}

          {results.map(c => {
            const alreadyInvited = invitations.some(i => i.consultantId === c.id);
            return (
              <div key={c.id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl border border-gray-100 hover:border-blue-100 hover:bg-blue-50/40 transition-colors">
                <UserAvatar user={c} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{c.full_name}</div>
                  <div className="text-xs text-gray-400 capitalize">{c.role}</div>
                </div>
                {alreadyInvited ? (
                  <span className="text-xs text-green-600 font-semibold flex items-center gap-1"><Check size={10} />{t('case.invite_added')}</span>
                ) : (
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => invite(c, 'apply')} disabled={saving === c.id + 'apply'}
                      className="text-xs px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 font-medium border border-teal-200 disabled:opacity-50 transition-colors">
                      {saving === c.id + 'apply' ? '…' : t('case.invite_apply')}
                    </button>
                    <button onClick={() => invite(c, 'direct')} disabled={saving === c.id + 'direct'}
                      className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium border border-blue-200 disabled:opacity-50 transition-colors">
                      {saving === c.id + 'direct' ? '…' : t('case.invite_direct')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {!search && invitations.length === 0 && (
            <div className="text-center text-sm text-gray-400 py-8">Search for a consultant by name above</div>
          )}
        </div>
      </div>
    </div>
  );
}

export { InviteConsultantDrawer };
