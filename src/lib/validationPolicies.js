// ── Validation levels: Global → Customer → Project ──────────────────────────
// Global values live in system settings ('transition_gates', 'validation_policies');
// customers and projects can override them ('validation_overrides'). The most
// specific level wins. There are no case-level overrides (by design).
//
// validation_overrides = {
//   client:  { [clientId]:  { policies: { [policyKey]: mode }, gates: { [lifecycleKey]: { [stage]: { [condKey]: mode } } } } },
//   project: { [projectId]: { ...same shape } },
// }
// mode: 'block' | 'warn' | 'off'   (absent = inherit from the level above)

export const VALIDATION_POLICIES = [
  {
    key: 'sap_require_spec_and_stage', group: 'SAP implementation',
    label: 'Spec approved and case In Progress before writing to SAP',
    desc: 'The SAP implementation only runs when the case spec is approved and the case is In Progress or a later, non-closed stage.',
    modes: ['block', 'warn', 'off'], default: 'block',
  },
  {
    key: 'sap_naming_check', group: 'SAP implementation',
    label: 'Check SAP naming rules before writing',
    desc: 'Z/Y (or /NAMESPACE/) prefix, maximum name lengths per object type, no underscore in position 2–3 of table names.',
    modes: ['block', 'warn', 'off'], default: 'block',
  },
  {
    key: 'sap_require_package', group: 'SAP implementation',
    label: 'SAP package required (no $TMP)',
    desc: 'Objects must be created in a development package so they go into a transport.',
    modes: ['block', 'warn', 'off'], default: 'warn',
  },
  {
    key: 'sap_require_object_approval', group: 'SAP implementation',
    label: 'Blueprint objects approved before writing',
    desc: 'Each blueprint object must be submitted and approved (object review) before it is written to SAP.',
    modes: ['block', 'warn', 'off'], default: 'off',
  },
  {
    key: 'transport_release_requires_approval', group: 'Transports',
    label: 'Transport release requires the approval link',
    desc: "Transports are released only after the reviewer approved the case's transport approval link.",
    modes: ['block', 'off'], default: 'off',
  },
];

// Always enforced, not configurable: the platform never writes to QA / Production systems.
export const NON_DEV_ENV_TYPES = ['qas', 'qa', 'prd', 'prod', 'production'];
export function isProtectedSapEnv(env) {
  return NON_DEV_ENV_TYPES.includes(String(env?.envType ?? '').toLowerCase());
}

const POLICY_BY_KEY = Object.fromEntries(VALIDATION_POLICIES.map(p => [p.key, p]));

/** Effective policy modes + where each came from. */
export function resolvePolicies(settings, { clientId = null, projectId = null } = {}) {
  const global = settings?.validation_policies ?? {};
  const ov = settings?.validation_overrides ?? {};
  const cli = clientId ? ov.client?.[clientId]?.policies ?? {} : {};
  const prj = projectId ? ov.project?.[projectId]?.policies ?? {} : {};
  const out = {};
  for (const p of VALIDATION_POLICIES) {
    let mode = p.default, source = 'default';
    if (global[p.key]) { mode = global[p.key]; source = 'global'; }
    if (cli[p.key])    { mode = cli[p.key];    source = 'customer'; }
    if (prj[p.key])    { mode = prj[p.key];    source = 'project'; }
    if (!p.modes.includes(mode)) mode = p.default;
    out[p.key] = { mode, source };
  }
  return out;
}

/**
 * Effective gate for a lifecycle + target stage: the global gate (Settings → Workflow)
 * with customer then project condition overrides applied.
 * Returns { enabled, exempt_roles, conditions: [{ key, mode, enabled, source }] }.
 */
export function resolveGate(settings, lifecycleKey, stageKey, { clientId = null, projectId = null } = {}) {
  const base = settings?.transition_gates?.[lifecycleKey]?.[stageKey] ?? null;
  const ov = settings?.validation_overrides ?? {};
  const cli = clientId ? ov.client?.[clientId]?.gates?.[lifecycleKey]?.[stageKey] ?? {} : {};
  const prj = projectId ? ov.project?.[projectId]?.gates?.[lifecycleKey]?.[stageKey] ?? {} : {};
  const conds = new Map();
  if (base?.enabled) {
    for (const c of base.conditions ?? []) {
      conds.set(c.key, { key: c.key, mode: c.mode ?? 'block', enabled: !!c.enabled, source: 'global' });
    }
  }
  for (const [lvl, src] of [[cli, 'customer'], [prj, 'project']]) {
    for (const [key, mode] of Object.entries(lvl)) {
      if (!mode) continue;
      conds.set(key, { key, mode: mode === 'off' ? 'block' : mode, enabled: mode !== 'off', source: src });
    }
  }
  const list = [...conds.values()];
  return {
    enabled: list.some(c => c.enabled),
    exempt_roles: base?.exempt_roles ?? ['admin'],
    conditions: list,
  };
}

// ── SAP naming rules (checked before writing) ───────────────────────────────
const NAME_MAX = {
  table: 16, structure: 30, domain: 30, data_element: 30, message_class: 20,
  class: 30, interface: 30, program: 30, report: 30, include: 30,
  function_module: 30, function_group: 26, cds_view: 30, badi: 30, enhancement: 30,
};

/** Returns a list of problems (empty = OK). */
export function sapNamingProblems(type, name) {
  const n = String(name ?? '').trim().toUpperCase();
  const problems = [];
  if (!n) return ['Name is empty'];
  const namespaced = /^\/[A-Z0-9_]+\//.test(n);
  if (!namespaced && !/^[ZY]/.test(n)) problems.push('Custom objects must start with Z or Y (or a /NAMESPACE/)');
  if (!/^[A-Z0-9_\/]+$/.test(n)) problems.push('Only letters, digits, underscore and / are allowed');
  // Function modules can be given as GROUP/MODULE: check the module part.
  const core = type === 'function_module' && n.includes('/') && !namespaced ? n.split('/').pop() : n;
  const max = NAME_MAX[type];
  if (max && core.length > max) problems.push(`Too long for a ${type.replace(/_/g, ' ')}: ${core.length} characters (max ${max})`);
  if (type === 'table' && !namespaced && (core[1] === '_' || core[2] === '_')) {
    problems.push('Table names cannot have an underscore in position 2 or 3 (e.g. ZT_... is not allowed)');
  }
  return problems;
}
