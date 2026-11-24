// Projects' mandatory development rules (e.g. Admosa's estimation email): sent to every spec prompt —
// in Spec C as an explicit exception to the as-is rule — and checked on the generated objects.
// Stored in system_settings.spec_project_rules = { defaults: Rule[], projects: { [projectId]: Rule[] } }.
// Rule = { id, text, enabled, check?: 'table_needs_app' | 'auth_object' | 'naming', pattern? }
import { readObjects } from './specHours.js';

export const DEFAULT_PROJECT_RULES = [
  { id: 'clean_core', enabled: true, text: 'Desarrollo Clean Core siempre que sea posible; si se usa Standard ABAP por una limitación específica, se justifica en la documentación técnica.' },
  { id: 'no_std_mod', enabled: true, text: 'No se modifica el estándar SAP; toda ampliación se hace en ampliaciones liberadas por SAP.' },
  { id: 'table_fiori', enabled: true, check: 'table_needs_app', text: 'Toda tabla Z de actualización tiene su app Fiori Elements de mantenimiento, como objeto propio en la tabla de objetos técnicos.' },
  { id: 'auth_objects', enabled: true, check: 'auth_object', text: 'Se usan objetos de autorización (estándar o Z) y figuran en la tabla de objetos técnicos.' },
  { id: 'naming', enabled: false, check: 'naming', pattern: '', text: 'Nomenclatura del proyecto para objetos y órdenes de transporte.' },
  { id: 'code_inspector', enabled: true, text: 'Code Inspector con 0 errores (y 0 advertencias si es posible) antes de pasar a pruebas.' },
  { id: 'tech_docs', enabled: true, text: 'Al aprobar la solución se entrega la documentación técnica.' },
];

export const RULE_CHECK_LABEL = {
  table_needs_app: 'Verifica: tabla Z ⇒ app Fiori de mantenimiento',
  auth_object: 'Verifica: objeto de autorización en los objetos técnicos',
  naming: 'Verifica: nombres de objetos Z/Y con el patrón',
};

/** Rules of a project (its own list, or the platform defaults). */
export function projectRules(settings, projectId) {
  const cfg = settings?.spec_project_rules ?? {};
  const own = projectId ? cfg.projects?.[projectId] : null;
  return Array.isArray(own) ? own : (Array.isArray(cfg.defaults) ? cfg.defaults : DEFAULT_PROJECT_RULES);
}
export const activeRules = (settings, projectId) => projectRules(settings, projectId).filter(r => r.enabled !== false && r.text?.trim());

/** Prompt block sent to every spec. */
export function rulesPromptBlock(rules) {
  if (!rules?.length) return '';
  return `\n\nPROJECT MANDATORY RULES — required by the project for every development, even when the customer's documents do not mention them (in Option C / As-Is they are an explicit EXCEPTION to the as-is rule). Apply every rule. When a rule requires an object (for example a Fiori maintenance app for a Z table, or authorization objects), add that object to the technical objects table and write "(regla del proyecto)" in its description:\n${rules.map(r => `- ${r.text}${r.check === 'naming' && r.pattern ? ` (pattern for Z/Y object names: ${r.pattern})` : ''}`).join('\n')}`;
}

/** Rule violations found in a generated spec: [{ id, text, detail }]. */
export function checkRules(md, rules) {
  const { objects } = readObjects(md);
  if (!objects.length) return [];
  const out = [];
  for (const r of rules ?? []) {
    if (r.enabled === false) continue;
    if (r.check === 'table_needs_app') {
      const tables = objects.filter(o => o.kind === 'table' && !/vista|view|sm30/i.test(`${o.type} ${o.name}`));
      if (tables.length && !objects.some(o => o.kind === 'fiori')) {
        out.push({ id: r.id, text: r.text, detail: `Tablas sin app Fiori de mantenimiento: ${tables.map(t => t.name).join(', ')}` });
      }
    } else if (r.check === 'auth_object') {
      const inObjects = objects.some(o => o.kind === 'auth');
      if (!inObjects) out.push({ id: r.id, text: r.text, detail: 'Ningún objeto de autorización en la tabla de objetos técnicos.' });
    } else if (r.check === 'naming' && r.pattern) {
      let re; try { re = new RegExp(r.pattern); } catch { continue; }
      const bad = objects.flatMap(o => o.name.split(/\s*\/\s*|\s*,\s*/)).map(n => n.trim()).filter(n => /^[ZY]/.test(n) && !re.test(n));
      if (bad.length) out.push({ id: r.id, text: r.text, detail: `Nombres fuera de la nomenclatura: ${bad.join(', ')}` });
    }
  }
  return out;
}
