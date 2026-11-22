// Packaged solutions catalog: partners publish their own; administrators publish platform ones
// (partnerId = null). A solution carries case templates that become the cases of the presale project.
import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, Pencil, X, Trash2, Package } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { SOLUTION_TYPES, PRICE_TYPES, lbl, money, errText } from "../lib/sales.js";

const inp = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400";

function SolutionModal({ es, initial, partnerId, userId, onClose, onSaved }) {
  const L = (en, sp) => (es ? sp : en);
  const [f, setF] = useState(() => ({
    title: "", summary: "", description: "", solution_type: "package", sap_areas: [], price_type: "quote", price: "",
    currency: "USD", duration_weeks: "", case_templates: [], status: "draft", ...(initial ?? {}),
  }));
  const [areas, setAreas] = useState((initial?.sap_areas ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const setTpl = (i, k, v) => set("case_templates", f.case_templates.map((t, j) => (j === i ? { ...t, [k]: v } : t)));

  async function save() {
    setBusy(true); setError(null);
    const row = {
      title: f.title.trim(), summary: f.summary || null, description: f.description || null, solution_type: f.solution_type,
      sap_areas: areas.split(",").map(s => s.trim()).filter(Boolean), price_type: f.price_type,
      price: f.price === "" || f.price == null ? null : Number(f.price), currency: f.currency || "USD",
      duration_weeks: f.duration_weeks === "" || f.duration_weeks == null ? null : Number(f.duration_weeks),
      case_templates: f.case_templates.filter(t => (t.title ?? "").trim()).map(t => ({
        title: t.title.trim(), description: t.description || null, area_sap: t.area_sap || null,
        est_hours: t.est_hours === "" || t.est_hours == null ? null : Number(t.est_hours) })),
      status: f.status,
    };
    const res = initial?.id
      ? await supabase.from("solutions").update(row).eq("id", initial.id)
      : await supabase.from("solutions").insert({ ...row, partner_id: partnerId ?? null, created_by: userId });
    setBusy(false);
    if (res.error) { setError(errText(res.error)); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="font-bold text-gray-900">{initial?.id ? L("Edit solution", "Editar solución") : L("New solution", "Nueva solución")}</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="sm:col-span-2 text-xs font-semibold text-gray-600">{L("Title", "Título")}
            <input value={f.title} onChange={e => set("title", e.target.value)} className={inp + " mt-1"} placeholder="EWM Quick Start" /></label>
          <label className="sm:col-span-2 text-xs font-semibold text-gray-600">{L("Summary (one line)", "Resumen (una línea)")}
            <input value={f.summary ?? ""} onChange={e => set("summary", e.target.value)} className={inp + " mt-1"} /></label>
          <label className="sm:col-span-2 text-xs font-semibold text-gray-600">{L("Description / scope", "Descripción / alcance")}
            <textarea rows={4} value={f.description ?? ""} onChange={e => set("description", e.target.value)} className={inp + " mt-1"} /></label>
          <label className="text-xs font-semibold text-gray-600">{L("Type", "Tipo")}
            <select value={f.solution_type} onChange={e => set("solution_type", e.target.value)} className={inp + " mt-1 bg-white"}>
              {SOLUTION_TYPES.map(t => <option key={t.id} value={t.id}>{es ? t.es : t.en}</option>)}
            </select></label>
          <label className="text-xs font-semibold text-gray-600">{L("SAP areas (comma separated)", "Áreas SAP (separadas por coma)")}
            <input value={areas} onChange={e => setAreas(e.target.value)} className={inp + " mt-1"} placeholder="EWM, MM" /></label>
          <label className="text-xs font-semibold text-gray-600">{L("Price", "Precio")}
            <div className="flex gap-2 mt-1">
              <select value={f.price_type} onChange={e => set("price_type", e.target.value)} className={inp + " bg-white"}>
                {PRICE_TYPES.map(t => <option key={t.id} value={t.id}>{es ? t.es : t.en}</option>)}
              </select>
              {f.price_type !== "quote" && <input type="number" min="0" value={f.price ?? ""} onChange={e => set("price", e.target.value)} className={inp} />}
            </div></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-gray-600">{L("Currency", "Moneda")}
              <input value={f.currency} onChange={e => set("currency", e.target.value.toUpperCase())} className={inp + " mt-1"} /></label>
            <label className="text-xs font-semibold text-gray-600">{L("Weeks", "Semanas")}
              <input type="number" min="0" value={f.duration_weeks ?? ""} onChange={e => set("duration_weeks", e.target.value)} className={inp + " mt-1"} /></label>
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-gray-600 mb-1">{L("Cases created in the presale project", "Casos que se crean en el proyecto de preventa")}</div>
          <div className="space-y-2">
            {f.case_templates.map((t, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-start">
                <input value={t.title ?? ""} onChange={e => setTpl(i, "title", e.target.value)} placeholder={L("Case title", "Título del caso")} className={inp + " col-span-5"} />
                <input value={t.area_sap ?? ""} onChange={e => setTpl(i, "area_sap", e.target.value)} placeholder={L("Area", "Área")} className={inp + " col-span-2"} />
                <input type="number" min="0" value={t.est_hours ?? ""} onChange={e => setTpl(i, "est_hours", e.target.value)} placeholder={L("Hours", "Horas")} className={inp + " col-span-2"} />
                <input value={t.description ?? ""} onChange={e => setTpl(i, "description", e.target.value)} placeholder={L("Short description", "Descripción breve")} className={inp + " col-span-2"} />
                <button onClick={() => set("case_templates", f.case_templates.filter((_, j) => j !== i))} className="col-span-1 p-2 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ))}
            <button onClick={() => set("case_templates", [...f.case_templates, { title: "", area_sap: "", est_hours: "" }])}
              className="text-xs font-semibold text-violet-700 hover:underline flex items-center gap-1"><Plus size={12} />{L("Add case", "Añadir caso")}</button>
          </div>
        </div>

        <label className="text-xs font-semibold text-gray-600 block">{L("Status", "Estado")}
          <select value={f.status} onChange={e => set("status", e.target.value)} className={inp + " mt-1 bg-white w-48"}>
            <option value="draft">{L("Draft (only you)", "Borrador (solo tú)")}</option>
            <option value="published">{L("Published (sellers can offer it)", "Publicada (los vendedores pueden ofrecerla)")}</option>
            <option value="archived">{L("Archived", "Archivada")}</option>
          </select></label>
        {error && <div className="text-xs text-red-600">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100">{L("Cancel", "Cancelar")}</button>
          <button onClick={save} disabled={busy || !f.title.trim()} className="px-4 py-2 text-sm font-semibold rounded-lg text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2">
            {busy && <Loader2 size={14} className="animate-spin" />}{L("Save", "Guardar")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SolutionCard({ s, es, onEdit, footer }) {
  const L = (en, sp) => (es ? sp : en);
  const hours = (s.case_templates ?? []).reduce((a, t) => a + (Number(t.est_hours) || 0), 0);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0"><Package size={16} /></div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-gray-900 text-sm leading-tight">{s.title}</div>
          <div className="text-[11px] text-gray-500">{lbl(SOLUTION_TYPES, s.solution_type, es)} · {s.partner_name ?? (s.partner_id ? "" : L("Platform", "Plataforma"))}</div>
        </div>
        {s.status !== "published" && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{s.status}</span>}
        {onEdit && <button onClick={onEdit} className="p-1 text-gray-400 hover:text-gray-700"><Pencil size={13} /></button>}
      </div>
      {s.summary && <div className="text-xs text-gray-600">{s.summary}</div>}
      <div className="flex flex-wrap gap-1">
        {(s.sap_areas ?? []).map(a => <span key={a} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">{a}</span>)}
      </div>
      <div className="text-xs text-gray-500 mt-auto">
        {s.price_type === "quote" ? L("On quote", "A cotizar") : `${lbl(PRICE_TYPES, s.price_type, es)} ${money(s.price, s.currency)}`}
        {s.duration_weeks ? ` · ${s.duration_weeks} ${L("weeks", "semanas")}` : ""}
        {(s.case_templates ?? []).length ? ` · ${(s.case_templates ?? []).length} ${L("cases", "casos")}${hours ? ` / ${hours} h` : ""}` : ""}
      </div>
      {footer}
    </div>
  );
}

/** partnerId: manage that partner's solutions; null with platform=true: platform solutions (admins). */
export function SolutionsEditor({ lang, partnerId = null, platform = false, canManage = true, userId }) {
  const es = lang === "es";
  const L = (en, sp) => (es ? sp : en);
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const load = useCallback(async () => {
    let q = supabase.from("solutions").select("*").order("created_at", { ascending: false });
    q = platform ? q.is("partner_id", null) : q.eq("partner_id", partnerId);
    const { data } = await q;
    setRows(data ?? []);
  }, [partnerId, platform]);
  useEffect(() => { load(); }, [load]);

  if (!rows) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-300" /></div>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">{L("Ready-made offerings sellers can sell. Each one creates its cases in the presale project.",
                                                "Ofertas listas que los vendedores pueden vender. Cada una crea sus casos en el proyecto de preventa.")}</p>
        {canManage && (
          <button onClick={() => setEditing({})} className="px-3 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 flex items-center gap-1 flex-shrink-0">
            <Plus size={14} />{L("New solution", "Nueva solución")}
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400 bg-white rounded-2xl border border-gray-100">
          <Package size={28} className="mx-auto mb-2 opacity-30" />{L("No solutions yet.", "Aún no hay soluciones.")}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map(s => <SolutionCard key={s.id} s={s} es={es} onEdit={canManage ? () => setEditing(s) : null} />)}
        </div>
      )}
      {editing && (
        <SolutionModal es={es} initial={editing.id ? editing : null} partnerId={platform ? null : partnerId} userId={userId}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}
