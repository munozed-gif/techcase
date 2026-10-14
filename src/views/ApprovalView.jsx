import { useState, useEffect } from "react";
import { CheckCircle2, XCircle, AlertCircle, Clock, Package, ChevronDown, ChevronUp, Check, X } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { NovaLandingMark } from "./LandingView.jsx";
import { useT } from "../i18n/index.jsx";

const OBJECT_TYPE_LABEL = {
  function_module: "Function Module",
  report: "Report",
  class: "Class",
  interface: "Interface",
  table: "Table",
  view: "View",
  program: "Program",
  enhancement: "Enhancement",
  badi: "BAdI",
  form: "Form",
  smartform: "Smartform",
  other: "Other",
};

const PHASE_LABEL = {
  design:  "Design",
  develop: "Develop",
  test:    "Test",
  deploy:  "Deploy",
};

function PlatformName({ name }) {
  const parts = name.split(" ");
  if (parts.length > 1) {
    return <><span style={{ color: "#4F6EF7" }}>{parts[0]}</span> <span className="text-white">{parts.slice(1).join(" ")}</span></>;
  }
  return <span style={{ color: "#4F6EF7" }}>{name}</span>;
}

function ObjectCard({ obj, onDecide, saving }) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const decided = !!obj.decision;
  const approved = obj.decision === "approved";
  const rejected = obj.decision === "rejected";

  return (
    <div className={`rounded-xl border transition-all ${
      approved ? "border-green-500/40 bg-green-500/5" :
      rejected ? "border-red-500/40 bg-red-500/5" :
      "border-white/10 bg-white/4"
    }`} style={decided ? {} : { background: "rgba(255,255,255,0.04)" }}>
      {/* Card header */}
      <div className="px-5 py-4 flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {approved && <CheckCircle2 size={16} className="text-green-400" />}
          {rejected && <XCircle size={16} className="text-red-400" />}
          {!decided && <Clock size={16} className="text-amber-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white text-sm">{obj.object_name}</span>
            {obj.object_type && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300">
                {OBJECT_TYPE_LABEL[obj.object_type] ?? obj.object_type}
              </span>
            )}
            {obj.object_phase && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-white/10 text-blue-300">
                {PHASE_LABEL[obj.object_phase] ?? obj.object_phase}
              </span>
            )}
          </div>
          {obj.object_description && (
            <p className="text-xs text-blue-300/60 mt-1 leading-relaxed">{obj.object_description}</p>
          )}
          {rejected && obj.rejection_reason && (
            <p className="text-xs text-red-400/80 mt-1 italic">{t("approval.reason_prefix")} {obj.rejection_reason}</p>
          )}
        </div>
        <button
          onClick={() => setExpanded(p => !p)}
          className="flex-shrink-0 text-blue-400/40 hover:text-blue-400 transition-colors">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Expanded: approve / reject controls */}
      {expanded && !decided && (
        <div className="px-5 pb-4 border-t border-white/5 pt-3">
          {!showReject ? (
            <div className="flex gap-2 flex-wrap">
              <button
                disabled={saving}
                onClick={() => onDecide(obj.id, "approved", "")}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30 transition-colors disabled:opacity-50">
                <Check size={12} />{t("approval.approve")}
              </button>
              <button
                disabled={saving}
                onClick={() => setShowReject(true)}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25 transition-colors disabled:opacity-50">
                <X size={12} />{t("approval.reject")}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder={t("approval.reject_reason_ph")}
                rows={2}
                className="w-full rounded-lg border border-red-500/30 bg-red-500/10 text-white/80 text-xs px-3 py-2 placeholder-white/30 resize-none focus:outline-none focus:border-red-400/60"
              />
              <div className="flex gap-2">
                <button
                  disabled={saving}
                  onClick={() => onDecide(obj.id, "rejected", rejectReason)}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 transition-colors disabled:opacity-50">
                  {t("approval.confirm_reject")}
                </button>
                <button
                  onClick={() => setShowReject(false)}
                  className="px-3 py-1.5 text-xs text-blue-400/60 hover:text-blue-400 transition-colors">
                  {t("action.cancel")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expand to reveal controls when already decided */}
      {expanded && decided && (
        <div className="px-5 pb-3 border-t border-white/5 pt-3 text-xs text-blue-400/40">
          {t("approval.decision_recorded")} · {obj.decided_at ? new Date(obj.decided_at).toLocaleString() : ""}
        </div>
      )}

      {/* Collapsed: prompt to expand if undecided */}
      {!expanded && !decided && (
        <div className="px-5 pb-3 text-xs text-amber-400/50">
          {t("approval.click_to_review")}
        </div>
      )}
    </div>
  );
}

export default function ApprovalView({ token }) {
  const { t } = useT();
  const [request, setRequest] = useState(null);
  const [reviewerProfile, setReviewerProfile] = useState(null);
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState({});
  const [allDone, setAllDone] = useState(false);
  const [branding, setBranding] = useState({ name: "Arena", tagline: "Consultant Case Management" });

  useEffect(() => {
    async function load() {
      const [brandRes, reqRes] = await Promise.all([
        supabase.from("system_settings").select("key, value").in("key", ["platform_name", "platform_tagline"]),
        supabase
          .from("approval_requests")
          .select("id, reviewer_email, reviewer_name, reviewer_avatar_url, status, expires_at, case_id, project_id, cases(title, area_sap, reviewer_name), projects(name)")
          .eq("token", token)
          .single(),
      ]);
      if (brandRes.data) {
        const m = Object.fromEntries(brandRes.data.map(r => [r.key, r.value]));
        setBranding({ name: m.platform_name || "Arena", tagline: m.platform_tagline || "Consultant Case Management" });
      }
      if (reqRes.error || !reqRes.data) {
        setError(t("approval.invalid_link"));
        setLoading(false);
        return;
      }
      setRequest(reqRes.data);

      // Build reviewer profile from request or joined case data
      const name = reqRes.data.reviewer_name ?? reqRes.data.cases?.reviewer_name ?? null;
      const avatar = reqRes.data.reviewer_avatar_url ?? null;
      if (name || avatar) setReviewerProfile({ full_name: name, avatar_url: avatar });

      const { data: objs } = await supabase
        .from("approval_request_objects")
        .select("*")
        .eq("approval_request_id", reqRes.data.id)
        .order("object_phase")
        .order("object_name");
      setObjects(objs ?? []);
      setLoading(false);
    }
    if (token) load();
  }, [token]);

  useEffect(() => {
    if (objects.length > 0 && objects.every(o => !!o.decision)) {
      setAllDone(true);
    }
  }, [objects]);

  async function handleDecide(objId, decision, reason) {
    setSaving(p => ({ ...p, [objId]: true }));
    await supabase
      .from("approval_request_objects")
      .update({ decision, rejection_reason: reason || null, decided_at: new Date().toISOString() })
      .eq("id", objId);
    setObjects(p => p.map(o => o.id === objId
      ? { ...o, decision, rejection_reason: reason || null, decided_at: new Date().toISOString() }
      : o
    ));
    setSaving(p => ({ ...p, [objId]: false }));
  }

  const BG = {
    minHeight: "100vh",
    background: "#0B0F1A",
    backgroundImage: "radial-gradient(circle at 70% -10%,rgba(79,110,247,.22) 0%,transparent 65%),linear-gradient(rgba(79,110,247,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(79,110,247,.07) 1px,transparent 1px)",
    backgroundSize: "100% 100%,48px 48px,48px 48px",
  };

  if (loading) {
    return (
      <div style={BG} className="flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-800 border-t-blue-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !request) {
    return (
      <div style={BG} className="flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <AlertCircle size={40} className="text-blue-900 mx-auto mb-3" />
          <p className="text-blue-300">{error ?? t("approval.link_fallback")}</p>
        </div>
      </div>
    );
  }

  const pending   = objects.filter(o => !o.decision).length;
  const approved  = objects.filter(o => o.decision === "approved").length;
  const rejected  = objects.filter(o => o.decision === "rejected").length;
  const caseName  = request.cases?.title ?? "—";
  const projName  = request.projects?.name;

  return (
    <div style={BG}>
      {/* Nav */}
      <nav className="flex items-center gap-3 px-6 py-4 border-b border-white/5">
        <NovaLandingMark size={32} />
        <span className="text-sm font-bold"><PlatformName name={branding.name} /></span>
        <span className="text-white/20 mx-1">·</span>
        <span className="text-sm text-blue-400/70">{t("approval.blueprint_review")}</span>
      </nav>

      {/* Hero */}
      <div className="text-center pt-10 pb-6 px-4">
        <p className="text-xs text-blue-400/50 uppercase tracking-widest mb-2 font-semibold">
          {projName ?? t("approval.review_request_fallback")}
        </p>
        <h1 className="text-2xl font-bold text-white mb-1">{caseName}</h1>
        {request.cases?.area_sap && (
          <p className="text-xs text-blue-400/50 mt-1">{t("approval.sap_module_prefix")} {request.cases.area_sap}</p>
        )}
        <div className="flex items-center justify-center gap-2 mt-3">
          {reviewerProfile?.avatar_url
            ? <img src={reviewerProfile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover ring-2 ring-blue-500/30" />
            : <div className="w-7 h-7 rounded-full bg-blue-600/30 flex items-center justify-center text-xs font-bold text-blue-300 ring-2 ring-blue-500/30">
                {(reviewerProfile?.full_name ?? request.reviewer_email ?? '?')[0].toUpperCase()}
              </div>
          }
          <div className="text-left">
            {reviewerProfile?.full_name && (
              <p className="text-xs font-semibold text-blue-200">{reviewerProfile.full_name}</p>
            )}
            <p className="text-[11px] text-blue-400/50">
              {request.reviewer_email}
              {request.expires_at && <span className="ml-1">· {t("approval.expires_prefix")} {new Date(request.expires_at).toLocaleDateString()}</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-12 space-y-4">
        {/* Summary tiles */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t("approval.pending"),  value: pending,  cls: "text-amber-300", icon: <Clock size={15} className="text-amber-400" /> },
            { label: t("approval.approved"), value: approved, cls: "text-green-300", icon: <CheckCircle2 size={15} className="text-green-400" /> },
            { label: t("approval.rejected"), value: rejected, cls: "text-red-300",   icon: <XCircle size={15} className="text-red-400" /> },
          ].map(t => (
            <div key={t.label} className="rounded-xl border border-white/10 p-4 text-center" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="flex justify-center mb-1">{t.icon}</div>
              <p className={`text-2xl font-bold ${t.cls}`}>{t.value}</p>
              <p className="text-[11px] text-blue-400/60 mt-0.5">{t.label}</p>
            </div>
          ))}
        </div>

        {/* All done banner */}
        {allDone && (
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-5 py-4 flex items-center gap-3">
            <CheckCircle2 size={18} className="text-green-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-300">{t("approval.all_done")}</p>
              <p className="text-xs text-green-400/60 mt-0.5">
                {t("approval.all_done_sub")}
              </p>
            </div>
          </div>
        )}

        {/* Objects */}
        {objects.length === 0 ? (
          <div className="rounded-xl border border-white/10 p-8 text-center" style={{ background: "rgba(255,255,255,0.04)" }}>
            <Package size={24} className="text-blue-400/30 mx-auto mb-2" />
            <p className="text-sm text-blue-400/50">{t("approval.no_objects")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1 mb-1">
              <Package size={13} className="text-blue-400" />
              <span className="text-sm font-semibold text-white">{t("approval.objects_title")}</span>
              <span className="text-xs text-blue-400/50 ml-auto">{objects.length} {t("approval.total_suffix")}</span>
            </div>
            {objects.map(obj => (
              <ObjectCard
                key={obj.id}
                obj={obj}
                onDecide={handleDecide}
                saving={!!saving[obj.id]}
              />
            ))}
          </div>
        )}

        <p className="text-center text-xs text-blue-400/30 pt-2">
          {t("approval.powered_by")} <PlatformName name={branding.name} /> · {t("approval.readonly_link")}
        </p>
      </div>
    </div>
  );
}
