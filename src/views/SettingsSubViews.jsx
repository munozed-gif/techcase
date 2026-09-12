import { useState, useEffect, Fragment } from "react";
import { Check, ChevronDown, ChevronUp, Pencil, X } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { useLifecycleTemplates } from "../hooks/useLifecycleHooks.js";
import { usePlanConfig, useSystemSettings } from "../hooks/useSystemSettings.jsx";
import { logEvent } from "../lib/utils.js";
import { Badge, Spinner } from "../components/ProfileComponents.jsx";
import { Input, Select, Textarea } from "../components/ui.jsx";
import { SlaMatrixEditor, SLA_PRIORITIES, SLA_DEFAULT_TYPES, SLA_UNIT_LABELS } from "../lib/uiUtils.jsx";
import { LIFECYCLE_PRESETS, DEFAULT_ACTIVITY_PHASES, SAP_AREAS, INDUSTRY_AREAS, PROJECT_TYPES } from "../lib/businessConstants.js";

function LifecycleSettingsView({ auth }) {
  const { t } = useT();
  const { templates, loadingTmpl, fetchTemplates } = useLifecycleTemplates();
  const [selected, setSelected] = useState(null);
  const [editStages, setEditStages] = useState([]);
  const [saving, setSaving] = useState(false);
  const [viewTmpl, setViewTmpl] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const [activeStageIdx, setActiveStageIdx] = useState(0);

  function startEdit(tmpl) { setSelected(tmpl); setEditStages(tmpl.stages.map(s => ({ ...s }))); setActiveStageIdx(0); }
  function cancelEdit() { setSelected(null); setEditStages([]); }
  function addStage() {
    setEditStages(p => {
      const next = [...p, { key: `s${Date.now()}`, label: t("lc.new_stage_label"), color: "#6b7280", is_terminal: false, allowed_next: [], allowed_roles: [] }];
      setActiveStageIdx(next.length - 1);
      return next;
    });
  }
  function removeStage(i) {
    setEditStages(p => {
      const next = p.filter((_, j) => j !== i);
      setActiveStageIdx(prev => Math.min(prev, Math.max(0, next.length - 1)));
      return next;
    });
  }
  function moveStage(i, d) {
    setEditStages(p => {
      const n = [...p]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x);
      setActiveStageIdx(i + d);
      return n;
    });
  }
  function updateStage(i, u) { setEditStages(p => p.map((s, j) => j === i ? { ...s, ...u } : s)); }

  function toggleRole(i, role) {
    const cur = editStages[i].allowed_roles ?? [];
    updateStage(i, { allowed_roles: cur.includes(role) ? cur.filter(r => r !== role) : [...cur, role] });
  }
  function toggleNext(i, key) {
    const cur = editStages[i].allowed_next ?? [];
    updateStage(i, { allowed_next: cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key] });
  }
  function setInitialStage(i) {
    setEditStages(p => p.map((s, j) => ({ ...s, is_initial: j === i })));
  }
  function cycleTrigger(i) {
    const cur = editStages[i].trigger ?? "manual";
    const next = cur === "manual" ? "auto" : cur === "auto" ? "both" : "manual";
    updateStage(i, { trigger: next });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { error } = await supabase.from("lifecycle_templates")
        .update({ stages: editStages, updated_at: new Date().toISOString() })
        .eq("id", selected.id);
      if (error) throw error;
      await fetchTemplates();
      setSelected(null);
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("lifecycle_templates").insert({
        name,
        description: newDesc.trim() || null,
        key: name.toLowerCase().replace(/\s+/g, "_"),
        stages: LIFECYCLE_PRESETS.standard.stages,
        is_active: true,
        sort_order: templates.length + 1,
      });
      if (error) throw error;
      await fetchTemplates();
      setCreating(false); setNewName(""); setNewDesc("");
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  async function handleDelete(tmpl) {
    if (!window.confirm(t("cd.confirm_delete_tmpl").replace("{n}", tmpl.name))) return;
    try {
      const { error } = await supabase.from("lifecycle_templates").delete().eq("id", tmpl.id);
      if (error) throw error;
      await fetchTemplates();
      if (viewTmpl?.id === tmpl.id) setViewTmpl(null);
    } catch (e) { alert(e.message); }
  }

  useEffect(() => {
    if (!templates.length) return;
    if (viewTmpl) {
      const fresh = templates.find(t => t.id === viewTmpl.id);
      if (fresh) setViewTmpl(fresh);
    } else {
      setViewTmpl(templates[0]);
    }
  }, [templates]);

  if (loadingTmpl) return <div className="p-8 text-sm text-gray-400">{t("label.loading")}</div>;

  const ROLES = [
    { key: "manager",    label: t("auth.role_manager"),    color: "#1d4ed8", bg: "#dbeafe" },
    { key: "consultant", label: t("auth.role_consultant"), color: "#065f46", bg: "#d1fae5" },
    { key: "client",     label: t("auth.role_client"),     color: "#92400e", bg: "#fef3c7" },
    { key: "key_user",   label: t("auth.role_key_user"),   color: "#5b21b6", bg: "#ede9fe" },
  ];

  const ALL_TABS = [
    { id: "detail",       label: t("lc.tab_detail") },
    { id: "activities",   label: t("lc.tab_activities") },
    { id: "milestones",   label: t("lc.tab_milestones") },
    { id: "comments",     label: t("lc.tab_comments") },
    { id: "subcases",     label: t("lc.tab_subcases") },
    { id: "documents",    label: t("lc.tab_docs") },
    { id: "time",         label: t("lc.tab_time") },
    { id: "applications", label: t("lc.tab_applicants") },
    { id: "lifecycle",    label: t("lc.tab_lifecycle") },
    { id: "spec",         label: t("lc.tab_spec") },
  ];

  const ACTION_RULES = [
    { key: "editable",                       label: t("lc.rule_edit") },
    { key: "can_log_time",                   label: t("lc.rule_time") },
    { key: "can_add_activities",             label: t("lc.rule_activities") },
    { key: "can_comment",                    label: t("lc.rule_comments") },
    { key: "can_upload_docs",                label: t("lc.rule_docs") },
    { key: "can_edit_activity_phase",        label: t("lc.rule_act_phase") },
    { key: "can_edit_activity_predecessors", label: t("lc.rule_act_predecessors") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t("lc.title")}</h2>
          <p className="text-sm text-gray-500 mt-1">{t("lc.page_desc")}</p>
        </div>
        {!selected && !creating && (
          <button onClick={() => setCreating(true)}
            className="flex-shrink-0 px-4 py-2 bg-[#1A4B8C] hover:bg-blue-900 text-white text-sm font-semibold rounded-xl">
            {t("lc.new_btn")}
          </button>
        )}
      </div>

      {creating && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">{t("lc.create_title")}</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{t("label.name")}</label>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                placeholder={t("lc.ph_template_name")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{t("label.description")}</label>
              <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder={t("label.ph_optional_desc")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <p className="text-xs text-gray-400">{t("lc.create_hint")}</p>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button onClick={() => { setCreating(false); setNewName(""); setNewDesc(""); }}
              className="text-sm text-gray-400 hover:text-gray-600">{t("action.cancel")}</button>
            <button onClick={handleCreate} disabled={!newName.trim() || saving}
              className="px-5 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-50">
              {saving ? t("state.creating") : t("lc.create_btn")}
            </button>
          </div>
        </div>
      )}

      {selected ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">{selected.name}</h3>
              <p className="text-sm text-gray-500">{selected.description}</p>
            </div>
            <button onClick={cancelEdit} className="text-sm text-gray-400 hover:text-gray-600">{t("action.cancel")}</button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t("lc.stages_title")}</p>
              <button onClick={addStage}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-50">
                {t("lc.add_stage")}
              </button>
            </div>

            {/* Stage tab bar — same tile pattern as case detail */}
            <div className="flex flex-wrap gap-2">
              {editStages.map((s, i) => (
                <button key={i} onClick={() => setActiveStageIdx(i)}
                  className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border transition-all min-w-[76px] ${
                    activeStageIdx === i
                      ? "border-[#1A4B8C] bg-[#1A4B8C] text-white shadow-md"
                      : "bg-white border-gray-200 text-gray-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  }`}>
                  <div className="w-3.5 h-3.5 rounded-full flex-shrink-0 ring-2 ring-white/40"
                    style={{ backgroundColor: s.color }} />
                  <span className="text-xs font-medium text-center leading-tight">{s.label || t("lifecycle.stage_lbl")}</span>
                  {(s.is_terminal || s.is_initial) && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      activeStageIdx === i ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                    }`}>
                      {s.is_initial ? t("lc.initial") : t("lc.terminal")}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Single stage editor panel */}
            {editStages[activeStageIdx] && (() => {
              const stage = editStages[activeStageIdx];
              const idx   = activeStageIdx;
              return (
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-4">
                  {/* Row 1: color, label, type, move, delete */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <input type="color" value={stage.color}
                      onChange={e => updateStage(idx, { color: e.target.value })}
                      className="w-7 h-7 rounded-lg cursor-pointer border border-gray-200 p-0.5 bg-white flex-shrink-0" />
                    <input type="text" value={stage.label}
                      onChange={e => updateStage(idx, { label: e.target.value })}
                      className="flex-1 text-sm font-semibold bg-white border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
                      placeholder={t("lc.stage_name_ph")} />
                    <select value={stage.is_terminal ? "terminal" : "active"}
                      onChange={e => updateStage(idx, { is_terminal: e.target.value === "terminal", ...(e.target.value === "terminal" ? { allowed_next: [], allowed_roles: [], is_initial: false } : {}) })}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none flex-shrink-0">
                      <option value="active">{t("lc.stage_active")}</option>
                      <option value="terminal">{t("lc.terminal")}</option>
                    </select>
                    {!stage.is_terminal && (
                      <>
                        <button onClick={() => setInitialStage(idx)}
                          title={t("lc.initial_status_tooltip")}
                          className={`text-xs px-2 py-1.5 rounded-lg border font-semibold transition-colors flex-shrink-0 ${
                            stage.is_initial
                              ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                              : "bg-white text-gray-400 border-gray-200 hover:border-emerald-300 hover:text-emerald-600"
                          }`}>
                          {t("lc.initial")}
                        </button>
                        <button onClick={() => cycleTrigger(idx)}
                          title={t("lc.entry_tooltip")}
                          className={`text-xs px-2 py-1.5 rounded-lg border font-semibold transition-colors flex-shrink-0 ${
                            (stage.trigger ?? "manual") === "auto"
                              ? "bg-purple-50 text-purple-700 border-purple-300"
                              : (stage.trigger ?? "manual") === "both"
                              ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                              : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
                          }`}>
                          {(stage.trigger ?? "manual") === "auto" ? t("lc.trigger_auto") : (stage.trigger ?? "manual") === "both" ? t("lc.trigger_both") : t("lc.trigger_manual")}
                        </button>
                      </>
                    )}
                    <button onClick={() => moveStage(idx, -1)} disabled={idx === 0}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-20 w-6 text-center flex-shrink-0 font-bold">↑</button>
                    <button onClick={() => moveStage(idx, 1)} disabled={idx === editStages.length - 1}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-20 w-6 text-center flex-shrink-0 font-bold">↓</button>
                    <button onClick={() => removeStage(idx)}
                      className="text-red-300 hover:text-red-500 w-6 text-center flex-shrink-0 text-lg leading-none">×</button>
                  </div>

                  {/* Roles + allowed_next + access rules (only for active stages) */}
                  {!stage.is_terminal && (
                    <div className="space-y-3">
                      {/* Roles */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-16 flex-shrink-0">{t("cs.step_roles")}</span>
                        {ROLES.map(r => {
                          const on = (stage.allowed_roles ?? []).includes(r.key);
                          return (
                            <button key={r.key} onClick={() => toggleRole(idx, r.key)}
                              className="text-xs px-2.5 py-0.5 rounded-full font-semibold border transition-colors"
                              style={on
                                ? { backgroundColor: r.bg, color: r.color, borderColor: r.bg }
                                : { backgroundColor: "white", color: "#9ca3af", borderColor: "#e5e7eb" }}>
                              {r.label}
                            </button>
                          );
                        })}
                        {!(stage.allowed_roles ?? []).length && (
                          <span className="text-[10px] text-gray-400 italic">{t("lc.any_role")}</span>
                        )}
                      </div>

                      {/* Next → */}
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-16 flex-shrink-0 pt-0.5">{t("lc.next_arrow")}</span>
                        <div className="flex flex-wrap gap-1">
                          {editStages.filter((_, j) => j !== idx).map(s => {
                            const on = (stage.allowed_next ?? []).includes(s.key);
                            return (
                              <button key={s.key} onClick={() => toggleNext(idx, s.key)}
                                className="text-[11px] px-2 py-0.5 rounded-full font-semibold border transition-colors"
                                style={on
                                  ? { backgroundColor: s.color + "22", color: s.color, borderColor: s.color + "55" }
                                  : { backgroundColor: "white", color: "#9ca3af", borderColor: "#e5e7eb" }}>
                                {s.label || s.key}
                              </button>
                            );
                          })}
                          {!(stage.allowed_next ?? []).length && (
                            <span className="text-[10px] text-gray-400 italic">{t("lc.any_stage")}</span>
                          )}
                        </div>
                      </div>

                      {/* Access Rules */}
                      <div className="pt-3 border-t border-gray-200 space-y-2.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block">{t("lc.access_rules")}</span>

                        {/* Action toggles */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-14 flex-shrink-0">{t("lc.allow")}</span>
                          {ACTION_RULES.map(({ key, label }) => {
                            const allowed = stage.rules?.[key] ?? true;
                            return (
                              <button key={key}
                                onClick={() => updateStage(idx, { rules: { ...(stage.rules ?? {}), [key]: !allowed } })}
                                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border transition-colors ${
                                  allowed
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-red-50 text-red-500 border-red-200"
                                }`}>
                                {allowed ? <Check size={12} className="inline" /> : <X size={12} className="inline" />} {label}
                              </button>
                            );
                          })}
                        </div>

                        {/* Tab order + visibility */}
                        <div className="flex items-start gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-14 flex-shrink-0 pt-1">{t("lc.tabs")}</span>
                          <div className="flex-1 flex flex-col gap-1.5">
                            {(() => {
                              const visibleIds = stage.rules?.visible_tabs ?? ALL_TABS.map(x => x.id);
                              const savedOrder = stage.rules?.tab_order ?? [];
                              const orderedIds = [
                                ...savedOrder.filter(id => visibleIds.includes(id)),
                                ...visibleIds.filter(id => !savedOrder.includes(id)),
                              ];
                              const hiddenTabs = ALL_TABS.filter(tb => !orderedIds.includes(tb.id));

                              function moveTab(i, dir) {
                                const next = [...orderedIds];
                                const j = i + dir;
                                if (j < 0 || j >= next.length) return;
                                [next[i], next[j]] = [next[j], next[i]];
                                updateStage(idx, { rules: { ...(stage.rules ?? {}), tab_order: next, visible_tabs: next.length === ALL_TABS.length ? null : next } });
                              }
                              function removeTab(tabId) {
                                const next = orderedIds.filter(id => id !== tabId);
                                updateStage(idx, { rules: { ...(stage.rules ?? {}), tab_order: next, visible_tabs: next.length === ALL_TABS.length ? null : next } });
                              }
                              function addTab(tabId) {
                                const next = [...orderedIds, tabId];
                                updateStage(idx, { rules: { ...(stage.rules ?? {}), tab_order: next, visible_tabs: next.length === ALL_TABS.length ? null : next } });
                              }

                              return (
                                <>
                                  {orderedIds.map((tabId, i) => {
                                    const tb = ALL_TABS.find(t => t.id === tabId);
                                    if (!tb) return null;
                                    return (
                                      <div key={tabId} className="flex items-center gap-1">
                                        <span className="text-[9px] font-bold text-gray-300 w-3.5 text-right flex-shrink-0">{i+1}</span>
                                        <span className="flex-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2 py-0.5">{tb.label}</span>
                                        <button onClick={() => moveTab(i,-1)} disabled={i===0} className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"><ChevronUp size={11}/></button>
                                        <button onClick={() => moveTab(i, 1)} disabled={i===orderedIds.length-1} className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"><ChevronDown size={11}/></button>
                                        <button onClick={() => removeTab(tabId)} className="w-5 h-5 flex items-center justify-center rounded text-red-300 hover:text-red-500 hover:bg-red-50 transition-colors"><X size={9}/></button>
                                      </div>
                                    );
                                  })}
                                  {hiddenTabs.length > 0 && (
                                    <div className="flex flex-wrap gap-1 pt-0.5">
                                      {hiddenTabs.map(tb => (
                                        <button key={tb.id} onClick={() => addTab(tb.id)}
                                          className="text-[10px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-400 border border-dashed border-gray-300 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                                          + {tb.label}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Bypass roles */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-14 flex-shrink-0">{t("lc.bypass")}</span>
                          {["admin", "manager", "consultant", "client"].map(role => {
                            const bypass = stage.rules?.bypass_roles ?? ["admin", "manager"];
                            const on = bypass.includes(role);
                            return (
                              <button key={role}
                                onClick={() => {
                                  const cur = stage.rules?.bypass_roles ?? ["admin", "manager"];
                                  const next = on ? cur.filter(r => r !== role) : [...cur, role];
                                  updateStage(idx, { rules: { ...(stage.rules ?? {}), bypass_roles: next } });
                                }}
                                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border transition-colors ${
                                  on ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-white text-gray-400 border-gray-200"
                                }`}>
                                {ROLE_LABEL_KEYS[role] ? t(ROLE_LABEL_KEYS[role]) : cap(role)}
                              </button>
                            );
                          })}
                          <span className="text-[10px] text-gray-400 italic">{t("lc.bypass_hint")}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          <div className="flex justify-end pt-2 border-t border-gray-100">
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-50">
              {saving ? t("state.saving") : t("lc.save_template")}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex" style={{ minHeight: 420 }}>
          {/* Left sidebar — template list */}
          <div className="w-48 flex-shrink-0 border-r border-gray-100 flex flex-col py-2">
            {templates.map(tmpl => (
              <div key={tmpl.id}
                className={`group flex items-start gap-1 pr-2 transition-colors ${viewTmpl?.id === tmpl.id ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                <button onClick={() => setViewTmpl(tmpl)} className="flex-1 text-left px-4 py-3 min-w-0">
                  <div className={`font-semibold text-sm ${viewTmpl?.id === tmpl.id ? "text-blue-700" : "text-gray-800"}`}>{tmpl.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5 leading-tight">{tmpl.description}</div>
                </button>
                <button onClick={() => handleDelete(tmpl)}
                  title={t("label.delete_template")}
                  className="opacity-0 group-hover:opacity-100 mt-3 text-red-300 hover:text-red-500 text-base leading-none flex-shrink-0 px-1">
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Right panel — vertical flow */}
          {viewTmpl && (
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-bold text-gray-900 text-lg">{viewTmpl.name} Lifecycle</h3>
                    {viewTmpl.subtitle && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{viewTmpl.subtitle}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{viewTmpl.description}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                  <button onClick={() => startEdit(viewTmpl)}
                    className="px-4 py-1.5 bg-[#1A4B8C] hover:bg-blue-900 text-white text-sm font-semibold rounded-xl">
                    <Pencil size={13} className="mr-1 inline" />{t("lc.edit_stages")}
                  </button>
                  <button onClick={() => handleDelete(viewTmpl)}
                    className="px-3 py-1.5 border border-red-200 text-red-500 hover:bg-red-50 text-sm font-semibold rounded-xl">
                    {t("action.delete")}
                  </button>
                </div>
              </div>

              <div className="max-w-md">
                {viewTmpl.stages.map((s, i) => (
                  <Fragment key={s.key}>
                    {i > 0 && (
                      <div className="ml-[18px] flex flex-col" style={{ gap: 0 }}>
                        <div className="w-px h-4 bg-gray-200 self-start ml-px" />
                        <div className="self-start ml-[-3px]" style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "5px solid #d1d5db" }} />
                      </div>
                    )}
                    <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="font-semibold text-gray-900 text-sm flex-1">{s.label}</span>
                      {s.is_terminal ? (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                          {t("lc.terminal")}
                        </span>
                      ) : (
                        <div className="flex gap-1.5 flex-wrap justify-end">
                          {(s.allowed_roles ?? []).length === 0
                            ? <span className="text-[10px] text-gray-400 italic">{t("lc.any_role")}</span>
                            : (s.allowed_roles ?? []).map(r => {
                                const rm = ROLES.find(x => x.key === r);
                                if (!rm) return null;
                                return (
                                  <span key={r} className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                    style={{ backgroundColor: rm.bg, color: rm.color }}>
                                    {rm.label}
                                  </span>
                                );
                              })}
                        </div>
                      )}
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// CLIENT PROFILE VIEW
// ============================================================
const CASE_DEFAULTS_EMPTY = {
  priority: "medium", area_sap: "", area_industry: "", is_confidential: false, nda_required: false,
  description: "", sla: "standard", budget: "", work_mode: "remote", skills: "",
  travel_required: false, work_location: "", min_years_experience: "",
  languages_required: [], security_clearance: false, interview_required: false,
  interview_format: "video", interview_rounds: 1, technical_assessment: false,
};

function CaseDefaultsPanel({ profile, updateProfile }) {
  const { t } = useT();
  const { settings: catalogSettings } = useSystemSettings();
  const [form, setForm]   = useState(CASE_DEFAULTS_EMPTY);
  const [saving, setSaving] = useState(false);
  const [langInput, setLangInput] = useState("");

  useEffect(() => {
    const d = profile?.case_defaults ?? {};
    setForm({
      priority:             d.priority             ?? "medium",
      area_sap:             d.area_sap             ?? "",
      area_industry:        d.area_industry        ?? "",
      is_confidential:      d.is_confidential      ?? false,
      nda_required:         d.nda_required         ?? false,
      description:          d.description          ?? "",
      sla:                  d.sla                  ?? "standard",
      budget:               d.budget               ?? "",
      work_mode:            d.work_mode            ?? "remote",
      skills:               d.skills               ?? "",
      travel_required:      d.travel_required      ?? false,
      work_location:        d.work_location        ?? "",
      min_years_experience: d.min_years_experience ?? "",
      languages_required:   d.languages_required   ?? [],
      security_clearance:   d.security_clearance   ?? false,
      interview_required:   d.interview_required   ?? false,
      interview_format:     d.interview_format     ?? "video",
      interview_rounds:     d.interview_rounds     ?? 1,
      technical_assessment: d.technical_assessment ?? false,
    });
  }, [profile]);

  async function handleSave() {
    setSaving(true);
    try { await updateProfile({ case_defaults: form }); }
    catch (e) { alert(e.message); }
    setSaving(false);
  }

  function addLang(val) {
    const v = val.trim();
    if (!v || form.languages_required.includes(v)) return;
    setForm(p => ({ ...p, languages_required: [...p.languages_required, v] }));
    setLangInput("");
  }

  const sectionHdr = txt => (
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{txt}</p>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
      <div>
        <h2 className="font-bold text-gray-900">{t("cd.title")}</h2>
        <p className="text-sm text-gray-400 mt-0.5">{t("cd.subtitle")}</p>
      </div>

      {/* Case Info defaults */}
      <div>
        {sectionHdr(t("cd.section_info"))}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Select label={t("cd.default_priority")} value={form.priority}
              onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
              options={["low","medium","high","critical"].map(v => ({ value: v, label: PRIORITY_LABEL_KEYS[v] ? t(PRIORITY_LABEL_KEYS[v]) : cap(v) }))} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("cd.default_sap_area")}</label>
              <select value={form.area_sap} onChange={e => setForm(p => ({ ...p, area_sap: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">{t("cd.none")}</option>
                {(catalogSettings?.["catalog_sap_areas"] ?? SAP_AREAS).map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("cd.default_industry")}</label>
            <select value={form.area_industry} onChange={e => setForm(p => ({ ...p, area_industry: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">{t("cd.none")}</option>
              {(catalogSettings?.["catalog_industries"] ?? INDUSTRY_AREAS).map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <Textarea label={t("cd.default_desc_tmpl")} value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder={t("cd.desc_tmpl_ph")} />
          <div className="flex gap-6">
            {[["is_confidential", t("cd.private_default")],["nda_required", t("cd.nda_default")]].map(([k,lbl]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.checked }))} className="rounded accent-blue-600" />
                {lbl}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Scope defaults */}
      <div className="border-t border-gray-100 pt-5">
        {sectionHdr(t("cd.section_scope"))}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("cd.default_sla")}</label>
              <select value={form.sla} onChange={e => setForm(p => ({ ...p, sla: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {SLA_PRESETS.map(o => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
              </select>
            </div>
            <Input label={t("cd.default_budget")} type="number" value={form.budget}
              onChange={e => setForm(p => ({ ...p, budget: e.target.value }))} placeholder={t("case.ph_budget_num")} />
          </div>
          <Input label={t("cd.default_skills")} value={form.skills}
            onChange={e => setForm(p => ({ ...p, skills: e.target.value }))}
            placeholder={t("label.ph_skills")} />
        </div>
      </div>

      {/* Work arrangement defaults */}
      <div className="border-t border-gray-100 pt-5">
        {sectionHdr(t("cd.section_work"))}
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: "remote", label: t("cd.mode_remote"),  desc: t("cd.mode_remote_desc") },
              { value: "onsite", label: t("cd.mode_onsite"),  desc: t("cd.mode_onsite_desc") },
              { value: "hybrid", label: t("cd.mode_hybrid"),  desc: t("cd.mode_hybrid_desc") },
            ].map(opt => (
              <button key={opt.value} type="button" onClick={() => setForm(p => ({ ...p, work_mode: opt.value }))}
                className={`text-left p-3 border-2 rounded-xl transition-all ${form.work_mode === opt.value ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                <div className="font-semibold text-sm text-gray-900">{opt.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
          {(form.work_mode === "onsite" || form.work_mode === "hybrid") && (
            <Input label={t("cd.default_location")} value={form.work_location}
              onChange={e => setForm(p => ({ ...p, work_location: e.target.value }))} placeholder={t("case.ph_location_eg")} />
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.travel_required} onChange={e => setForm(p => ({ ...p, travel_required: e.target.checked }))} className="rounded accent-blue-600" />
            {t("cd.travel_default")}
          </label>
        </div>
      </div>

      {/* Qualifications defaults */}
      <div className="border-t border-gray-100 pt-5">
        {sectionHdr(t("cd.section_qual"))}
        <div className="space-y-3">
          <Input label={t("cd.min_years")} type="number" value={form.min_years_experience}
            onChange={e => setForm(p => ({ ...p, min_years_experience: e.target.value }))} placeholder={t("proj.ph_n_eg")} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("cd.default_langs")}</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.languages_required.map(l => (
                <span key={l} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                  {l}
                  <button onClick={() => setForm(p => ({ ...p, languages_required: p.languages_required.filter(x => x !== l) }))}
                    className="hover:text-red-500"><X size={11} /></button>
                </span>
              ))}
            </div>
            <input value={langInput} onChange={e => setLangInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addLang(langInput); } }}
              placeholder={t("cd.lang_ph")}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.security_clearance} onChange={e => setForm(p => ({ ...p, security_clearance: e.target.checked }))} className="rounded accent-blue-600" />
            {t("cd.security_default")}
          </label>
        </div>
      </div>

      {/* Interview defaults */}
      <div className="border-t border-gray-100 pt-5">
        {sectionHdr(t("cd.section_interview"))}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.interview_required} onChange={e => setForm(p => ({ ...p, interview_required: e.target.checked }))} className="rounded accent-blue-600" />
            {t("cd.interview_default")}
          </label>
          {form.interview_required && (
            <>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">{t("cd.default_format")}</p>
                <div className="grid grid-cols-3 gap-2">
                  {[["phone", t("cd.fmt_phone")],["video", t("cd.fmt_video")],["in_person", t("cd.fmt_in_person")]].map(([v,l]) => (
                    <button key={v} type="button" onClick={() => setForm(p => ({ ...p, interview_format: v }))}
                      className={`py-2 text-xs font-medium border-2 rounded-xl transition-all ${form.interview_format === v ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">{t("cd.default_rounds")}</p>
                <div className="flex gap-2">
                  {[1,2,3].map(n => (
                    <button key={n} type="button" onClick={() => setForm(p => ({ ...p, interview_rounds: n }))}
                      className={`w-10 h-10 rounded-xl border-2 text-sm font-bold transition-all ${form.interview_rounds === n ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form.technical_assessment} onChange={e => setForm(p => ({ ...p, technical_assessment: e.target.checked }))} className="rounded accent-blue-600" />
                {t("cd.tech_assess_default")}
              </label>
            </>
          )}
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t border-gray-100">
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? t("state.saving") : t("cd.save")}
        </button>
      </div>
    </div>
  );
}

const AS_DEFAULTS = {
  auto_assign_enabled: false, application_window_days: 7, min_applicants: 3,
  require_manager_approval: true, prefer_known_consultants: true,
  allow_new_consultants: true, max_hourly_rate: "", preferred_expertise_level: "any",
  max_overcommitment_tolerance: 0, notify_on_new_application: true, notify_on_auto_assign: true,
  weight_skills: 25, weight_rating: 20, weight_client_familiarity: 15,
  weight_client_rating: 15, weight_experience: 10, weight_rate: 10, weight_commitment: 5,
  start_reminders_enabled: true, start_reminder_1_days: 3, start_reminder_2_days: 1,
  start_overdue_action: "auto_start", start_overdue_grace_hours: 24,
};

function AssignmentSettingsPanel({ profile, updateProfile }) {
  const { t } = useT();
  const [form, setForm] = useState(AS_DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const s = profile?.assignment_settings ?? {};
    setForm({ ...AS_DEFAULTS, ...s, max_hourly_rate: s.max_hourly_rate ?? "" });
  }, [profile]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateProfile({
        assignment_settings: { ...form, max_hourly_rate: form.max_hourly_rate ? Number(form.max_hourly_rate) : null },
      });
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  const totalWeight = (form.weight_skills ?? 0) + (form.weight_rating ?? 0) +
    (form.weight_client_familiarity ?? 0) + (form.weight_client_rating ?? 0) +
    (form.weight_experience ?? 0) + (form.weight_rate ?? 0) + (form.weight_commitment ?? 0);

  const sHdr = txt => <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{txt}</p>;

  const Toggle = ({ field, label, desc }) => (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
      <div>
        <div className="text-sm font-medium text-gray-900">{label}</div>
        {desc && <div className="text-xs text-gray-400 mt-0.5">{desc}</div>}
      </div>
      <button type="button" onClick={() => setForm(p => ({ ...p, [field]: !p[field] }))}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ml-4 ${form[field] ? "bg-blue-600" : "bg-gray-300"}`}>
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form[field] ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
      <div>
        <h2 className="font-bold text-gray-900">{t("as.title")}</h2>
        <p className="text-sm text-gray-400 mt-0.5">{t("as.subtitle")}</p>
      </div>

      {/* Auto-assignment */}
      <div>
        {sHdr(t("as.section_auto"))}
        <div className="space-y-3">
          <Toggle field="auto_assign_enabled" label={t("as.auto_enabled")}
            desc={t("as.auto_enabled_desc")} />
          {form.auto_assign_enabled && (
            <div className="pl-4 border-l-2 border-blue-100 space-y-3 mt-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("as.app_window")}</label>
                  <input type="number" min="1" max="90" value={form.application_window_days}
                    onChange={e => setForm(p => ({ ...p, application_window_days: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <p className="text-xs text-gray-400 mt-1">{t("as.app_window_desc")}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("as.min_applicants")}</label>
                  <input type="number" min="1" max="20" value={form.min_applicants}
                    onChange={e => setForm(p => ({ ...p, min_applicants: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <p className="text-xs text-gray-400 mt-1">{t("as.min_applicants_desc")}</p>
                </div>
              </div>
              <Toggle field="require_manager_approval" label={t("as.mgr_approval")}
                desc={t("as.mgr_approval_desc")} />
            </div>
          )}
        </div>
      </div>

      {/* Selection preferences */}
      <div className="border-t border-gray-100 pt-5">
        {sHdr(t("as.section_pref"))}
        <div className="space-y-3">
          <Toggle field="prefer_known_consultants" label={t("as.prefer_known")}
            desc={t("as.prefer_known_desc")} />
          <Toggle field="allow_new_consultants" label={t("as.allow_new")}
            desc={t("as.allow_new_desc")} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("as.max_rate")}</label>
              <input type="number" min="0" value={form.max_hourly_rate}
                onChange={e => setForm(p => ({ ...p, max_hourly_rate: e.target.value }))}
                placeholder={t("as.no_cap")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-gray-400 mt-1">{t("as.max_rate_desc")}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("as.pref_expertise")}</label>
              <select value={form.preferred_expertise_level}
                onChange={e => setForm(p => ({ ...p, preferred_expertise_level: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {[["any","exp.any"],["junior","exp.junior"],["mid","exp.mid"],["senior","exp.senior"],["expert","exp.expert"]].map(([v, k]) => (
                  <option key={v} value={v}>{t(k)}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("as.overcommit_label")} — <span className="text-blue-600 font-bold">{form.max_overcommitment_tolerance}%</span>
            </label>
            <input type="range" min="0" max="20" step="5" value={form.max_overcommitment_tolerance}
              onChange={e => setForm(p => ({ ...p, max_overcommitment_tolerance: Number(e.target.value) }))}
              className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600" />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{t("as.strict")}</span><span>10%</span><span>{t("as.flexible")}</span>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {form.max_overcommitment_tolerance === 0
                ? t("as.overcommit_zero")
                : t("as.overcommit_nonzero").replace("{n}", form.max_overcommitment_tolerance)}
            </p>
          </div>
        </div>
      </div>

      {/* Scoring weights */}
      <div className="border-t border-gray-100 pt-5">
        {sHdr(t("as.section_scoring"))}
        <p className="text-xs text-gray-400 mb-4">
          {t("as.scoring_desc")}
          {" "}<span className={`font-bold ${totalWeight === 100 ? "text-green-600" : "text-blue-600"}`}>{t("as.scoring_total").replace("{n}", totalWeight)}</span>
        </p>
        <div className="space-y-4">
          {[
            ["weight_skills",             t("as.w_skills"),      t("as.w_skills_desc")],
            ["weight_rating",             t("as.w_rating"),      t("as.w_rating_desc")],
            ["weight_client_familiarity", t("as.w_client_fam"),  t("as.w_client_fam_desc")],
            ["weight_client_rating",      t("as.w_client_rat"),  t("as.w_client_rat_desc")],
            ["weight_experience",         t("as.w_experience"),  t("as.w_experience_desc")],
            ["weight_rate",               t("as.w_rate"),        t("as.w_rate_desc")],
            ["weight_commitment",         t("as.w_commit"),      t("as.w_commit_desc")],
          ].map(([field, label, desc]) => (
            <div key={field}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{label}</span>
                  <span className="text-xs text-gray-400">{desc}</span>
                </div>
                <span className="text-sm font-bold text-blue-700 w-8 text-right flex-shrink-0">{form[field] ?? 0}</span>
              </div>
              <input type="range" min="0" max="50" step="5" value={form[field] ?? 0}
                onChange={e => setForm(p => ({ ...p, [field]: Number(e.target.value) }))}
                className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600" />
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-3">
          <div className="flex-1 bg-gray-50 rounded-xl p-3">
            <div className="text-xs text-gray-400 mb-2">{t("as.weight_dist")}</div>
            <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
              {[
                ["weight_skills","#3b82f6"],["weight_rating","#8b5cf6"],
                ["weight_client_familiarity","#06b6d4"],["weight_client_rating","#14b8a6"],
                ["weight_experience","#f59e0b"],["weight_rate","#10b981"],["weight_commitment","#f97316"],
              ].map(([field, color]) => (
                <div key={field} style={{ flex: form[field] ?? 0, backgroundColor: color, minWidth: (form[field] ?? 0) > 0 ? 2 : 0 }} />
              ))}
            </div>
          </div>
          <button type="button" onClick={() => setForm(p => ({ ...p, ...AS_DEFAULTS }))}
            className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50">
            {t("as.reset")}
          </button>
        </div>
      </div>

      {/* Start Date Reminders */}
      <div className="border-t border-gray-100 pt-5">
        {sHdr(t("as.section_reminders"))}
        <div className="space-y-3">
          <Toggle field="start_reminders_enabled" label={t("as.reminders_enabled")}
            desc={t("as.reminders_enabled_desc")} />
          {form.start_reminders_enabled && (
            <div className="pl-4 border-l-2 border-amber-100 space-y-3 mt-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("as.reminder_1")}</label>
                  <input type="number" min="1" max="30" value={form.start_reminder_1_days}
                    onChange={e => setForm(p => ({ ...p, start_reminder_1_days: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <p className="text-xs text-gray-400 mt-1">{t("as.reminder_1_desc")}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("as.reminder_2")}</label>
                  <input type="number" min="1" max="14" value={form.start_reminder_2_days}
                    onChange={e => setForm(p => ({ ...p, start_reminder_2_days: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <p className="text-xs text-gray-400 mt-1">{t("as.reminder_2_desc")}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("as.overdue_action")}</label>
                  <select value={form.start_overdue_action}
                    onChange={e => setForm(p => ({ ...p, start_overdue_action: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="auto_start">{t("as.overdue_auto_start")}</option>
                    <option value="notify_manager">{t("as.overdue_notify_mgr")}</option>
                    <option value="auto_unassign">{t("as.overdue_unassign")}</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">{t("as.overdue_action_desc")}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("as.grace_period")}</label>
                  <input type="number" min="0" max="72" step="1" value={form.start_overdue_grace_hours}
                    onChange={e => setForm(p => ({ ...p, start_overdue_grace_hours: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <p className="text-xs text-gray-400 mt-1">{t("as.grace_desc")}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notifications */}
      <div className="border-t border-gray-100 pt-5">
        {sHdr(t("as.section_notif"))}
        <div className="space-y-3">
          <Toggle field="notify_on_new_application" label={t("as.notif_app")}
            desc={t("as.notif_app_desc")} />
          <Toggle field="notify_on_auto_assign" label={t("as.notif_auto")}
            desc={t("as.notif_auto_desc")} />
        </div>
      </div>

      <div className="flex justify-end pt-2 border-t border-gray-100">
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2 bg-[#1A4B8C] text-white text-sm font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-50">
          {saving ? t("state.saving") : t("as.save")}
        </button>
      </div>
    </div>
  );
}

export { LifecycleSettingsView, CASE_DEFAULTS_EMPTY, CaseDefaultsPanel, AS_DEFAULTS, AssignmentSettingsPanel };
