import { countryOptions, countryName, countryFlag } from "../lib/countries.js";

function EmptyState({ Icon: IconComp, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex justify-center">
        {IconComp && <IconComp className="w-8 h-8 text-gray-300" />}
      </div>
      <h3 className="text-lg font-semibold text-gray-800 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 mb-4">{subtitle}</p>
      {action}
    </div>
  );
}

function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-3xl" : "max-w-lg"} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <div className="mb-4">
      {label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-400 mb-1">{label}</label>}
      <input
        className="w-full bg-gray-100 dark:bg-gray-700 border-0 rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm"
        {...props}
      />
    </div>
  );
}

function Textarea({ label, ...props }) {
  return (
    <div className="mb-4">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <textarea
        rows={4}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        {...props}
      />
    </div>
  );
}

// Country picker: stores the ISO code; onChange(code, name) gives the name in the UI language.
function CountrySelect({ label, value, lang = "en", placeholder = "—", onChange, ...props }) {
  const options = countryOptions(lang);
  return (
    <div className="mb-4">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <select
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        value={value ?? ""}
        onChange={e => { const code = e.target.value; onChange?.(code, code ? countryName(code, lang) : ""); }}
        {...props}
      >
        <option value="">{placeholder}</option>
        {options.map(o => (
          <option key={o.code} value={o.code}>{countryFlag(o.code)} {o.name}</option>
        ))}
      </select>
    </div>
  );
}

function Select({ label, options, ...props }) {
  return (
    <div className="mb-4">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <select
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        {...props}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export { EmptyState, Modal, Input, Textarea, Select, CountrySelect };

// Optional start / end time of reported work. With both, the hours are calculated (end − start).
export function hoursBetween(start, end) {
  if (!start || !end) return null;
  const [sh, sm] = String(start).split(':').map(Number), [eh, em] = String(end).split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;              // past midnight
  return Math.round((mins / 60) * 4) / 4;      // quarter hours
}
export const fmtTimeRange = (s, e) => (s ? `${String(s).slice(0, 5)}${e ? `–${String(e).slice(0, 5)}` : ''}` : '');
export function TimeRangeFields({ start, end, onChange, lang = 'en', small = false }) {
  const cls = small
    ? "w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
    : "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const lbl = small ? "text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1" : "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";
  const set = (s, e) => onChange({ start_time: s || '', end_time: e || '', hours: hoursBetween(s, e) });
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className={lbl}>{lang === 'es' ? 'Desde' : 'From'}</label>
        <input type="time" value={start ?? ''} onChange={e => set(e.target.value, end)} className={cls} />
      </div>
      <div>
        <label className={lbl}>{lang === 'es' ? 'Hasta' : 'To'}</label>
        <input type="time" value={end ?? ''} onChange={e => set(start, e.target.value)} className={cls} />
      </div>
    </div>
  );
}
