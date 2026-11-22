// Sales pipeline: shared constants and the signed-in user's seller access (rpc my_seller).
import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase.js";

export const STAGES = [
  { id: "lead",      en: "Lead",      es: "Prospecto",  color: "bg-gray-100 text-gray-700",    dot: "#9CA3AF" },
  { id: "qualified", en: "Qualified", es: "Calificada", color: "bg-blue-100 text-blue-700",    dot: "#3B82F6" },
  { id: "proposal",  en: "Proposal",  es: "Propuesta",  color: "bg-violet-100 text-violet-700", dot: "#8B5CF6" },
  { id: "won",       en: "Won",       es: "Ganada",     color: "bg-green-100 text-green-700",  dot: "#10B981" },
  { id: "lost",      en: "Lost",      es: "Perdida",    color: "bg-red-100 text-red-700",      dot: "#EF4444" },
];
export const stageOf = id => STAGES.find(s => s.id === id) ?? STAGES[0];

export const NEED_TYPES = [
  { id: "implementation", en: "New SAP implementation",  es: "Implementación SAP nueva" },
  { id: "upgrade",        en: "Version upgrade / S/4HANA", es: "Actualización de versión / S/4HANA" },
  { id: "new_area",       en: "New area / module",        es: "Nueva área / módulo" },
  { id: "rollout",        en: "Rollout",                   es: "Rollout" },
  { id: "solution",       en: "Packaged solution",         es: "Solución empaquetada" },
  { id: "support",        en: "Support / AMS",             es: "Soporte / AMS" },
  { id: "other",          en: "Other",                     es: "Otro" },
];

export const PAYERS = [
  { id: "customer",         en: "Customer (added fee)",      es: "Cliente (cargo adicional)" },
  { id: "delivery_partner", en: "Delivery partner / team",   es: "Partner / equipo que entrega" },
  { id: "platform",         en: "Platform",                  es: "Plataforma" },
];

export const DELIVERY_MODES = [
  { id: "own",     en: "Own team",          es: "Equipo propio",
    desc_en: "Your partner, or one of your consultant teams, delivers it.", desc_es: "Lo entrega tu partner o uno de tus equipos de consultores." },
  { id: "partner", en: "Named partner",     es: "Partner elegido",
    desc_en: "Ask a specific partner; they accept or decline.", desc_es: "Pídeselo a un partner concreto; acepta o rechaza." },
  { id: "open",    en: "Open bidding",      es: "Licitación abierta",
    desc_en: "Partners and team owners bid (price, team, start); you award one.", desc_es: "Partners y dueños de equipos ofertan (precio, equipo, inicio); tú adjudicas." },
  { id: "arena",   en: "Arena (per case)",  es: "Arena (por caso)",
    desc_en: "Each case is published in the Arena for consultants and teams to apply.", desc_es: "Cada caso se publica en la Arena para que consultores y equipos postulen." },
];

export const SOLUTION_TYPES = [
  { id: "package",        en: "Packaged solution", es: "Solución empaquetada" },
  { id: "implementation", en: "Implementation",    es: "Implementación" },
  { id: "upgrade",        en: "Upgrade",           es: "Actualización" },
  { id: "rollout",        en: "Rollout",           es: "Rollout" },
  { id: "support",        en: "Support",           es: "Soporte" },
  { id: "other",          en: "Other",             es: "Otro" },
];
export const PRICE_TYPES = [
  { id: "fixed",   en: "Fixed price", es: "Precio fijo" },
  { id: "from",    en: "From",        es: "Desde" },
  { id: "monthly", en: "Monthly",     es: "Mensual" },
  { id: "quote",   en: "On quote",    es: "A cotizar" },
];

export const lbl = (list, id, es) => { const x = list.find(i => i.id === id); return x ? (es ? x.es : x.en) : id; };
export const money = (n, cur = "USD") =>
  n == null || n === "" ? "—" : `${cur === "USD" ? "$" : cur + " "}${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
export const errText = e => (e?.message ?? String(e ?? "")).replace(/^.*?ERROR:\s*/, "");

let cache = { userId: null, data: undefined, promise: null };
const listeners = new Set();

/** The current user's seller record: null (none) or { status, partner_id, partner_name, ... }. */
export function useMySeller(userId) {
  const [state, setState] = useState(() => (cache.userId === userId ? cache.data : undefined));
  const load = useCallback(async (force = false) => {
    if (!userId) return;
    if (!force && cache.userId === userId && cache.data !== undefined) { setState(cache.data); return; }
    if (!force && cache.userId === userId && cache.promise) return cache.promise;
    cache.userId = userId;
    cache.promise = supabase.rpc("my_seller").then(({ data }) => {
      cache.data = data ?? null; cache.promise = null;
      listeners.forEach(fn => fn(cache.data));
    }, () => { cache.data = null; cache.promise = null; listeners.forEach(fn => fn(null)); });
    return cache.promise;
  }, [userId]);
  useEffect(() => {
    listeners.add(setState);
    load();
    return () => listeners.delete(setState);
  }, [load]);
  return { seller: state, loading: state === undefined, refresh: () => load(true) };
}
