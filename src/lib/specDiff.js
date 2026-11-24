// Compare a regenerated spec with the version it replaces and report what was dropped:
// technical objects (by name and by kind — names often change between runs), SAP objects /
// identifiers no longer mentioned, and the change in estimated hours.

export const OBJ_HEADING = /^(?:#{1,4}\s*(?:\d+(?:\.\d+)*\.?\s*)?|\d+(?:\.\d+)*\.?\s+)(objetos?\s+t[eé]cnicos|technical\s+objects|objetos\s+de\s+desarrollo)\b/i;
export const TIME_HEADING = /^(?:#{1,4}\s*(?:\d+(?:\.\d+)*\.?\s*)?|\d+(?:\.\d+)*\.?\s+)(estimaci[oó]n|time\s+estimation)/i;
const ANY_HEADING = /^(#{1,4}\s+\S|\d+\.\s+[A-ZÁÉÍÓÚ])/;

// Kinds of object, so "ZMM021_ENH_MIGO (BAdI)" → "ZMM021_EVT (ampliación)" still counts as kept.
// Order matters: specific multi-word types first ("message class" is not a class, "table type"
// is DDIC, not a table, "function module" is not a module of another kind).
const KINDS = [
  ['message',   /mensaje|message class|message text/i],
  ['function',  /m[oó]dulo de funci[oó]n|function module/i],
  ['ddic',      /estructura|structure|tipo de tabla|table type|elemento de datos|data element|dominio|domain|ddic/i],
  ['fiori',     /fiori|ui5|\bapp\b|aplicaci[oó]n/i],
  ['service',   /odata|\brap\b|service binding|servicio|\bapi\b|sicf|web ?service/i],
  ['enhancement', /badi|ampliaci[oó]n|enhancement|user[- ]?exit|implementaci[oó]n/i],
  ['table',     /tabla|table|\bvista\b.*mantenimiento|sm30/i],
  ['class',     /clase|class/i],
  ['program',   /programa|report|\bjob\b/i],
  ['report',    /\balv\b|reporte/i],
  ['auth',      /autorizaci[oó]n|authorization|\brol(es)?\b|pfcg|\brole/i],
  ['integration', /iflow|cpi|integration suite|integraci[oó]n|interfaz/i],
  ['config',    /configuraci[oó]n|customizing|spro|ppf|soamanager/i],
  ['transaction', /transacci[oó]n|transaction|t-?code/i],
  ['form',      /formulario|smartform|adobe form|form\b/i],
];
export const KIND_LABEL = {
  fiori: ['Fiori app', 'App Fiori'], service: ['OData/RAP service', 'Servicio OData/RAP'], enhancement: ['Enhancement / BAdI', 'Ampliación / BAdI'],
  table: ['Z table', 'Tabla Z'], class: ['ABAP class', 'Clase ABAP'], program: ['Program / job', 'Programa / job'], report: ['Report', 'Reporte'],
  auth: ['Authorization / role', 'Autorización / rol'], integration: ['Integration (iFlow)', 'Integración (iFlow)'], config: ['Configuration', 'Configuración'],
  ddic: ['DDIC structure', 'Estructura DDIC'], message: ['Message class', 'Clase de mensajes'], function: ['Function module', 'Módulo de función'],
  transaction: ['Transaction', 'Transacción'], form: ['Form', 'Formulario'],
};

const matchKind = text => KINDS.find(([, re]) => re.test(text))?.[0] ?? null;
// The Type column decides; name and description only when the type says nothing recognisable.
export const kindOf = (text, type) => (type ? matchKind(type) : null) ?? matchKind(text) ?? 'other';
export const cells = line => line.split('|').map(c => c.replace(/\*\*|`/g, '').trim());
const num = s => { const m = String(s ?? '').replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };

export function section(md, startRe) {
  const lines = String(md ?? '').split('\n');
  const i = lines.findIndex(l => startRe.test(l.trim()));
  if (i < 0) return [];
  const out = [];
  for (const l of lines.slice(i + 1)) {
    const t = l.trim();
    if (t && !t.startsWith('|') && ANY_HEADING.test(t) && !/subtotal|total/i.test(t)) break;
    out.push(l);
  }
  return out;
}

/** Technical objects from the "Technical objects" table: [{ name, type, kind }]. */
export function parseObjects(md) {
  const rows = section(md, OBJ_HEADING).filter(l => l.trim().startsWith('|')).map(cells);
  if (!rows.length) return [];
  const head = rows.find(r => r.some(c => /^(objeto|object)$/i.test(c)));
  const nameIx = head ? head.findIndex(c => /^(objeto|object)$/i.test(c)) : 2;
  const typeIx = head ? head.findIndex(c => /^(tipo|type)$/i.test(c)) : 3;
  const descIx = head ? head.findIndex(c => /descrip/i.test(c)) : 4;
  return rows
    .filter(r => r !== head && !r.every(c => /^:?-{2,}:?$|^$/.test(c)))
    .filter(r => !/subtotal|^total$/i.test(r.join(' ')) && (r[nameIx] ?? '').length > 1)
    .map(r => ({ name: r[nameIx], type: r[typeIx] ?? '', kind: kindOf(`${r[typeIx] ?? ''} ${r[nameIx] ?? ''} ${r[descIx] ?? ''}`, r[typeIx]) }));
}

/** SAP objects / identifiers named in the text (Z objects, BAPIs, CDS views, APIs, namespaces). */
export function identifiers(md) {
  const re = /\b(?:[ZY][A-Z0-9]{1,}_[A-Z0-9_]{2,}|BAPI_[A-Z0-9_]+|API_[A-Z0-9_]+|I_[A-Z][A-Za-z0-9]{3,}(?:_[A-Za-z0-9]+)*|UKM_[A-Z0-9_]+|(?<![A-Za-z0-9/])\/[A-Z][A-Z0-9]{1,9}\/[A-Z][A-Z0-9_]{2,})\b/g;
  return new Set((String(md ?? '').match(re) ?? []).map(s => s.toUpperCase()));
}

/** Total standard / Arena hours from the time-estimation table. */
export function totals(md) {
  const rows = section(md, TIME_HEADING).filter(l => l.trim().startsWith('|')).map(cells);
  const tot = rows.find(r => r.some(c => /^\**total\**$/i.test(c)));
  if (!tot) return null;
  const nums = tot.map(num).filter(n => n !== null);
  if (!nums.length) return null;
  return { standard: nums.length > 1 ? nums[nums.length - 2] : nums[0], arena: nums[nums.length - 1] };
}

/**
 * What the new version dropped compared with the previous one. Returns null when nothing
 * relevant changed (or there is nothing to compare).
 */
export function diffSpecs(prevMd, nextMd) {
  if (!prevMd?.trim() || !nextMd?.trim()) return null;
  const prevObjs = parseObjects(prevMd), nextObjs = parseObjects(nextMd);
  const nextText = nextMd.toUpperCase();
  const nextKinds = new Set(nextObjs.map(o => o.kind));
  const droppedKinds = [...new Set(prevObjs.map(o => o.kind))].filter(k => k !== 'other' && !nextKinds.has(k));
  // Objects whose kind disappeared, or whose exact name is no longer mentioned anywhere.
  const droppedObjects = prevObjs
    .filter(o => droppedKinds.includes(o.kind) || (/[A-Z]/.test(o.name) && !nextText.includes(o.name.toUpperCase()) && !nextKinds.has(o.kind)))
    .map(o => ({ name: o.name, type: o.type, kind: o.kind }));
  const nextIds = identifiers(nextMd);
  const prevIds = identifiers(prevMd);
  const nextObjNames = new Set(nextObjs.map(o => o.name.toUpperCase()));
  // Only standard SAP objects / BAPIs / CDS / APIs — new Z names between runs are expected.
  const droppedIds = [...prevIds].filter(id => !nextIds.has(id) && !nextObjNames.has(id) && !/^[ZY]/.test(id)).slice(0, 20);
  const pt = totals(prevMd), nt = totals(nextMd);
  const hours = pt && nt ? { prev: pt, next: nt, changePct: pt.standard ? Math.round(((nt.standard - pt.standard) / pt.standard) * 100) : null } : null;
  const bigHourChange = hours?.changePct !== null && hours?.changePct !== undefined && Math.abs(hours.changePct) >= 20;
  const objCountDrop = prevObjs.length && nextObjs.length < prevObjs.length ? prevObjs.length - nextObjs.length : 0;
  if (!droppedKinds.length && !droppedObjects.length && !droppedIds.length && !bigHourChange && !objCountDrop) return null;
  return {
    at: new Date().toISOString(),
    prevCount: prevObjs.length, nextCount: nextObjs.length,
    droppedKinds, droppedObjects, droppedIds, hours,
  };
}
