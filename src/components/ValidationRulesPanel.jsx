import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";
import { useSystemSettings } from "../hooks/useSystemSettings.jsx";
import { useLifecycleTemplates } from "../hooks/useLifecycleHooks.js";
import { GATE_CONDITIONS } from "../lib/businessConstants.js";
import { VALIDATION_POLICIES, resolvePolicies, resolveGate, caseValidationScope } from "../lib/validationPolicies.js";

const MODE_STYLE = {
  block: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
  warn:  'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  off:   'bg-gray-100 text-gray-500 border-gray-200 dark:bg-white/5 dark:text-white/40 dark:border-white/10',
};
const SOURCE_LABEL = { default: 'Default', global: 'Global', partner: 'Partner', customer: 'Customer', project: 'Project' };
const ModeBadge = ({ mode }) => (
  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase ${MODE_STYLE[mode] ?? MODE_STYLE.off}`}>{mode}</span>
);
const selectCls = 'text-xs border border-gray-200 dark:border-white/15 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white';

/**
 * Validation rules editor.
 *   level 'global'  → validation_policies (global defaults for the policies)
 *   level 'partner' → validation_overrides.partner[entityId] (policies + gate overrides)
 *   level 'client'  → validation_overrides.client[entityId]  (customer; policies + gate overrides)
 *   level 'project' → validation_overrides.project[entityId] (policies + gate overrides)
 * `parentPartnerId` / `parentClientId` show what the level inherits from the levels above.
 * Overrides are saved through set_validation_override (partner owners/admins on the Pro plan,
 * or staff).
 */
export function ValidationRulesEditor({ level, entityId, parentPartnerId = null, parentClientId = null, defaultLifecycle = 'support', canEdit }) {
  const ssCtx = useSystemSettings();
  const { settings } = ssCtx;
  const { templates, getTemplateStages } = useLifecycleTemplates();
  const isGlobal = level === 'global';
  const overrides = settings['validation_overrides'] ?? {};
  const mine = isGlobal ? null : (overrides[level]?.[entityId] ?? {});
  const [lifecycleKey, setLifecycleKey] = useState(defaultLifecycle);
  const [openStage, setOpenStage] = useState(null);
  const [saving, setSaving] = useState(false);

  // What this level inherits (everything above it).
  const inheritScope = level === 'project' ? { partnerId: parentPartnerId, clientId: parentClientId }
                     : level === 'client'  ? { partnerId: parentPartnerId } : {};
  const [saveError, setSaveError] = useState(null);
  const inheritedPolicies = resolvePolicies(settings, inheritScope);

  async function savePolicy(key, value) {
    setSaving(true); setSaveError(null);
    try {
      if (isGlobal) {
        const cur = { ...(settings['validation_policies'] ?? {}) };
        if (value) cur[key] = value; else delete cur[key];
        await ssCtx.setSetting('validation_policies', cur);
      } else {
        const ent = { ...(mine ?? {}), policies: { ...(mine?.policies ?? {}) } };
        if (value) ent.policies[key] = value; else delete ent.policies[key];
        await ssCtx.setValidationOverride(level, entityId, ent);
      }
    } catch (e) { setSaveError(e.message); } finally { setSaving(false); }
  }

  async function saveGate(stage, condKey, value) {
    setSaving(true); setSaveError(null);
    try {
      const gates = { ...(mine?.gates ?? {}) };
      const lc = { ...(gates[lifecycleKey] ?? {}) };
      const st = { ...(lc[stage] ?? {}) };
      if (value) st[condKey] = value; else delete st[condKey];
      lc[stage] = st; gates[lifecycleKey] = lc;
      await ssCtx.setValidationOverride(level, entityId, { ...(mine ?? {}), gates });
    } catch (e) { setSaveError(e.message); } finally { setSaving(false); }
  }

  const lifecycleOptions = useMemo(() => {
    const keys = new Set([...(templates ?? []).map(t => t.key), ...Object.keys(settings['transition_gates'] ?? {})]);
    return [...keys].filter(Boolean);
  }, [templates, settings]);
  const stages = (getTemplateStages(lifecycleKey) ?? []).filter(s => !s.is_initial);

  const groups = [...new Set(VALIDATION_POLICIES.map(p => p.group))];
  const myGateCount = Object.values(mine?.gates?.[lifecycleKey] ?? {}).reduce((n, st) => n + Object.keys(st ?? {}).length, 0);

  return (
    <div className="space-y-5">
      {groups.map(g => (
        <div key={g}>
          <p className="text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest mb-2">{g}</p>
          <div className="space-y-2">
            {VALIDATION_POLICIES.filter(p => p.group === g).map(p => {
              const own = isGlobal ? (settings['validation_policies'] ?? {})[p.key] : mine?.policies?.[p.key];
              const inherited = isGlobal ? { mode: p.default, source: 'default' } : inheritedPolicies[p.key];
              return (
                <div key={p.key} className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{p.label}</p>
                    <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5">{p.desc}</p>
                  </div>
                  <select disabled={!canEdit || saving} value={own ?? ''} onChange={e => savePolicy(p.key, e.target.value || null)} className={selectCls}>
                    <option value="">{isGlobal ? `Default (${p.default})` : `Inherit (${inherited.mode} · ${SOURCE_LABEL[inherited.source]})`}</option>
                    {p.modes.map(m => <option key={m} value={m}>{m === 'block' ? 'Block' : m === 'warn' ? 'Warn' : 'Off'}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="p-3 rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 text-xs text-blue-800 dark:text-blue-200">
        Always on: the platform never writes to SAP environments of type QA or Production.
      </div>

      {!isGlobal && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <p className="text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest">Stage gates {myGateCount ? `· ${myGateCount} override${myGateCount > 1 ? 's' : ''}` : ''}</p>
            <select value={lifecycleKey} onChange={e => { setLifecycleKey(e.target.value); setOpenStage(null); }} className={selectCls}>
              {lifecycleOptions.map(k => <option key={k} value={k}>{templates.find(t => t.key === k)?.name ?? k}</option>)}
            </select>
          </div>
          <p className="text-xs text-gray-500 dark:text-white/40 mb-2">Requirements to move a case into each stage. "Inherit" keeps the {level === 'project' ? 'partner / customer / global' : level === 'client' ? 'partner / global' : 'global'} rule (Settings → Workflow).</p>
          <div className="space-y-1.5">
            {stages.map(stage => {
              const inherited = resolveGate(settings, lifecycleKey, stage.key, inheritScope);
              const ownSt = mine?.gates?.[lifecycleKey]?.[stage.key] ?? {};
              const activeInh = inherited.conditions.filter(c => c.enabled);
              const isOpen = openStage === stage.key;
              return (
                <div key={stage.key} className="rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden">
                  <button onClick={() => setOpenStage(isOpen ? null : stage.key)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10">
                    {isOpen ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
                    <span className="w-2 h-2 rounded-full" style={{ background: stage.color ?? '#94A3B8' }} />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{stage.label}</span>
                    <span className="ml-auto text-[10px] text-gray-500 dark:text-white/40">
                      {activeInh.length} inherited{Object.keys(ownSt).length ? ` · ${Object.keys(ownSt).length} here` : ''}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="divide-y divide-gray-100 dark:divide-white/5">
                      {GATE_CONDITIONS.map(def => {
                        const inh = inherited.conditions.find(c => c.key === def.key);
                        const inhLabel = inh?.enabled ? `${inh.mode} · ${SOURCE_LABEL[inh.source]}` : 'not required';
                        return (
                          <div key={def.key} className="flex items-center gap-3 px-3 py-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-800 dark:text-white/80">{def.label}</p>
                              {def.description && <p className="text-[11px] text-gray-500 dark:text-white/35 truncate">{def.description}</p>}
                            </div>
                            <select disabled={!canEdit || saving} value={ownSt[def.key] ?? ''} onChange={e => saveGate(stage.key, def.key, e.target.value || null)} className={selectCls}>
                              <option value="">Inherit ({inhLabel})</option>
                              <option value="block">Block</option>
                              <option value="warn">Warn</option>
                              <option value="off">Off</option>
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {saveError && <p className="text-xs text-red-600">{saveError}</p>}
      {!canEdit && <p className="text-xs text-gray-500 dark:text-white/40">Only administrators, or the partner's owner and admins on the Pro plan, can change validation rules.</p>}
    </div>
  );
}

/** Read-only: the rules that apply to one case and where each comes from. */
export function EffectiveRulesPanel({ caseData, lifecycleKey, stages }) {
  const { settings } = useSystemSettings();
  const [open, setOpen] = useState(false);
  const scope = caseValidationScope(caseData);
  const pols = resolvePolicies(settings, scope);
  const gateRows = (stages ?? []).map(s => ({ stage: s, gate: resolveGate(settings, lifecycleKey, s.key, scope) }))
    .filter(r => r.gate.enabled);
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-900/60 overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-3 text-left">
        <ShieldCheck size={15} className="text-blue-600 dark:text-blue-400" />
        <span className="text-sm font-semibold text-gray-900 dark:text-white">Validation rules for this case</span>
        <span className="text-[11px] text-gray-500 dark:text-white/40">Global → Partner → Customer → Project</span>
        {open ? <ChevronDown size={14} className="ml-auto text-gray-400" /> : <ChevronRight size={14} className="ml-auto text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4">
          <div className="space-y-1.5">
            {VALIDATION_POLICIES.map(p => (
              <div key={p.key} className="flex items-center gap-2 text-xs">
                <ModeBadge mode={pols[p.key].mode} />
                <span className="text-gray-800 dark:text-white/80 flex-1">{p.label}</span>
                <span className="text-[10px] text-gray-500 dark:text-white/35">{SOURCE_LABEL[pols[p.key].source]}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 text-xs">
              <ModeBadge mode="block" />
              <span className="text-gray-800 dark:text-white/80 flex-1">No writes to QA / Production SAP systems</span>
              <span className="text-[10px] text-gray-500 dark:text-white/35">Always</span>
            </div>
          </div>
          {gateRows.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest">Stage requirements</p>
              {gateRows.map(({ stage, gate }) => (
                <div key={stage.key}>
                  <p className="text-xs font-semibold text-gray-700 dark:text-white/70">To enter “{stage.label}”</p>
                  <div className="mt-1 space-y-1 pl-2">
                    {gate.conditions.filter(c => c.enabled).map(c => (
                      <div key={c.key} className="flex items-center gap-2 text-xs">
                        <ModeBadge mode={c.mode} />
                        <span className="text-gray-700 dark:text-white/70 flex-1">{GATE_CONDITIONS.find(d => d.key === c.key)?.label ?? c.key}</span>
                        <span className="text-[10px] text-gray-500 dark:text-white/35">{SOURCE_LABEL[c.source]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
