import { useState, useEffect, useMemo } from "react";
import { FileText, Plus, Receipt, X } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useInvoices } from "../hooks/useCoreHooks.js";
import { usePlanConfig, useSystemSettings } from "../hooks/useSystemSettings.jsx";
import { Badge } from "../components/ProfileComponents.jsx";
import { fmtDate, INVOICE_STATUS_COLORS, INV_STATUS_LABEL_KEYS } from "../lib/uiUtils.jsx";
import { Spinner } from "./ProfileComponents.jsx";
import { logEvent, notify } from "../lib/utils.js";

function InvoiceModal({ isOpen, onClose, caseData, auth }) {
  const { t } = useT();
  const { settings } = useSystemSettings();

  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState(null);
  const [lineItems, setLineItems]     = useState([]);
  const [defaultRate, setDefaultRate] = useState(150);
  const [taxRate, setTaxRate]         = useState(0);
  const [notes, setNotes]             = useState('');
  const [companyName, setCompanyName] = useState('Your Company');
  const [consultantName, setConsultantName] = useState('');
  const [savedOk, setSavedOk]         = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  // Stable invoice number for the session open (rebuilt on re-open via key or reset)
  const invoiceNumber = useMemo(
    () => `INV-${new Date().getFullYear()}-${(caseData?.id ?? '').slice(0, 4).toUpperCase()}-${Math.floor(Math.random() * 900) + 100}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOpen]
  );

  useEffect(() => {
    if (!isOpen || !caseData?.id) return;
    setSavedOk(false);
    setError(null);
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, caseData?.id]);

  async function fetchData() {
    setLoading(true);
    try {
      const cn = settings['invoice_company_name'] ?? 'Your Company';
      const tr = parseFloat(settings['invoice_tax_rate'] ?? '0') || 0;
      const dr = parseFloat(settings['invoice_hourly_rate'] ?? '150') || 150;
      setCompanyName(cn);
      setTaxRate(tr);
      setDefaultRate(dr);

      const [{ data: logs, error: logsErr }, { data: assignment }] = await Promise.all([
        supabase.from('time_logs').select('*').eq('case_id', caseData.id).order('log_date', { ascending: true }),
        supabase.from('case_assignments').select('*, users:consultant_id(id, full_name, email)').eq('case_id', caseData.id).limit(1).maybeSingle(),
      ]);
      if (logsErr) throw logsErr;

      const cName = assignment?.users?.full_name ?? auth?.profile?.full_name ?? '';
      setConsultantName(cName);

      const items = (logs ?? []).map(log => ({
        id: log.id,
        description: log.description || `Work — ${caseData.title}`,
        hours: parseFloat(log.hours ?? 0),
        rate: dr,
        date: log.log_date,
      }));
      setLineItems(items.length > 0 ? items : [{
        id: 'default',
        description: `Consulting services — ${caseData.title}`,
        hours: 1,
        rate: dr,
        date: today,
      }]);
    } catch (e) {
      setError(e.message ?? 'Failed to load invoice data');
    }
    setLoading(false);
  }

  const subtotal  = lineItems.reduce((s, i) => s + (parseFloat(i.hours) * parseFloat(i.rate)), 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total     = subtotal + taxAmount;

  function updateItem(id, field, value) {
    setLineItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  }
  function addItem() {
    setLineItems(prev => [...prev, { id: Date.now().toString(), description: '', hours: 1, rate: defaultRate, date: today }]);
  }
  function removeItem(id) {
    setLineItems(prev => prev.filter(i => i.id !== id));
  }
  function handleDefaultRateChange(rate) {
    const r = parseFloat(rate) || 0;
    setDefaultRate(r);
    setLineItems(prev => prev.map(item => ({ ...item, rate: r })));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const { error: insErr } = await supabase.from('invoices').insert({
        case_id:         caseData.id,
        invoice_number:  invoiceNumber,
        issued_by:       auth.user.id,
        client_name:     caseData.client?.full_name ?? '',
        consultant_name: consultantName,
        line_items:      lineItems,
        subtotal,
        tax_rate:        taxRate,
        tax_amount:      taxAmount,
        total,
        notes:           notes.trim() || null,
        status:          'draft',
      });
      if (insErr) throw insErr;
      logEvent('invoice.created', { entityType: 'case', entityId: caseData.id, entityName: caseData.title, metadata: { invoice_number: invoiceNumber, total } });
      if (caseData.client_id) {
        try { await notify(caseData.client_id, t('invoice.title'), `Invoice ${invoiceNumber} has been created for "${caseData.title}"`); } catch (_) {}
      }
      setSavedOk(true);
    } catch (e) {
      setError(e.message ?? 'Failed to save invoice');
    }
    setSaving(false);
  }

  if (!isOpen) return null;

  const clientName  = caseData.client?.full_name ?? '';
  const clientEmail = caseData.client?.email ?? '';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 no-print"
         style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
      {/* Print styles injected inline */}
      <style>{`
        @media print {
          body > * { visibility: hidden; }
          .invoice-print-area { visibility: visible !important; position: fixed !important; top: 0; left: 0; width: 100% !important; padding: 40px !important; box-shadow: none !important; border-radius: 0 !important; background: white !important; }
          .invoice-print-area * { visibility: visible !important; }
          .no-print { display: none !important; visibility: hidden !important; }
        }
      `}</style>

      <div className="relative w-full mx-4" style={{ maxWidth: '854px' }}>
        {/* Modal chrome — hidden on print */}
        <div className="no-print bg-white rounded-t-2xl border-b border-gray-100 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-blue-600" />
            <h2 className="font-bold text-gray-900 text-base">{t('invoice.title')}</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs text-gray-500 whitespace-nowrap">{t('invoice.default_rate')}</label>
            <input type="number" min={0} step={1} value={defaultRate}
              onChange={e => handleDefaultRateChange(e.target.value)}
              className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <label className="text-xs text-gray-500 ml-2">{t('invoice.tax')}</label>
            <div className="flex items-center gap-1">
              <input type="number" min={0} max={100} step={0.5} value={taxRate}
                onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <span className="text-xs text-gray-500">%</span>
            </div>
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl transition-colors">
              <FileText className="w-3.5 h-3.5" />{t('invoice.print')}
            </button>
            <button onClick={handleSave} disabled={saving || savedOk}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl disabled:opacity-60 transition-colors">
              {saving ? '...' : savedOk ? t('invoice.saved') : t('invoice.save')}
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg ml-1">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {error && (
          <div className="no-print bg-red-50 border-l-4 border-red-400 text-red-700 text-sm px-6 py-3">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white px-6 py-16 text-center text-gray-400 rounded-b-2xl"><Spinner /></div>
        ) : (
          /* ── Invoice print area ── */
          <div className="invoice-print-area bg-white rounded-b-2xl shadow-xl px-10 py-10">
            {/* Header */}
            <div className="flex justify-between items-start mb-8">
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-1">{t('invoice.number')}</div>
                <div className="text-2xl font-extrabold text-gray-900 tracking-tight">{invoiceNumber}</div>
                <div className="text-xs text-gray-400 mt-1.5">{t('invoice.date')}: <span className="text-gray-600 font-medium">{today}</span></div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-extrabold text-blue-700 leading-tight">{companyName}</div>
              </div>
            </div>

            <hr className="border-gray-200 mb-7" />

            {/* Bill To / From */}
            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">{t('invoice.bill_to')}</div>
                <div className="font-semibold text-gray-900 text-base">{clientName || '—'}</div>
                {clientEmail && <div className="text-sm text-gray-500 mt-0.5">{clientEmail}</div>}
              </div>
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">{t('invoice.bill_from')}</div>
                <div className="font-semibold text-gray-900 text-base">{companyName}</div>
                {consultantName && <div className="text-sm text-gray-500 mt-0.5">{consultantName}</div>}
              </div>
            </div>

            {/* Line items table */}
            <div className="mb-7 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left pb-2 pt-1 pr-3 text-xs text-gray-400 uppercase tracking-widest font-semibold w-1/2">{t('invoice.description')}</th>
                    <th className="text-right pb-2 pt-1 px-2 text-xs text-gray-400 uppercase tracking-widest font-semibold w-24">{t('invoice.hours')}</th>
                    <th className="text-right pb-2 pt-1 px-2 text-xs text-gray-400 uppercase tracking-widest font-semibold w-28">{t('invoice.rate')}</th>
                    <th className="text-right pb-2 pt-1 pl-2 text-xs text-gray-400 uppercase tracking-widest font-semibold w-28">{t('invoice.amount')}</th>
                    <th className="no-print w-8 pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, idx) => (
                    <tr key={item.id} className={idx % 2 === 0 ? 'bg-gray-50/60' : 'bg-white'}>
                      <td className="py-2.5 pr-3 align-middle">
                        <input value={item.description}
                          onChange={e => updateItem(item.id, 'description', e.target.value)}
                          className="no-print w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none text-gray-900 text-sm py-0.5" />
                        <span className="hidden print:inline text-gray-900">{item.description}</span>
                      </td>
                      <td className="py-2.5 px-2 text-right align-middle">
                        <input type="number" min={0} step={0.25} value={item.hours}
                          onChange={e => updateItem(item.id, 'hours', e.target.value)}
                          className="no-print w-20 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none text-right text-sm py-0.5" />
                        <span className="hidden print:inline">{item.hours}</span>
                      </td>
                      <td className="py-2.5 px-2 text-right align-middle">
                        <input type="number" min={0} step={1} value={item.rate}
                          onChange={e => updateItem(item.id, 'rate', e.target.value)}
                          className="no-print w-24 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none text-right text-sm py-0.5" />
                        <span className="hidden print:inline">${parseFloat(item.rate).toFixed(2)}</span>
                      </td>
                      <td className="py-2.5 pl-2 text-right align-middle font-semibold text-gray-900">
                        ${(parseFloat(item.hours) * parseFloat(item.rate)).toFixed(2)}
                      </td>
                      <td className="no-print py-2.5 pl-2 align-middle">
                        <button onClick={() => removeItem(item.id)}
                          className="text-gray-300 hover:text-red-400 transition-colors p-0.5">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={addItem}
                className="no-print mt-3 text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add line item
              </button>
            </div>

            {/* Totals */}
            <div className="flex justify-end mb-8">
              <div className="w-64 space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>{t('invoice.subtotal')}</span>
                  <span className="font-medium tabular-nums">${subtotal.toFixed(2)}</span>
                </div>
                {taxRate > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>{t('invoice.tax')} ({taxRate}%)</span>
                    <span className="font-medium tabular-nums">${taxAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 text-base border-t-2 border-gray-200 pt-2 mt-1">
                  <span>{t('invoice.total')}</span>
                  <span className="tabular-nums">${total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="border-t border-gray-100 pt-6">
              <div className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">{t('invoice.notes')}</div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Payment terms, bank details, or any other notes..."
                className="no-print w-full border border-gray-100 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-gray-50" />
              {notes && <p className="hidden print:block text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{notes}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { InvoiceModal };
