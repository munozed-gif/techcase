import {
  Activity, AlertTriangle, CheckCircle2, ChevronRight, FileText,
  MessageSquare, SlidersHorizontal, Star, UserCheck,
} from "lucide-react";
import { useT } from "../i18n/index.jsx";
import { Badge } from "./ProfileComponents.jsx";
import { STATUS_COLORS } from "../lib/businessConstants.js";
import { STATUS_LABEL_KEYS, cap, fmt, timeAgo } from "../lib/uiUtils.jsx";

// FEED_TYPE_STYLES, FeedCard, FeedPreferencesModal, stars

const FEED_TYPE_STYLES = {
  comment:      { bg: 'bg-blue-100',   text: 'text-blue-600',   Icon: MessageSquare, label: 'Comment' },
  progress:     { bg: 'bg-green-100',  text: 'text-green-600',  Icon: Activity,      label: 'Progress' },
  assignment:   { bg: 'bg-violet-100', text: 'text-violet-600', Icon: UserCheck,     label: 'Assignment' },
  status_change:{ bg: 'bg-indigo-100', text: 'text-indigo-600', Icon: ChevronRight,  label: 'Status' },
  milestone:    { bg: 'bg-emerald-100',text: 'text-emerald-600',Icon: CheckCircle2,  label: 'Milestone' },
  document:     { bg: 'bg-sky-100',    text: 'text-sky-600',    Icon: FileText,      label: 'Document' },
  alert:        { bg: 'bg-amber-100',  text: 'text-amber-700',  Icon: AlertTriangle, label: 'Alert' },
};

function FeedCard({ item, caseData, onOpenCase, onMarkRead }) {
  const { t } = useT();
  const caseTitle = caseData?.title ?? item.title ?? t("feed.unknown_case");
  const style = FEED_TYPE_STYLES[item._type] ?? FEED_TYPE_STYLES.alert;
  const actorInitials = item.actor_name
    ? item.actor_name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : null;

  function handleClick() {
    if (item.is_unread && item._key?.startsWith('notif-') && onMarkRead) onMarkRead(item.id);
    if (caseData && onOpenCase) onOpenCase(caseData);
  }

  return (
    <div
      className={`rounded-2xl border p-4 transition-all cursor-pointer hover:shadow-md ${item.is_unread ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-white'}`}
      onClick={handleClick}>
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0 mt-0.5">
          {actorInitials ? (
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${style.bg} ${style.text}`}>
              {actorInitials}
            </div>
          ) : (
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${style.bg}`}>
              <style.Icon className={`w-4 h-4 ${style.text}`} />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="text-sm text-gray-900 leading-snug break-words min-w-0">
              {item._type === 'comment' && <><span className="font-semibold">{item.actor_name}</span>{t("feed.commented_on")}<span className="font-semibold text-[#1A4B8C]">{caseTitle}</span></>}
              {item._type === 'progress' && <><span className="font-semibold">{item.actor_name}</span>{t("feed.updated")}<span className="font-semibold text-[#1A4B8C]">{caseTitle}</span>{t("feed.to")}<span className="font-semibold text-green-600">{item.progress_update}%</span></>}
              {item._type === 'assignment' && <><span className="font-semibold">{item.actor_name}</span>{t("feed.joined_case")}<span className="font-semibold text-[#1A4B8C]">{caseTitle}</span>{item.time_commitment ? <span className="text-gray-500"> · {item.time_commitment}{t("feed.pct_commitment")}</span> : null}</>}
              {item._type === 'status_change' && <>{t("feed.status_changed_on")}<span className="font-semibold text-[#1A4B8C]">{caseTitle}</span>{': '}<span className="font-semibold text-indigo-600">{(item.title ?? '').replace('Status → ', '')}</span></>}
              {item._type === 'milestone' && <span className="font-semibold text-gray-900 break-all">{item.title}</span>}
              {item._type === 'document' && <span className="font-semibold text-gray-900 break-all">{item.title}</span>}
              {item._type === 'alert' && <span className="font-semibold text-amber-800 break-all">{item.title}</span>}
            </p>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {item.is_unread && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
              <span className="text-xs text-gray-400 whitespace-nowrap">{timeAgo(item.created_at)}</span>
            </div>
          </div>

          {/* Body */}
          {item._type === 'comment' && item.body && (
            <div className="mt-2 bg-gray-50 rounded-xl px-3 py-2.5 text-sm text-gray-600 line-clamp-3 leading-relaxed">{item.body}</div>
          )}
          {item._type === 'progress' && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${item.progress_update}%` }} />
              </div>
              <span className="text-xs font-semibold text-green-600">{item.progress_update}%</span>
            </div>
          )}
          {(item._type === 'status_change' || item._type === 'alert' || item._type === 'milestone' || item._type === 'document') && item.body && (
            <p className="mt-1 text-sm text-gray-500 leading-snug">{item.body}</p>
          )}

          {/* Case footer */}
          {caseData && (
            <div className="mt-3 flex items-center gap-2">
              <Badge className={STATUS_COLORS[caseData.status] ?? 'bg-gray-100 text-gray-600'}>{STATUS_LABEL_KEYS[caseData.status] ? t(STATUS_LABEL_KEYS[caseData.status]) : cap(fmt(caseData.status))}</Badge>
              {caseData.area_sap && <span className="text-xs text-gray-400">{caseData.area_sap}</span>}
              {caseData.progress_pct != null && <span className="text-xs text-gray-400">{caseData.progress_pct}%</span>}
              <span className="ml-auto text-xs text-[#1A4B8C] font-semibold hover:underline">{t("feed.open_case")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FeedPreferencesModal({ open, onClose, auth, prefs, savePrefs }) {
  const { t } = useT();
  if (!open) return null;
  const isClient = auth.isClient;
  const isConsultant = auth.isConsultant;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-gray-500" />
            <h2 className="font-bold text-gray-900">{t("feed.prefs_title")}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-5">
          {isConsultant && (
            <>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">{t("feed.show_in_feed")}</p>
                <div className="space-y-2">
                  {[
                    { key: 'show_comments',    label: t("feed.pref_comments") },
                    { key: 'show_progress',    label: t("feed.pref_progress") },
                    { key: 'show_status',      label: t("feed.pref_status") },
                    { key: 'show_assignments', label: t("feed.pref_assignments") },
                    { key: 'show_documents',   label: t("feed.pref_documents") },
                    { key: 'show_alerts',      label: t("feed.pref_alerts") },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center justify-between gap-3 cursor-pointer">
                      <span className="text-sm text-gray-700">{label}</span>
                      <button
                        onClick={() => savePrefs({ [key]: !prefs[key] })}
                        className={`relative w-10 h-5.5 rounded-full transition-colors flex-shrink-0 ${prefs[key] ? 'bg-blue-600' : 'bg-gray-200'}`}
                        style={{ width: 40, height: 22 }}>
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${prefs[key] ? 'translate-x-5' : 'translate-x-0.5'}`} style={{ transitionProperty: 'transform' }} />
                      </button>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">{t("feed.case_scope")}</p>
                <div className="flex gap-2">
                  {[[`my_cases`, t("feed.scope_my")],[`all`, t("feed.scope_all")]].map(([v, l]) => (
                    <button key={v} onClick={() => savePrefs({ scope: v })}
                      className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-colors ${prefs.scope === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {isClient && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{t("feed.client_vis_title")}</p>
              <p className="text-xs text-gray-400 mb-3">{t("feed.client_vis_desc")}</p>
              <div className="space-y-2">
                {[
                  { key: 'visible_comments',    label: t("feed.vis_comments") },
                  { key: 'visible_progress',    label: t("feed.vis_progress") },
                  { key: 'visible_status',      label: t("feed.vis_status") },
                  { key: 'visible_assignments', label: t("feed.vis_assignments") },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center justify-between gap-3 cursor-pointer">
                    <span className="text-sm text-gray-700">{label}</span>
                    <button
                      onClick={() => savePrefs({ [key]: !prefs[key] })}
                      className={`relative rounded-full transition-colors flex-shrink-0 ${prefs[key] ? 'bg-blue-600' : 'bg-gray-200'}`}
                      style={{ width: 40, height: 22 }}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${prefs[key] ? 'translate-x-5' : 'translate-x-0.5'}`} style={{ transitionProperty: 'transform' }} />
                    </button>
                  </label>
                ))}
              </div>
            </div>
          )}
          {!isClient && !isConsultant && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">{t("feed.show_in_feed")}</p>
              <div className="space-y-2">
                {[
                  { key: 'show_comments',    label: t("feed.comments") },
                  { key: 'show_progress',    label: t("feed.pref_progress") },
                  { key: 'show_status',      label: t("feed.pref_status") },
                  { key: 'show_assignments', label: t("feed.assignments") },
                  { key: 'show_documents',   label: t("feed.pref_docs_short") },
                  { key: 'show_alerts',      label: t("feed.alerts") },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center justify-between gap-3 cursor-pointer">
                    <span className="text-sm text-gray-700">{label}</span>
                    <button onClick={() => savePrefs({ [key]: !prefs[key] })}
                      className={`relative rounded-full transition-colors flex-shrink-0 ${prefs[key] ? 'bg-blue-600' : 'bg-gray-200'}`}
                      style={{ width: 40, height: 22 }}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${prefs[key] ? 'translate-x-5' : 'translate-x-0.5'}`} style={{ transitionProperty: 'transform' }} />
                    </button>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-5 pb-5">
          <button onClick={onClose} className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 text-sm">
            {t("feed.save_prefs")}
          </button>
        </div>
      </div>
    </div>
  );
}
function stars(n, max = 5) {
  return Array.from({ length: max }, (_, i) => (
    <Star key={i} size={12} fill={i < Math.round(n) ? "currentColor" : "none"} className={i < Math.round(n) ? "text-yellow-400" : "text-gray-300"} />
  ));
}


export { FEED_TYPE_STYLES, FeedCard, FeedPreferencesModal, stars };
