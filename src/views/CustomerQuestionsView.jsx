// /questions/:token — the customer answers the open questions of a case without logging in
// (spec_questions_by_token / spec_questions_answer). Answers can be saved as a draft and sent once.
import { useState, useEffect, useRef } from "react";
import { AlertCircle, CheckCircle2, Clock, Loader2, Send, Save, HelpCircle, ChevronLeft } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { NovaLandingMark } from "./LandingView.jsx";

const T = {
  en: {
    title: 'Questions about your requirement', intro: 'Before we write the functional specification we need your answers to these points. Answer what you can — you can save and come back later with the same link.',
    contradiction: 'Contradiction', ambiguity: 'To clarify', missing: 'Missing information',
    sources: 'Where we found it', assumption: 'If there is no answer we will assume', answerPh: 'Your answer…',
    name: 'Your name', email: 'Your email (optional)', save: 'Save draft', saved: 'Draft saved', send: 'Send answers', sending: 'Sending…',
    nameReq: 'Please enter your name to send the answers.', confirmSend: n => `Send the answers? ${n} question(s) without an answer will use the stated assumption.`,
    doneTitle: 'Answers received', doneMsg: 'Thank you. The team will use your answers in the specification.',
    notFound: 'Link not found', notFoundMsg: 'This link does not exist, was revoked or has expired.', contact: 'If you think this is a mistake, contact the team that sent you the link.',
    expires: d => `Link valid for ${d} more day${d === 1 ? '' : 's'}`, from: 'Sent by', project: 'Project', answered: (a, n) => `${a} of ${n} answered`,
  },
  es: {
    title: 'Preguntas sobre su requerimiento', intro: 'Antes de escribir la especificación funcional necesitamos sus respuestas a estos puntos. Responda lo que pueda — puede guardar y volver más tarde con el mismo enlace.',
    contradiction: 'Contradicción', ambiguity: 'Por aclarar', missing: 'Información faltante',
    sources: 'Dónde lo encontramos', assumption: 'Si no hay respuesta asumiremos', answerPh: 'Su respuesta…',
    name: 'Su nombre', email: 'Su correo (opcional)', save: 'Guardar borrador', saved: 'Borrador guardado', send: 'Enviar respuestas', sending: 'Enviando…',
    nameReq: 'Ingrese su nombre para enviar las respuestas.', confirmSend: n => `¿Enviar las respuestas? ${n} pregunta(s) sin respuesta usarán el supuesto indicado.`,
    doneTitle: 'Respuestas recibidas', doneMsg: 'Gracias. El equipo usará sus respuestas en la especificación.',
    notFound: 'Enlace no encontrado', notFoundMsg: 'Este enlace no existe, fue revocado o venció.', contact: 'Si cree que es un error, contacte al equipo que le envió el enlace.',
    expires: d => `Enlace válido por ${d} día${d === 1 ? '' : 's'} más`, from: 'Enviado por', project: 'Proyecto', answered: (a, n) => `${a} de ${n} respondidas`,
  },
};
const BG_PAGE = { minHeight: '100dvh', background: '#0B0F1A', color: '#fff' };
const BG_EMBED = { background: '#0B0F1A', color: '#fff', borderRadius: 16, overflow: 'hidden' };
const KIND_CLS = { contradiction: 'bg-red-900/40 text-red-300 border-red-700/40', ambiguity: 'bg-amber-900/40 text-amber-300 border-amber-700/40', missing: 'bg-blue-900/40 text-blue-300 border-blue-700/40' };

// embedded: shown inside the app (My reviews) for a signed-in customer user — no page header, a
// back button, and the user's name pre-filled.
export default function CustomerQuestionsView({ token, embedded = false, defaultName = '', onBack, onSent }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [answers, setAnswers] = useState({});
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(null);       // 'save' | 'send'
  const [msg, setMsg] = useState(null);
  const [done, setDone] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    supabase.rpc('spec_questions_by_token', { p_token: token }).then(({ data: d, error: e }) => {
      if (e || !d || d.expired) { setError(true); return; }
      setData(d);
      setAnswers(Object.fromEntries(Object.entries(d.answers ?? {}).map(([k, v]) => [k, v?.answer ?? ''])));
      setName(d.customer_name || defaultName || '');
      if (d.status === 'answered') setDone(true);
      loaded.current = true;
    });
  }, [token]);

  const lang = (() => {
    const l = data?.platform?.lang;
    if (l && T[l]) return l;
    const nav = (typeof navigator !== 'undefined' ? navigator.language : 'es').split('-')[0];
    return T[nav] ? nav : 'es';
  })();
  const L = T[lang];
  const BG = embedded ? { ...BG_EMBED, minHeight: 320 } : BG_PAGE;
  const back = embedded && onBack ? (
    <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-gray-300 hover:text-white px-4 pt-4"><ChevronLeft size={16} />{lang === 'es' ? 'Volver' : 'Back'}</button>
  ) : null;
  const qs = data?.questions ?? [];
  const nAnswered = qs.filter(q => answers[q.id]?.trim()).length;
  const payload = () => Object.fromEntries(qs.map(q => [q.id, { answer: answers[q.id] ?? '' }]));

  async function save(final) {
    setMsg(null);
    if (final) {
      if (!name.trim()) { setMsg({ err: true, text: L.nameReq }); return; }
      const missing = qs.length - nAnswered;
      if (missing > 0 && !window.confirm(L.confirmSend(missing))) return;
    }
    setBusy(final ? 'send' : 'save');
    const { error: e } = await supabase.rpc('spec_questions_answer', { p_token: token, p_answers: payload(), p_name: name || null, p_email: email || null, p_final: final });
    setBusy(null);
    if (e) { setMsg({ err: true, text: e.message }); return; }
    if (final) { setDone(true); onSent?.(); } else { setMsg({ err: false, text: L.saved }); setTimeout(() => setMsg(null), 2500); }
  }

  if (error) return (
    <div style={BG} className="flex flex-col items-center justify-center px-6">{back}
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 rounded-2xl bg-red-900/40 border border-red-700/40 flex items-center justify-center mx-auto mb-4"><AlertCircle size={24} className="text-red-400" /></div>
        <h2 className="text-white text-lg font-bold mb-2">{L.notFound}</h2>
        <p className="text-gray-400 text-sm">{L.notFoundMsg}</p>
        <p className="text-gray-500 text-xs mt-3">{L.contact}</p>
      </div>
    </div>
  );
  if (!data) return <div style={BG} className="flex items-center justify-center"><Loader2 className="animate-spin text-gray-400" /></div>;
  if (done) return (
    <div style={BG} className="flex flex-col items-center justify-center px-6 py-10">{back}
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-green-900/40 border border-green-700/40 flex items-center justify-center mx-auto mb-4"><CheckCircle2 size={28} className="text-green-400" /></div>
        <h2 className="text-white text-xl font-bold mb-2">{L.doneTitle}</h2>
        <p className="text-gray-400 text-sm">{L.doneMsg}</p>
      </div>
    </div>
  );

  const daysLeft = data.expires_at ? Math.ceil((new Date(data.expires_at) - Date.now()) / 86400000) : null;
  const brand = data.platform?.name || 'Arena Solution Platform';
  return (
    <div style={BG}>
      {back}
      {!embedded && <header style={{ borderBottom: '1px solid rgba(79,110,247,.2)', background: 'rgba(11,15,26,.97)', position: 'sticky', top: 0, zIndex: 20 }} className="px-4 py-3 flex items-center gap-3">
        <NovaLandingMark size={30} />
        <span className="font-bold text-sm text-[#4F6EF7] truncate">{brand}</span>
        <div className="flex-1 text-right min-w-0">
          <p className="text-gray-400 text-xs">{L.title}</p>
          <p className="text-white text-sm font-semibold truncate">{data.case_title}</p>
        </div>
      </header>}
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="space-y-2">
          <h1 className="text-xl font-bold flex items-center gap-2"><HelpCircle size={20} className="text-[#4F6EF7]" />{L.title}</h1>
          <p className="text-gray-400 text-sm">{L.intro}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            {data.project && <span>{L.project}: {data.project}</span>}
            {data.creator_name && <span>{L.from}: {data.creator_name}</span>}
            {daysLeft !== null && <span className="flex items-center gap-1"><Clock size={11} />{L.expires(Math.max(daysLeft, 0))}</span>}
            <span>{L.answered(nAnswered, qs.length)}</span>
          </div>
        </div>
        {qs.map(q => (
          <div key={q.id} className="rounded-2xl p-4 space-y-2" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-gray-400">{q.id}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full border ${KIND_CLS[q.kind] ?? KIND_CLS.ambiguity}`}>{L[q.kind] ?? q.kind}</span>
            </div>
            <p className="text-sm text-gray-100 whitespace-pre-wrap">{q.text}</p>
            {q.sources && <p className="text-xs text-gray-500">{L.sources}: {q.sources}</p>}
            {q.assumption && <p className="text-xs text-gray-400">{L.assumption}: <span className="text-gray-300">{q.assumption}</span></p>}
            <textarea rows={3} value={answers[q.id] ?? ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))} placeholder={L.answerPh}
              className="w-full rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-[#4F6EF7]"
              style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)' }} />
          </div>
        ))}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(79,110,247,.08)', border: '1px solid rgba(79,110,247,.25)' }}>
          <div className="grid sm:grid-cols-2 gap-3">
            <input value={name} onChange={e => setName(e.target.value)} placeholder={L.name} className="rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 outline-none" style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)' }} />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={L.email} className="rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 outline-none" style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)' }} />
          </div>
          {msg && <p className={`text-xs ${msg.err ? 'text-red-400' : 'text-green-400'}`}>{msg.text}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={() => save(false)} disabled={!!busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-gray-200 disabled:opacity-50" style={{ border: '1px solid rgba(255,255,255,.2)' }}>
              {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{L.save}
            </button>
            <button onClick={() => save(true)} disabled={!!busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[#4F6EF7] hover:bg-[#3d5bea] disabled:opacity-50">
              {busy === 'send' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}{busy === 'send' ? L.sending : L.send}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
