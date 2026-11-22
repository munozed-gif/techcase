// Settings → Sales: customer protection, default commission, seller approvals, platform solutions,
// seller commission payouts.
import { useState, useEffect, useCallback } from "react";
import { Loader2, Check, X, Ban } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { PAYERS, errText } from "../lib/sales.js";
import { SolutionsEditor } from "./SolutionsEditor.jsx";
import { SalesCommissionsTable } from "../views/SalesView.jsx";

const DEFAULTS = { protection_enabled: true, protection_days: 90, default_commission_pct: 5, default_payer: "customer", independent_needs_approval: true };

function SellersList() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc("sellers_list");
    setRows(Array.isArray(data) ? data : []);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function review(u, status) {
    const note = status === "approved" ? null : window.prompt("Note for the seller (optional)") ?? null;
    const { error: e } = await supabase.rpc("seller_review", { p_user: u, p_status: status, p_note: note });
    if (e) setError(errText(e)); else load();
  }
  async function setPct(u, v) {
    const { error: e } = await supabase.rpc("seller_set_commission", { p_user: u, p_pct: v === "" ? null : Number(v) });
    if (e) setError(errText(e)); else load();
  }
  if (!rows) return <div className="flex justify-center py-6"><Loader2 className="animate-spin text-gray-300" /></div>;
  const pill = s => ({ pending: "bg-amber-100 text-amber-700", approved: "bg-green-100 text-green-700", rejected: "bg-red-100 text-red-700", suspended: "bg-gray-200 text-gray-600" }[s]);
  return (
    <div className="space-y-2">
      {error && <div className="text-xs text-red-600">{error}</div>}
      {rows.length === 0 ? <div className="text-sm text-gray-400 p-4 bg-gray-50 rounded-xl">No sellers yet. Users ask from Profile → Teams; partner owners turn members into sellers in Partner → Team.</div> : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
              <th className="text-left px-4 py-2.5">Seller</th><th className="text-left px-4 py-2.5">Partner</th><th className="text-left px-4 py-2.5">Status</th>
              <th className="text-left px-4 py-2.5">Deals</th><th className="text-left px-4 py-2.5">Commission %</th><th />
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => (
                <tr key={r.user_id} className="align-top">
                  <td className="px-4 py-3 text-xs"><div className="font-semibold text-gray-800">{r.full_name}</div><div className="text-gray-400">{r.email} · {r.role}</div>
                    {r.headline && <div className="text-gray-600 mt-0.5">{r.headline}</div>}{r.note && <div className="text-gray-400 italic">{r.note}</div>}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{r.partner_name ?? "Independent"}</td>
                  <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pill(r.status)}`}>{r.status}</span></td>
                  <td className="px-4 py-3 text-xs text-gray-600">{r.opportunities} · {r.won} won</td>
                  <td className="px-4 py-3"><input type="number" min="0" max="100" step="0.5" defaultValue={r.default_commission_pct ?? ""} placeholder="default"
                    onBlur={e => e.target.value !== String(r.default_commission_pct ?? "") && setPct(r.user_id, e.target.value)}
                    className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-xs" /></td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {r.status !== "approved" && <button onClick={() => review(r.user_id, "approved")} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50" title="Approve"><Check size={14} /></button>}
                    {r.status === "pending" && <button onClick={() => review(r.user_id, "rejected")} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50" title="Reject"><X size={14} /></button>}
                    {r.status === "approved" && <button onClick={() => review(r.user_id, "suspended")} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100" title="Suspend"><Ban size={14} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function SettingsSalesTab({ ssCtx, auth }) {
  const cfg = { ...DEFAULTS, ...(ssCtx.settings["sales_settings"] ?? {}) };
  const save = patch => ssCtx.setSetting("sales_settings", { ...cfg, ...patch });
  const toggle = k => save({ [k]: !cfg[k] });
  const sw = on => `relative w-10 h-5 rounded-full transition-colors flex-shrink-0 mt-0.5 ${on ? "bg-violet-600" : "bg-gray-300"}`;
  const box = "p-4 bg-gray-50 rounded-xl border border-gray-100";
  const section = (title, desc) => (<div><h2 className="text-base font-bold text-gray-900 mb-1">{title}</h2>{desc && <p className="text-sm text-gray-500">{desc}</p>}</div>);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        {section("Sales", "Sellers (independent or inside a partner) register opportunities, build the proposal in a presale project, and earn a one-time commission when the customer accepts it.")}
        <div className={box + " flex items-start gap-4"}>
          <button onClick={() => toggle("protection_enabled")} className={sw(cfg.protection_enabled)} role="switch" aria-checked={cfg.protection_enabled}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${cfg.protection_enabled ? "translate-x-5" : ""}`} />
          </button>
          <div className="flex-1">
            <div className="text-sm font-semibold text-gray-800">Customer protection</div>
            <div className="text-xs text-gray-500 mt-0.5">When a seller registers an opportunity, other sellers cannot register the same company (or the same email domain) while it is open, for this many days.</div>
            {cfg.protection_enabled && (
              <div className="flex items-center gap-2 mt-2">
                <input type="number" min="1" max="730" value={cfg.protection_days} onChange={e => save({ protection_days: parseInt(e.target.value, 10) || 90 })}
                  className="w-24 px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-semibold" /><span className="text-xs text-gray-500">days</span>
              </div>
            )}
          </div>
        </div>
        <div className={box + " flex items-start gap-4"}>
          <button onClick={() => toggle("independent_needs_approval")} className={sw(cfg.independent_needs_approval)} role="switch" aria-checked={cfg.independent_needs_approval}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${cfg.independent_needs_approval ? "translate-x-5" : ""}`} />
          </button>
          <div>
            <div className="text-sm font-semibold text-gray-800">Independent sellers need approval</div>
            <div className="text-xs text-gray-500 mt-0.5">Partner sellers are approved by their partner's owner or admins.</div>
          </div>
        </div>
        <div className={box + " grid sm:grid-cols-2 gap-4"}>
          <label className="text-sm font-semibold text-gray-800">Default commission %
            <p className="text-xs text-gray-500 font-normal mb-2">Of the accepted proposal value (one-time). Each seller and each opportunity can override it.</p>
            <input type="number" min="0" max="100" step="0.5" value={cfg.default_commission_pct} onChange={e => save({ default_commission_pct: parseFloat(e.target.value) || 0 })}
              className="w-28 px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold" /></label>
          <label className="text-sm font-semibold text-gray-800">Default payer
            <p className="text-xs text-gray-500 font-normal mb-2">Who pays the commission; the seller can change it per opportunity before it is won.</p>
            <select value={cfg.default_payer} onChange={e => save({ default_payer: e.target.value })} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
              {PAYERS.map(p => <option key={p.id} value={p.id}>{p.en}</option>)}
            </select></label>
        </div>
      </div>

      <div className="space-y-3">{section("Sellers")}<SellersList /></div>
      <div className="space-y-3">{section("Platform solutions", "Packaged solutions offered by the platform itself. Partners publish theirs in Partner → Solutions.")}
        <SolutionsEditor lang="en" platform userId={auth?.user?.id} /></div>
      <div className="space-y-3">{section("Seller commissions", "Record each payout once you pay it outside the platform; adjust or cancel while pending.")}
        <SalesCommissionsTable lang="en" staff /></div>
    </div>
  );
}
