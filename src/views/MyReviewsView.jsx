import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2, XCircle, Clock, Package, ChevronDown, ChevronUp,
  Check, X, FolderOpen, Layers, RefreshCw, ClipboardCheck,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";

const OBJECT_TYPE_LABEL = {
  function_module: "Function Module", report: "Report", class: "Class",
  interface: "Interface", table: "Table", view: "View", program: "Program",
  enhancement: "Enhancement", badi: "BAdI", form: "Form",
  smartform: "Smartform", other: "Other",
};

function ObjectCard({ obj, onDecide, saving }) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const decided = !!obj.decision;

  return (
    <div className={`rounded-xl border transition-all ${
      obj.decision === "approved" ? "border-green-200 bg-green-50" :
      obj.decision === "rejected" ? "border-red-200 bg-red-50" :
      "border-gray-100 bg-white"
    }`}>
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {obj.decision === "approved" && <CheckCircle2 size={15} className="text-green-500" />}
          {obj.decision === "rejected" && <XCircle size={15} className="text-red-500" />}
          {!decided && <Clock size={15} className="text-amber-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900 text-sm">{obj.object_name}</span>
            {obj.object_type && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600">
                {OBJECT_TYPE_LABEL[obj.object_type] ?? obj.object_type}
              </span>
            )}
            {obj.object_phase && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500">
                {obj.object_phase}
              </span>
            )}
          </div>
          {obj.object_description && (
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{obj.object_description}</p>
          )}
          {obj.decision === "rejected" && obj.rejection_reason && (
            <p className="text-xs text-red-500 mt-0.5 italic">{t("reviews.reason_prefix")} {obj.rejection_reason}</p>
          )}
        </div>
        {!decided && (
          <button onClick={() => setExpanded(p => !p)} className="flex-shrink-0 text-gray-300 hover:text-gray-500 transition-colors">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
        {decided && (
          <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-lg ${
            obj.decision === "approved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          }`}>
            {obj.decision === "approved" ? t("reviews.approved") : t("reviews.rejected")}
          </span>
        )}
      </div>

      {expanded && !decided && (
        <div className="px-4 pb-3 border-t border-gray-100 pt-2.5">
          {!showReject ? (
            <div className="flex gap-2">
              <button
                disabled={saving}
                onClick={() => onDecide(obj.id, "approved", "")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 transition-colors">
                <Check size={11} />{t("reviews.approve")}
              </button>
              <button
                disabled={saving}
                onClick={() => setShowReject(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors">
                <X size={11} />{t("reviews.reject")}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder={t("reviews.reject_reason_ph")}
                rows={2}
                className="w-full rounded-lg border border-red-200 bg-red-50 text-sm px-3 py-2 text-red-900 placeholder-red-300 resize-none focus:outline-none focus:border-red-400"
              />
              <div className="flex gap-2">
                <button
                  disabled={saving}
                  onClick={() => onDecide(obj.id, "rejected", rejectReason)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 transition-colors">
                  {t("reviews.confirm_reject")}
                </button>
                <button onClick={() => setShowReject(false)} className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                  {t("action.cancel")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ request, onDecide, saving }) {
  const { t } = useT();
  const [open, setOpen] = useState(true);
  const objects = request.approval_request_objects ?? [];
  const pending  = objects.filter(o => !o.decision).length;
  const approved = objects.filter(o => o.decision === "approved").length;
  const rejected = objects.filter(o => o.decision === "rejected").length;
  const done = pending === 0 && objects.length > 0;

  return (
    <div className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(p => !p)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {request.projects?.name && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Layers size={11} />{request.projects.name}
              </span>
            )}
          </div>
          <p className="font-semibold text-gray-900 text-sm mt-0.5 truncate">
            <FolderOpen size={13} className="inline text-blue-400 mr-1" />
            {request.cases?.title ?? "—"}
          </p>
          {request.cases?.area_sap && (
            <p className="text-xs text-gray-400 mt-0.5">{t("reviews.sap_prefix")} {request.cases.area_sap}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {done ? (
            <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg bg-green-100 text-green-700">
              <CheckCircle2 size={11} />{t("reviews.all_reviewed")}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700">
              <Clock size={11} />{pending} {t("reviews.pending_suffix")}
            </span>
          )}
          {approved > 0 && (
            <span className="text-xs text-green-600 font-semibold">{approved} ✓</span>
          )}
          {rejected > 0 && (
            <span className="text-xs text-red-600 font-semibold">{rejected} ✗</span>
          )}
          <button className="text-gray-300 hover:text-gray-500 transition-colors ml-1">
            {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {/* Objects list */}
      {open && (
        <div className="border-t border-gray-100 px-5 py-3 space-y-2">
          {objects.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">{t("reviews.no_objects")}</p>
          ) : (
            objects.map(obj => (
              <ObjectCard
                key={obj.id}
                obj={obj}
                onDecide={(objId, decision, reason) => onDecide(request.id, objId, decision, reason)}
                saving={!!saving[obj.id]}
              />
            ))
          )}
          <p className="text-[10px] text-gray-300 text-right pt-1">
            {t("reviews.expires_prefix")} {new Date(request.expires_at).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  );
}

export default function MyReviewsView({ auth }) {
  const { t } = useT();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const userEmail = auth.profile?.email ?? auth.user?.email ?? '';
    const { data } = await supabase
      .from("approval_requests")
      .select(`
        id, status, expires_at, reviewer_email, reviewer_user_id,
        cases(title, area_sap, project_id),
        projects(name),
        approval_request_objects(id, object_id, object_name, object_type, object_description, object_phase, decision, rejection_reason, decided_at)
      `)
      .or(`reviewer_user_id.eq.${auth.user.id},reviewer_email.eq.${userEmail}`)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    setRequests(data ?? []);
    setLastRefresh(new Date());
    setLoading(false);
  }, [auth.user.id]);

  useEffect(() => { load(); }, [load]);

  async function handleDecide(requestId, objId, decision, reason) {
    setSaving(p => ({ ...p, [objId]: true }));
    await supabase
      .from("approval_request_objects")
      .update({ decision, rejection_reason: reason || null, decided_at: new Date().toISOString() })
      .eq("id", objId);
    setRequests(prev => prev.map(req => req.id !== requestId ? req : {
      ...req,
      approval_request_objects: req.approval_request_objects.map(o =>
        o.id === objId ? { ...o, decision, rejection_reason: reason || null, decided_at: new Date().toISOString() } : o
      ),
    }));
    setSaving(p => ({ ...p, [objId]: false }));
  }

  const pending  = requests.filter(r => (r.approval_request_objects ?? []).some(o => !o.decision));
  const complete = requests.filter(r => (r.approval_request_objects ?? []).length > 0 && (r.approval_request_objects ?? []).every(o => !!o.decision));

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardCheck size={20} className="text-indigo-500" />
          <div>
            <h1 className="text-lg font-bold text-gray-900">{t("reviews.title")}</h1>
            {lastRefresh && (
              <p className="text-xs text-gray-400">{t("reviews.last_updated")} {lastRefresh.toLocaleTimeString()}</p>
            )}
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          {t("reviews.refresh")}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-4 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 p-12 text-center bg-white shadow-sm">
          <ClipboardCheck size={32} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-400">{t("reviews.no_pending")}</p>
          <p className="text-xs text-gray-300 mt-1">{t("reviews.no_pending_sub")}</p>
        </div>
      ) : (
        <>
          {/* Pending */}
          {pending.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-amber-500" />
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {t("reviews.section_pending")} ({pending.length})
                </h2>
              </div>
              {pending.map(req => (
                <ReviewCard key={req.id} request={req} onDecide={handleDecide} saving={saving} />
              ))}
            </section>
          )}

          {/* Completed */}
          {complete.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-green-500" />
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {t("reviews.section_completed")} ({complete.length})
                </h2>
              </div>
              {complete.map(req => (
                <ReviewCard key={req.id} request={req} onDecide={handleDecide} saving={saving} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
