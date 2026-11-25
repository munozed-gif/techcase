// Terms of use and privacy policy (legal_documents / legal_acceptances):
//  · LegalPage      — public pages /terminos (/terms) and /privacidad (/privacy)
//  · LegalGate      — signed-in users must accept the current published versions before using the app
//  · LegalFooter    — © line with links, for the app and the customer link pages
//  · LegalSettings  — Settings → Legal: edit drafts, publish versions, see who accepted
// Nothing is asked of users until an administrator publishes a version.
import { useEffect, useState } from "react";
import { Loader2, ScrollText, ShieldCheck, Download, Check } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { proposalMdToHtml } from "../lib/proposals.js";
import { TERMS_DRAFT_ES, TERMS_DRAFT_EN, PRIVACY_DRAFT_ES, PRIVACY_DRAFT_EN } from "../lib/legalDrafts.js";

export const LEGAL_PATHS = { terms: "/terminos", privacy: "/privacidad" };
// Same choice as the app (tc_lang); Spanish by default.
const docLang = () => { try { return localStorage.getItem("tc_lang") === "en" ? "en" : "es"; } catch { return "es"; } };

let _cache = null;
export function useLegalCurrent() {
  const [cur, setCur] = useState(_cache);
  useEffect(() => {
    if (_cache) return;
    supabase.rpc("legal_current").then(({ data }) => { _cache = data ?? { terms: null, privacy: null }; setCur(_cache); }, () => setCur({ terms: null, privacy: null }));
  }, []);
  return cur;   // null while loading; {terms, privacy} (each null when not published)
}

const PROSE = `
.legal-prose{background:#fff;color:#0B0F1A}
.legal-prose h1,.legal-prose h2,.legal-prose h3{color:#0B0F1A}
.legal-prose h1{font-size:1.6rem;font-weight:800;margin:0 0 .6rem;letter-spacing:-.02em}
.legal-prose h2{font-size:1.05rem;font-weight:700;margin:1.4rem 0 .4rem}
.legal-prose h3{font-size:.95rem;font-weight:700;margin:1rem 0 .3rem}
.legal-prose p,.legal-prose li{font-size:.92rem;line-height:1.65;color:#334155}
.legal-prose ul,.legal-prose ol{padding-left:1.3rem;margin:.4rem 0 .8rem;list-style:disc}
.legal-prose li{margin-bottom:.25rem}.legal-prose strong{color:#0B0F1A}`;

export function LegalBody({ md }) {
  return (<><style>{PROSE}</style><div className="legal-prose" dangerouslySetInnerHTML={{ __html: proposalMdToHtml(md ?? "") }} /></>);
}

export function LegalPage({ kind }) {
  const cur = useLegalCurrent();
  const [lang, setLang] = useState(docLang);
  const doc = cur?.[kind];
  const other = kind === "terms" ? "privacy" : "terms";
  const L = (es, en) => (lang === "es" ? es : en);
  return (
    <div style={{ minHeight: "100dvh", background: "#F8FAFF" }}>
      <header className="flex items-center justify-between px-5 py-3" style={{ background: "#0B0F1A" }}>
        <a href="/" className="font-bold text-sm" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
          <span style={{ color: "#4F6EF7" }}>Arena</span> <span className="text-white/85">Solutions Platform</span>
        </a>
        <div className="flex items-center gap-3 text-xs">
          <a href={LEGAL_PATHS[other]} className="text-gray-300 hover:text-white">{other === "terms" ? L("Términos de uso", "Terms of use") : L("Política de privacidad", "Privacy policy")}</a>
          <button onClick={() => setLang(l => (l === "es" ? "en" : "es"))} className="px-2 py-1 rounded border border-white/20 text-white">{lang === "es" ? "EN" : "ES"}</button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-5 py-8">
        {!cur ? <Loader2 className="animate-spin text-blue-500" />
          : !doc ? <p className="text-gray-500 text-sm">{L("This document has not been published yet.", "This document has not been published yet.")}</p>
          : (<>
              <p className="text-xs mb-4" style={{ color: "#64748B" }}>{L("Versión", "Version")} {doc.version}{doc.published_at ? ` · ${new Date(doc.published_at).toLocaleDateString(lang === "es" ? "es" : "en-US", { year: "numeric", month: "long", day: "numeric" })}` : ""}</p>
              <div className="rounded-2xl p-6 sm:p-8" style={{ background: "#fff", border: "1px solid #E2E8F0" }}><LegalBody md={doc[lang] || doc.es || doc.en} /></div>
            </>)}
      </main>
      <LegalFooter light />
    </div>
  );
}

export function LegalFooter({ light = false, className = "" }) {
  const es = docLang() === "es";
  const year = new Date().getFullYear();
  return (
    <div className={`text-center text-[11px] py-4 px-4 ${light ? "text-gray-400" : "text-gray-500"} ${className}`}>
      © {year} Eduardo Muñoz · Solution Factory C.A. · Solution Factory LLC — Arena Solutions Platform. {es ? "Todos los derechos reservados." : "All rights reserved."}{" "}
      <a href={LEGAL_PATHS.terms} target="_blank" rel="noreferrer" className="underline hover:text-blue-500">{es ? "Términos de uso" : "Terms of use"}</a>{" · "}
      <a href={LEGAL_PATHS.privacy} target="_blank" rel="noreferrer" className="underline hover:text-blue-500">{es ? "Privacidad" : "Privacy"}</a>
    </div>
  );
}

/** Blocks the app until the signed-in user accepts the published versions (if any are published). */
export function LegalGate({ auth, children }) {
  const [status, setStatus] = useState(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const uid = auth?.user?.id;
  useEffect(() => {
    if (!uid) return;
    supabase.rpc("my_legal_status").then(({ data, error }) => setStatus(error ? { accepted: true } : (data ?? { accepted: true })), () => setStatus({ accepted: true }));
  }, [uid]);
  if (!uid || !status || status.accepted) return children;
  const es = docLang() === "es";
  async function accept() {
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("legal_accept", { p_terms: status.terms, p_privacy: status.privacy, p_context: "login", p_user_agent: navigator.userAgent });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setStatus({ ...status, accepted: true });
  }
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4" style={{ background: "rgba(11,15,26,.92)" }}>
      <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
        <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><ScrollText size={22} /></div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">{es ? "Términos de uso" : "Terms of use"}</h2>
          <p className="text-sm text-gray-600 mt-1">{es
            ? "Para continuar usando Arena Solutions Platform, lea y acepte los Términos de uso y la Política de privacidad."
            : "To keep using Arena Solutions Platform, please read and accept the Terms of use and the Privacy policy."}</p>
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          {status.terms != null && <a href={LEGAL_PATHS.terms} target="_blank" rel="noreferrer" className="text-blue-600 underline">{es ? "Leer los Términos de uso" : "Read the Terms of use"} (v{status.terms})</a>}
          {status.privacy != null && <a href={LEGAL_PATHS.privacy} target="_blank" rel="noreferrer" className="text-blue-600 underline">{es ? "Leer la Política de privacidad" : "Read the Privacy policy"} (v{status.privacy})</a>}
        </div>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} className="mt-0.5 w-4 h-4" />
          <span>{es ? "He leído y acepto los Términos de uso y la Política de privacidad." : "I have read and accept the Terms of use and the Privacy policy."}</span>
        </label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex gap-2">
          <button onClick={() => supabase.auth.signOut()} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600">{es ? "Salir" : "Sign out"}</button>
          <button disabled={!checked || busy} onClick={accept} className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 disabled:opacity-40">
            {busy ? "…" : es ? "Aceptar y continuar" : "Accept and continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Settings → Legal ───────────────────────────────────────────────────────
const DEFAULTS = { terms: { es: TERMS_DRAFT_ES, en: TERMS_DRAFT_EN }, privacy: { es: PRIVACY_DRAFT_ES, en: PRIVACY_DRAFT_EN } };

function LegalDocEditor({ kind, title, isAdmin, onPublished }) {
  const [rows, setRows] = useState(null);
  const [draft, setDraft] = useState(null);       // {id?, version, es, en}
  const [lang, setLang] = useState("es");
  const [view, setView] = useState("edit");
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  async function load() {
    const { data } = await supabase.from("legal_documents").select("*").eq("kind", kind).order("version", { ascending: false });
    setRows(data ?? []);
    const d = (data ?? []).find(r => r.status === "draft");
    const pub = (data ?? []).find(r => r.status === "published");
    const nextV = ((data ?? [])[0]?.version ?? 0) + (d ? 0 : 1);
    setDraft(d ? { id: d.id, version: d.version, es: d.body_es, en: d.body_en }
      : { version: nextV, es: pub?.body_es ?? DEFAULTS[kind].es, en: pub?.body_en ?? DEFAULTS[kind].en });
  }
  useEffect(() => { load(); }, [kind]);

  async function saveDraft() {
    setBusy("save"); setMsg(null);
    const row = { kind, version: draft.version, body_es: draft.es, body_en: draft.en, status: "draft", updated_at: new Date().toISOString() };
    const { data, error } = draft.id
      ? await supabase.from("legal_documents").update(row).eq("id", draft.id).select().single()
      : await supabase.from("legal_documents").insert(row).select().single();
    setBusy(null);
    if (error) { setMsg({ err: true, text: error.message }); return false; }
    setDraft(d => ({ ...d, id: data.id })); setMsg({ text: `Draft v${draft.version} saved.` });
    return true;
  }
  async function publish() {
    if (!window.confirm(`Publish ${title} v${draft.version}? Every user will have to accept it on their next sign-in.`)) return;
    if (!(await saveDraft())) return;
    setBusy("publish");
    const { data, error } = await supabase.rpc("legal_publish", { p_kind: kind });
    setBusy(null);
    if (error) { setMsg({ err: true, text: error.message }); return; }
    setMsg({ text: `${title} v${data} published.` }); _cache = null; onPublished?.(); load();
  }

  if (!draft) return <Loader2 className="animate-spin text-gray-400" />;
  const pub = (rows ?? []).find(r => r.status === "published");
  const placeholders = ((draft.es + draft.en).match(/\[[^\]]{2,80}\]/g) ?? []).filter((v, i, a) => a.indexOf(v) === i);
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500">{pub ? `Published: v${pub.version} (${new Date(pub.published_at).toLocaleDateString()})` : "Not published yet — users are not asked to accept anything."} · Editing draft v{draft.version}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {["es", "en"].map(l => <button key={l} onClick={() => setLang(l)} className={`px-2.5 py-1 text-xs rounded-lg border ${lang === l ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-600"}`}>{l.toUpperCase()}</button>)}
          <button onClick={() => setView(v => (v === "edit" ? "preview" : "edit"))} className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-600">{view === "edit" ? "Preview" : "Edit"}</button>
        </div>
      </div>
      {placeholders.length > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">To complete before publishing: {placeholders.join(" · ")}</p>
      )}
      {view === "edit"
        ? <textarea value={draft[lang]} onChange={e => setDraft({ ...draft, [lang]: e.target.value })} disabled={!isAdmin}
            className="w-full h-[420px] font-mono text-xs border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        : <div className="max-h-[420px] overflow-y-auto rounded-xl p-4" style={{ background: "#fff", border: "1px solid #E2E8F0" }}><LegalBody md={draft[lang]} /></div>}
      {msg && <p className={`text-sm ${msg.err ? "text-red-600" : "text-green-700"}`}>{msg.text}</p>}
      {isAdmin && (
        <div className="flex flex-wrap gap-2 justify-end">
          <button onClick={saveDraft} disabled={!!busy} className="px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-700">{busy === "save" ? "Saving…" : "Save draft"}</button>
          <button onClick={publish} disabled={!!busy} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl text-white bg-blue-600 disabled:opacity-50"><ShieldCheck size={14} />{busy === "publish" ? "Publishing…" : `Publish v${draft.version}`}</button>
        </div>
      )}
    </div>
  );
}

export function LegalSettings({ isAdmin }) {
  const [acc, setAcc] = useState(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => { supabase.rpc("legal_acceptances_list").then(({ data }) => setAcc(data ?? [])); }, [nonce]);
  function exportCsv() {
    const head = ["name", "email", "role", "terms_version", "privacy_version", "context", "accepted_at"];
    const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [head.join(","), ...(acc ?? []).map(r => [r.full_name, r.email, r.role, r.terms_version, r.privacy_version, r.context, r.accepted_at].map(esc).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = "legal-acceptances.csv"; a.click();
  }
  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
        These are first drafts — have them reviewed by a lawyer and complete the [bracketed] parts before publishing. Once published, every user must accept the
        current version at sign-up and on their next sign-in; publishing a new version asks everyone again. The public pages are <a href={LEGAL_PATHS.terms} target="_blank" rel="noreferrer" className="underline">/terminos</a> and <a href={LEGAL_PATHS.privacy} target="_blank" rel="noreferrer" className="underline">/privacidad</a>.
      </div>
      <LegalDocEditor kind="terms" title="Terms of use" isAdmin={isAdmin} onPublished={() => setNonce(n => n + 1)} />
      <LegalDocEditor kind="privacy" title="Privacy policy" isAdmin={isAdmin} onPublished={() => setNonce(n => n + 1)} />
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Acceptances</h3>
          {(acc ?? []).length > 0 && <button onClick={exportCsv} className="inline-flex items-center gap-1.5 text-sm text-blue-600 font-semibold"><Download size={14} />Export CSV</button>}
        </div>
        {!acc ? <Loader2 className="animate-spin text-gray-400" /> : !acc.length ? <p className="text-sm text-gray-400">No acceptances yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500"><th className="py-1.5 pr-3">User</th><th className="pr-3">Role</th><th className="pr-3">Terms</th><th className="pr-3">Privacy</th><th className="pr-3">Where</th><th>When</th></tr></thead>
              <tbody>{acc.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1.5 pr-3"><div className="font-medium text-gray-800">{r.full_name}</div><div className="text-xs text-gray-400">{r.email}</div></td>
                  <td className="pr-3 text-gray-600">{r.role}</td><td className="pr-3">v{r.terms_version ?? "—"}</td><td className="pr-3">v{r.privacy_version ?? "—"}</td>
                  <td className="pr-3 text-gray-600">{r.context}</td><td className="text-gray-600">{new Date(r.accepted_at).toLocaleString()}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function LegalCheckbox({ checked, onChange, lang = docLang() }) {
  const es = lang === "es";
  return (
    <label className="flex items-start gap-2 text-xs text-gray-600 my-3">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-0.5 w-4 h-4 flex-shrink-0" />
      <span>{es ? "He leído y acepto los " : "I have read and accept the "}
        <a href={LEGAL_PATHS.terms} target="_blank" rel="noreferrer" className="text-blue-600 underline">{es ? "Términos de uso" : "Terms of use"}</a>
        {es ? " y la " : " and the "}
        <a href={LEGAL_PATHS.privacy} target="_blank" rel="noreferrer" className="text-blue-600 underline">{es ? "Política de privacidad" : "Privacy policy"}</a>.
        {" "}<Check size={0} className="hidden" />
      </span>
    </label>
  );
}
