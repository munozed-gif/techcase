import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { useInvoices } from "../hooks/useCoreHooks.js";
import { Badge, Spinner } from "../components/ProfileComponents.jsx";
import { InvoiceModal } from "../components/InvoiceModal.jsx";
import { INVOICE_STATUS_COLORS, INV_STATUS_LABEL_KEYS, cap, fmtDate } from "../lib/uiUtils.jsx";
import { STATUS_COLORS } from "../lib/businessConstants.js";
import { Input, Modal, Select, Textarea } from "../components/ui.jsx";

function InvoicesView({ auth }) {
  const { t } = useT();
  const clientFilter = auth.isClient ? { client_id: auth.user?.id } : {};
  const { invoices, loading, hasMore, loadMore, createInvoice, updateInvoice, deleteInvoice } = useInvoices(clientFilter);
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate]     = useState(false);
  const [form, setForm]                 = useState({ invoice_number: "", amount: "", status: "draft", due_date: "", notes: "", case_id: "", client_id: "" });
  const [saving, setSaving]             = useState(false);
  const [createError, setCreateError]   = useState("");
  const [cases, setCases]               = useState([]);
  const [clients, setClients]           = useState([]);

  useEffect(() => {
    (async () => {
      let q = supabase.from("cases").select("id, title, client_id").order("title");
      if (auth.isClient) q = q.eq("client_id", auth.user?.id);
      const { data } = await q;
      setCases(data ?? []);
      if (auth.isAdmin || auth.isManager) {
        const { data: cls } = await supabase.from("users").select("id, full_name, client_profiles(company_name)").eq("role", "client").order("full_name");
        setClients(cls ?? []);
      }
    })();
  }, [auth]);

  const displayed = statusFilter ? invoices.filter(i => i.status === statusFilter) : invoices;
  const totalBilled      = invoices.reduce((s, i) => s + (i.amount ?? 0), 0);
  const totalPaid        = invoices.filter(i => i.status === "paid").reduce((s, i) => s + (i.amount ?? 0), 0);
  const totalOutstanding = invoices.filter(i => ["sent","overdue"].includes(i.status)).reduce((s, i) => s + (i.amount ?? 0), 0);

  async function handleCreate() {
    setCreateError("");
    const clientId = auth.isClient ? auth.user?.id : (form.client_id || null);
    if (!clientId && (auth.isAdmin || auth.isManager)) {
      setCreateError("Please select a client."); return;
    }
    setSaving(true);
    try {
      await createInvoice({
        ...form,
        amount: Number(form.amount),
        client_id: clientId,
        invoice_number: form.invoice_number || `INV-${Date.now()}`,
      });
      setShowCreate(false);
      setForm({ invoice_number: "", amount: "", status: "draft", due_date: "", notes: "", case_id: "", client_id: "" });
    } catch (e) { setCreateError(e.message); }
    setSaving(false);
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("invoices.title")}</h1>
          <p className="text-gray-500 text-sm mt-1">{invoices.length === 1 ? t("invoices.count_one") : t("invoices.count_many").replace("{n}", invoices.length)}</p>
        </div>
        {(auth.isAdmin || auth.isManager) && (
          <button onClick={() => setShowCreate(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl text-sm">
            {t("invoices.new")}
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: t("invoices.total_billed"), value: `$${totalBilled.toLocaleString()}`,      color: "bg-blue-50 text-blue-700" },
          { label: t("invoices.paid"),          value: `$${totalPaid.toLocaleString()}`,        color: "bg-green-50 text-green-700" },
          { label: t("invoices.outstanding"),   value: `$${totalOutstanding.toLocaleString()}`, color: "bg-orange-50 text-orange-700" },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl p-5 ${s.color}`}>
            <div className="text-xl font-bold">{s.value}</div>
            <div className="text-xs mt-1 opacity-80">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="mb-4">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">{t("invoices.all_statuses")}</option>
          {["draft","sent","paid","overdue"].map(s => <option key={s} value={s}>{INV_STATUS_LABEL_KEYS[s] ? t(INV_STATUS_LABEL_KEYS[s]) : cap(s)}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("invoices.col_num")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("invoices.col_client")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("invoices.col_case")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("invoices.col_amount")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("invoices.col_status")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t("invoices.col_due")}</th>
              {(auth.isAdmin || auth.isManager) && <th className="px-5 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {displayed.map(inv => (
              <tr key={inv.id} className="hover:bg-gray-50">
                <td className="px-5 py-4 font-mono text-sm text-gray-700">{inv.invoice_number || `INV-${inv.id?.slice(0,8)}`}</td>
                <td className="px-5 py-4">
                  <div className="font-medium text-gray-900">{inv.client?.client_profiles?.company_name ?? inv.client?.full_name ?? "—"}</div>
                </td>
                <td className="px-5 py-4 text-gray-500">{inv.case?.title ?? "—"}</td>
                <td className="px-5 py-4 font-semibold text-gray-900">${(inv.amount ?? 0).toLocaleString()}</td>
                <td className="px-5 py-4">
                  <Badge className={INVOICE_STATUS_COLORS[inv.status] ?? INVOICE_STATUS_COLORS.draft}>{INV_STATUS_LABEL_KEYS[inv.status] ? t(INV_STATUS_LABEL_KEYS[inv.status]) : cap(inv.status)}</Badge>
                </td>
                <td className="px-5 py-4 text-gray-500">{fmtDate(inv.due_date)}</td>
                {(auth.isAdmin || auth.isManager) && (
                  <td className="px-5 py-4">
                    <div className="flex gap-1">
                      {inv.status === "draft" && (
                        <button onClick={() => updateInvoice(inv.id, { status: "sent" })}
                          className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded border border-blue-100 hover:bg-blue-100">
                          {t("action.send")}
                        </button>
                      )}
                      {inv.status === "sent" && (
                        <button onClick={() => updateInvoice(inv.id, { status: "paid" })}
                          className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded border border-green-100 hover:bg-green-100">
                          {t("action.mark_paid")}
                        </button>
                      )}
                      {inv.status === "sent" && (
                        <button onClick={() => updateInvoice(inv.id, { status: "overdue" })}
                          className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded border border-red-100 hover:bg-red-100">
                          {t("invoices.overdue")}
                        </button>
                      )}
                      <button onClick={() => deleteInvoice(inv.id)}
                        className="text-xs px-2 py-1 bg-gray-50 text-gray-500 rounded border border-gray-100 hover:bg-gray-100">
                        {t("action.delete")}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {displayed.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400 text-sm">{t("invoices.none")}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="mt-4 text-center">
          <button onClick={loadMore} disabled={loading}
            className="px-5 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {/* Create Invoice Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreateError(""); }} title={t("invoices.new_title")}>
        {(auth.isAdmin || auth.isManager) && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
            <select value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">Select client…</option>
              {clients.map(cl => (
                <option key={cl.id} value={cl.id}>
                  {cl.client_profiles?.[0]?.company_name ?? cl.client_profiles?.company_name ?? cl.full_name}
                </option>
              ))}
            </select>
          </div>
        )}
        <Input label={t("invoices.number")} value={form.invoice_number}
          onChange={e => setForm(p => ({ ...p, invoice_number: e.target.value }))}
          placeholder={t("invoices.ph_number")} />
        <div className="grid grid-cols-2 gap-3">
          <Input label={t("invoices.amount_label")} type="number" value={form.amount}
            onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
          <Select label={t("label.status")} value={form.status}
            onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
            options={["draft","sent","paid","overdue"].map(s => ({ value: s, label: INV_STATUS_LABEL_KEYS[s] ? t(INV_STATUS_LABEL_KEYS[s]) : cap(s) }))} />
        </div>
        <Input label={t("invoices.col_due")} type="date" value={form.due_date}
          onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} />
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("invoices.col_case")}</label>
          <select value={form.case_id} onChange={e => setForm(p => ({ ...p, case_id: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">{t("invoices.case_opt")}</option>
            {cases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <Textarea label={t("label.notes")} value={form.notes}
          onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          placeholder={t("invoices.notes_ph")} />
        {createError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 mt-2">{createError}</div>
        )}
        <div className="flex justify-end gap-3 mt-2">
          <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600">{t("action.cancel")}</button>
          <button onClick={handleCreate} disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
            {saving ? t("invoices.creating") : t("invoices.create")}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export { InvoicesView };
