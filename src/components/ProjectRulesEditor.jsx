// Settings → Spec quality → mandatory rules: platform defaults and each project's own list.
import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { DEFAULT_PROJECT_RULES, RULE_CHECK_LABEL } from "../lib/projectRules.js";

export function ProjectRulesEditor({ ssCtx }) {
  const cfg = ssCtx.settings?.spec_project_rules ?? {};
  const [projects, setProjects] = useState([]);
  const [scope, setScope] = useState('defaults');          // 'defaults' | projectId
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.from('projects').select('id, name').order('name').then(({ data }) => setProjects(data ?? []));
  }, []);
  const defaults = Array.isArray(cfg.defaults) ? cfg.defaults : DEFAULT_PROJECT_RULES;
  const own = scope !== 'defaults' ? cfg.projects?.[scope] : null;
  const current = scope === 'defaults' ? defaults : (Array.isArray(own) ? own : null);
  useEffect(() => { setDraft(JSON.parse(JSON.stringify(current ?? defaults))); }, [scope, JSON.stringify(cfg)]); // eslint-disable-line react-hooks/exhaustive-deps

  const usesDefaults = scope !== 'defaults' && !Array.isArray(own);
  const dirty = usesDefaults || JSON.stringify(draft) !== JSON.stringify(current);
  const upd = (i, patch) => setDraft(d => d.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function save() {
    setSaving(true);
    const clean = draft.filter(r => r.text?.trim());
    const next = scope === 'defaults'
      ? { ...cfg, defaults: clean }
      : { ...cfg, projects: { ...(cfg.projects ?? {}), [scope]: clean } };
    await ssCtx.setSetting('spec_project_rules', next);
    setSaving(false); setDone(true); setTimeout(() => setDone(false), 2000);
  }
  async function backToDefaults() {
    const projectsCfg = { ...(cfg.projects ?? {}) };
    delete projectsCfg[scope];
    await ssCtx.setSetting('spec_project_rules', { ...cfg, projects: projectsCfg });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-1">Reglas obligatorias del proyecto</h2>
        <p className="text-sm text-gray-500">Se envían en cada generación de specs (en la Spec C como excepción explícita a la regla "tal cual"). Las reglas marcadas "Verifica" se comprueban sobre los objetos técnicos generados y cuentan como brechas en la cobertura.</p>
      </div>
      <label className="block text-xs font-semibold text-gray-700">Aplicar a
        <select value={scope} onChange={e => setScope(e.target.value)} className="mt-1 block w-full max-w-md px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="defaults">Plataforma (por defecto para proyectos sin reglas propias)</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}{Array.isArray(cfg.projects?.[p.id]) ? ' · reglas propias' : ''}</option>)}
        </select>
      </label>
      {usesDefaults && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Este proyecto usa las reglas de la plataforma. Al guardar, se crea su propia lista a partir de ellas.</p>}
      <div className="space-y-2">
        {draft.map((r, i) => (
          <div key={r.id ?? i} className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-start gap-3">
            <input type="checkbox" checked={r.enabled !== false} onChange={e => upd(i, { enabled: e.target.checked })} className="mt-1 accent-blue-600" />
            <div className="flex-1 space-y-1">
              <textarea rows={2} value={r.text} onChange={e => upd(i, { text: e.target.value })}
                className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white" />
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                {r.check ? <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">{RULE_CHECK_LABEL[r.check]}</span> : <span>Solo instrucción (no se verifica automáticamente)</span>}
                {r.check === 'naming' && (
                  <label className="flex items-center gap-1">Patrón (expresión regular):
                    <input value={r.pattern ?? ''} onChange={e => upd(i, { pattern: e.target.value })} placeholder="^Z(MM|FI|SD)_" className="px-2 py-0.5 border border-gray-200 rounded text-xs font-mono bg-white" />
                  </label>
                )}
              </div>
            </div>
            {!DEFAULT_PROJECT_RULES.some(d => d.id === r.id) && (
              <button onClick={() => setDraft(d => d.filter((_, j) => j !== i))} className="p-1 text-gray-400 hover:text-red-500" title="Quitar regla"><Trash2 size={14} /></button>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => setDraft(d => [...d, { id: `custom_${Date.now()}`, enabled: true, text: '' }])}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"><Plus size={13} />Agregar regla</button>
        <div className="flex gap-2">
          {scope !== 'defaults' && !usesDefaults && (
            <button onClick={backToDefaults} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Usar las reglas de la plataforma</button>
          )}
          <button onClick={save} disabled={!dirty || saving} className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">{saving ? 'Guardando…' : done ? 'Guardado ✓' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  );
}
