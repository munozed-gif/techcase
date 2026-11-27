// Settings → Visits: landing page statistics from landing_visits (filled by /api/track).
// Admins only (landing_stats RPC + table RLS). IPs are stored anonymized.
import { useEffect, useState } from "react";
import { BarChart3, Users, Eye, MousePointerClick, UserPlus, Download, RefreshCw, Globe, MapPin, Link2, Megaphone, Monitor, Languages, Film, Copy, Check, ExternalLink } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";

const PERIODS = [7, 30, 90, 365];
const COUNTRY = (code, lang) => {
  if (!code || code === '?') return '?';
  try { return new Intl.DisplayNames([lang === 'es' ? 'es' : 'en'], { type: 'region' }).of(code) || code; } catch { return code; }
};

function Stat({ Icon, label, value, sub }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-xs text-gray-500"><Icon size={13} />{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
      {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
    </div>
  );
}

function Breakdown({ Icon, title, rows, valueKey = 'visitors', label = r => r.key, empty }) {
  const max = Math.max(1, ...(rows ?? []).map(r => r[valueKey] ?? 0));
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-2"><Icon size={13} />{title}</p>
      {!(rows ?? []).length ? <p className="text-xs text-gray-400">{empty}</p> : (
        <ul className="space-y-1">
          {rows.map((r, i) => (
            <li key={i} className="text-xs">
              <div className="flex justify-between gap-2"><span className="truncate text-gray-700">{label(r)}</span><span className="font-semibold text-gray-900 flex-shrink-0">{r[valueKey]}</span></div>
              <div className="h-1 rounded bg-gray-100 mt-0.5"><div className="h-1 rounded bg-blue-500" style={{ width: `${((r[valueKey] ?? 0) / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Lowercase, no accents or spaces: "Lanzamiento Diciembre" → "lanzamiento-diciembre".
const slug = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// Campaign link builder: base URL + utm_source / utm_medium / utm_campaign / utm_content.
function UtmBuilder({ L, campaigns }) {
  const SOURCES = [['linkedin', 'LinkedIn'], ['whatsapp', 'WhatsApp'], ['email', L('Email', 'Correo')], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['google', 'Google'], ['evento', L('Event', 'Evento')]];
  const MEDIUMS = [['social', L('Social post', 'Publicación social')], ['mensaje', L('Message', 'Mensaje')], ['correo', L('Email', 'Correo')], ['anuncio', L('Ad (paid)', 'Anuncio (pago)')], ['qr', L('QR code', 'Código QR')], ['firma', L('Email signature', 'Firma de correo')]];
  const DEFAULT_MEDIUM = { linkedin: 'social', instagram: 'social', facebook: 'social', whatsapp: 'mensaje', email: 'correo', google: 'anuncio', evento: 'qr' };
  const [base, setBase] = useState(() => (typeof window !== 'undefined' ? `${window.location.origin}/` : ''));
  const [source, setSource] = useState('linkedin');
  const [medium, setMedium] = useState('social');
  const [campaign, setCampaign] = useState('');
  const [content, setContent] = useState('');
  const [copied, setCopied] = useState(false);
  const src = slug(source), med = slug(medium), camp = slug(campaign), cont = slug(content);
  let url = '';
  try {
    const u = new URL(base || '/', typeof window !== 'undefined' ? window.location.origin : 'https://example.com');
    if (src) u.searchParams.set('utm_source', src);
    if (med) u.searchParams.set('utm_medium', med);
    if (camp) u.searchParams.set('utm_campaign', camp);
    if (cont) u.searchParams.set('utm_content', cont);
    url = u.toString();
  } catch { url = ''; }
  const ready = !!(url && src && camp);
  const chip = on => `px-2 py-1 rounded-lg border text-xs font-semibold ${on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`;
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><Megaphone size={13} />{L('Campaign link generator', 'Generador de enlaces de campaña')}</p>
      <p className="text-[11px] text-gray-500">{L('Share this link instead of the plain address: its visits appear under Campaigns and Where they came from.', 'Comparte este enlace en lugar de la dirección sola: sus visitas aparecen en Campañas y en De dónde llegaron.')}</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block text-xs text-gray-600">{L('Campaign name', 'Nombre de la campaña')} *
          <input value={campaign} onChange={e => setCampaign(e.target.value)} list="utm-campaigns" placeholder={L('e.g. launch-dec26', 'p. ej. lanzamiento-dic26')}
            className="mt-1 w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm" />
          <datalist id="utm-campaigns">{(campaigns ?? []).map(c => <option key={c.key} value={c.key} />)}</datalist>
          {campaign && camp !== campaign && <span className="block text-[10px] text-gray-400 mt-0.5">{L('Saved as', 'Se guarda como')}: {camp}</span>}
        </label>
        <label className="block text-xs text-gray-600">{L('Version (optional)', 'Versión (opcional)')}
          <input value={content} onChange={e => setContent(e.target.value)} placeholder={L('e.g. video, image-1', 'p. ej. video, imagen-1')}
            className="mt-1 w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm" />
        </label>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-gray-600">{L('Where you will share it (source)', 'Dónde lo vas a compartir (fuente)')} *</p>
        <div className="flex flex-wrap gap-1.5 items-center">
          {SOURCES.map(([k, t]) => <button key={k} onClick={() => { setSource(k); setMedium(DEFAULT_MEDIUM[k] ?? medium); }} className={chip(src === k)}>{t}</button>)}
          <input value={SOURCES.some(([k]) => k === src) ? '' : source} onChange={e => setSource(e.target.value)} placeholder={L('other…', 'otra…')} className="w-28 px-2 py-1 border border-gray-200 rounded-lg text-xs" />
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-gray-600">{L('Channel type (medium)', 'Tipo de canal (medio)')}</p>
        <div className="flex flex-wrap gap-1.5">{MEDIUMS.map(([k, t]) => <button key={k} onClick={() => setMedium(k)} className={chip(med === k)}>{t}</button>)}</div>
      </div>
      <details className="text-xs text-gray-600">
        <summary className="cursor-pointer text-gray-500">{L('Page address', 'Dirección de la página')}: {base}</summary>
        <input value={base} onChange={e => setBase(e.target.value)} className="mt-1 w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono" />
      </details>
      <div className={`rounded-lg border p-2 ${ready ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
        <p className="text-[11px] font-mono break-all text-gray-800">{ready ? url : L('Write the campaign name and choose the source.', 'Escribe el nombre de la campaña y elige la fuente.')}</p>
        {ready && (
          <div className="flex gap-2 mt-2">
            <button onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ } }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-semibold">{copied ? <><Check size={12} />{L('Copied', 'Copiado')}</> : <><Copy size={12} />{L('Copy link', 'Copiar enlace')}</>}</button>
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700"><ExternalLink size={12} />{L('Open', 'Abrir')}</a>
          </div>
        )}
      </div>
    </div>
  );
}

export function LandingStats() {
  const { lang } = useT();
  const es = lang === 'es';
  const L = (en, s) => (es ? s : en);
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const range = () => {
    const to = new Date(); to.setHours(23, 59, 59, 999);
    const from = new Date(to); from.setDate(from.getDate() - days + 1); from.setHours(0, 0, 0, 0);
    return { from, to };
  };
  async function load() {
    setLoading(true); setError(null);
    const { from, to } = range();
    const { data: d, error: e } = await supabase.rpc('landing_stats', { p_from: from.toISOString(), p_to: to.toISOString() });
    if (e) setError(e.message); else setData(d);
    setLoading(false);
  }
  useEffect(() => { load(); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  async function exportCsv() {
    const { from, to } = range();
    const { data: rows, error: e } = await supabase.from('landing_visits').select('created_at,event,visitor_id,session_id,path,referrer_host,utm_source,utm_medium,utm_campaign,device,browser,os,lang,country,region,city,ip_anon,meta')
      .gte('created_at', from.toISOString()).lte('created_at', to.toISOString()).order('created_at', { ascending: false }).limit(10000);
    if (e) { alert(e.message); return; }
    const cols = ['created_at', 'event', 'visitor_id', 'session_id', 'path', 'referrer_host', 'utm_source', 'utm_medium', 'utm_campaign', 'device', 'browser', 'os', 'lang', 'country', 'region', 'city', 'ip_anon', 'meta'];
    const esc = v => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [cols.join(','), ...(rows ?? []).map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    a.download = `visitas-landing-${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  const f = data?.funnel ?? {};
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const daysRows = data?.by_day ?? [];
  const maxDay = Math.max(1, ...daysRows.map(d => d.visitors));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 flex-1"><BarChart3 size={18} className="text-blue-600" />{L('Landing page visits', 'Visitas de la landing page')}</h2>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {PERIODS.map(d => (
            <button key={d} onClick={() => setDays(d)} className={`px-2.5 py-1 text-xs font-semibold ${days === d ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{d === 365 ? L('1 year', '1 año') : `${d} ${L('days', 'días')}`}</button>
          ))}
        </div>
        <button onClick={load} disabled={loading} title={L('Refresh', 'Actualizar')} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
        <button onClick={exportCsv} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50"><Download size={13} />CSV</button>
      </div>
      <p className="text-xs text-gray-500">{L('Location comes from the request (country, region, city); IPs are stored anonymized. Visitors are counted with a random id kept in the browser. Visitors with "Do Not Track" are not counted. More (bots excluded, no IP) in Vercel → Analytics.',
        'La ubicación sale de la conexión (país, región, ciudad); las IP se guardan anonimizadas. Los visitantes se cuentan con un identificador aleatorio guardado en el navegador. No se cuentan visitantes con "No rastrear" activado. Más datos (sin IP, sin bots) en Vercel → Analytics.')}</p>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <UtmBuilder L={L} campaigns={data?.by_campaign} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat Icon={Users} label={L('Visitors', 'Visitantes')} value={data?.visitors ?? '—'} sub={`${data?.sessions ?? 0} ${L('sessions', 'sesiones')}`} />
        <Stat Icon={Eye} label={L('Page views', 'Vistas de página')} value={data?.pageviews ?? '—'} />
        <Stat Icon={MousePointerClick} label={L('Clicked a button', 'Hicieron clic en un botón')} value={f.cta ?? '—'} sub={pct(f.cta, f.visitors)} />
        <Stat Icon={UserPlus} label={L('Sign-ups', 'Registros')} value={f.signup ?? '—'} sub={pct(f.signup, f.visitors)} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{L('Visitors per day', 'Visitantes por día')}</p>
        {!daysRows.length ? <p className="text-xs text-gray-400">{L('No visits in this period yet.', 'Aún no hay visitas en este período.')}</p> : (
          <div className="flex items-end gap-1 h-32">
            {daysRows.map(d => (
              <div key={d.day} className="flex-1 min-w-[4px] flex flex-col items-center justify-end h-full" title={`${d.day}: ${d.visitors} ${L('visitors', 'visitantes')}, ${d.pageviews} ${L('views', 'vistas')}`}>
                <div className="w-full rounded-t bg-blue-500" style={{ height: `${(d.visitors / maxDay) * 100}%`, minHeight: 2 }} />
              </div>
            ))}
          </div>
        )}
        {daysRows.length > 0 && <div className="flex justify-between text-[10px] text-gray-400 mt-1"><span>{daysRows[0].day}</span><span>{daysRows[daysRows.length - 1].day}</span></div>}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-2"><Film size={13} />{L('Funnel', 'Embudo')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
          {[
            [L('Visited', 'Visitaron'), f.visitors], [L('Started the video', 'Iniciaron el video'), f.video_play], [L('Watched it to the end', 'Lo vieron completo'), f.video_complete],
            [L('Clicked a button', 'Clic en un botón'), f.cta], [L('Signed up', 'Se registraron'), f.signup],
          ].map(([k, v], i) => (
            <div key={k} className="rounded-lg bg-gray-50 border border-gray-100 p-2">
              <div className="text-lg font-bold text-gray-900">{v ?? 0}</div>
              <div className="text-[11px] text-gray-500">{k}</div>
              {i > 0 && <div className="text-[10px] text-gray-400">{pct(v, f.visitors)}</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Breakdown Icon={Globe} title={L('Countries', 'Países')} rows={data?.by_country} label={r => COUNTRY(r.key, lang)} empty="—" />
        <Breakdown Icon={MapPin} title={L('Cities', 'Ciudades')} rows={data?.by_city} empty="—" />
        <Breakdown Icon={Link2} title={L('Where they came from', 'De dónde llegaron')} rows={data?.by_source} empty="—" />
        <Breakdown Icon={Megaphone} title={L('Campaigns (utm_campaign)', 'Campañas (utm_campaign)')} rows={data?.by_campaign} empty={L('Add ?utm_source=…&utm_campaign=… to the links you share.', 'Agrega ?utm_source=…&utm_campaign=… a los enlaces que compartes.')} />
        <Breakdown Icon={MousePointerClick} title={L('Buttons clicked', 'Botones con clic')} rows={data?.by_cta} valueKey="clicks" empty="—" />
        <Breakdown Icon={Monitor} title={L('Devices', 'Dispositivos')} rows={data?.by_device} label={r => ({ desktop: L('Computer', 'Computadora'), mobile: L('Phone', 'Teléfono'), tablet: 'Tablet' })[r.key] ?? r.key} empty="—" />
        <Breakdown Icon={Monitor} title={L('Browser · system', 'Navegador · sistema')} rows={data?.by_browser} empty="—" />
        <Breakdown Icon={Languages} title={L('Language', 'Idioma')} rows={data?.by_lang} empty="—" />
      </div>
    </div>
  );
}
