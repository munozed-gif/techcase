// Case Costs tab (Arena administrators and managers): income vs costs of one case.
//
// Income: the case budget (when set) and the agreed price = planned hours × consultant rate,
// plus what has been invoiced / paid. Costs: consultants (planned vs reported hours × rate),
// AI (tokens per call, by step), the VM (monthly cost × the case's share of SAP operations),
// Arena platform fee and support (% of income), payment fees, headhunter commission, manual
// expenses, contingency and taxes. Amounts are in the platform currency (USD); when the
// customer / project / case uses another currency, it is shown converted too.
import { useEffect, useMemo, useState } from "react";
import { BarChart2, Bot, ChevronDown, Plus, Receipt, RotateCcw, Server, Users, Wallet, X } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { costConfig, caseCurrency, toUsd, fromUsd, fmtMoney, AI_FEATURE_LABEL, EXPENSE_CATEGORIES, statusTimeline, monthsBetween } from "../lib/costs.js";
import { SENIORITY_LEVELS } from "../lib/estimation.js";

const sum = (arr, f) => (arr ?? []).reduce((s, x) => s + (Number(f(x)) || 0), 0);

function Card({ icon: Icon, title, right, children, open: openInit = true }) {
  const [open, setOpen] = useState(openInit);
  return (
    <div className="bg-white dark:bg-gray-900/60 rounded-2xl border border-gray-200 dark:border-white/10 overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-3 text-left">
        <Icon size={15} className="text-blue-600 dark:text-blue-400 shrink-0" />
        <span className="text-sm font-semibold text-gray-900 dark:text-white flex-1">{title}</span>
        {right && <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{right}</span>}
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4 border-t border-gray-100 dark:border-white/10 pt-3">{children}</div>}
    </div>
  );
}

function Line({ label, value, sub, strong, tone }) {
  const c = tone === 'pos' ? 'text-emerald-700 dark:text-emerald-400' : tone === 'neg' ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-100';
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <div className="min-w-0">
        <span className={`text-sm ${strong ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>{label}</span>
        {sub && <span className="block text-[11px] text-gray-400">{sub}</span>}
      </div>
      <span className={`text-sm tabular-nums whitespace-nowrap ${strong ? 'font-bold' : 'font-medium'} ${c}`}>{value}</span>
    </div>
  );
}

export function CaseCostsTab({ caseData, activities, settings, lang = 'en', auth }) {
  const L = (en, es) => (lang === 'es' ? es : en);
  const cfg = costConfig(settings);
  const [data, setData] = useState(null);
  const [nonce, setNonce] = useState(0);
  const [cur, setCur] = useState({ code: 'USD', rate: 1 });

  useEffect(() => {
    let alive = true;
    (async () => {
      const cid = caseData.id;
      const [te0, inv, ai, ex, apps, ops, prj, cust, hist, partner, pcases, tl] = await Promise.all([
        supabase.from('time_entries').select('id, consultant_id, hours, activity_id, is_billable, date, start_time, end_time').eq('case_id', cid),
        supabase.from('invoices').select('id, amount, status, issue_date, due_date').eq('case_id', cid),
        supabase.from('ai_usage_events').select('feature, cost_usd, input_tokens, output_tokens, mcp, created_at').eq('case_id', cid),
        supabase.from('case_expenses').select('*').eq('case_id', cid).eq('archived', false).order('expense_date'),
        supabase.from('applications').select('consultant_id, status, proposed_rate, headhunter_commission_amount').eq('case_id', cid),
        supabase.rpc('sap_ops_share', { p_case: cid }),
        caseData.project_id ? supabase.from('projects').select('currency').eq('id', caseData.project_id).maybeSingle() : Promise.resolve({ data: null }),
        caseData.customer_id ? supabase.from('customers').select('currency').eq('id', caseData.customer_id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from('audit_logs').select('event_type, old_value, new_value, created_at').eq('entity_id', cid)
          .in('event_type', ['case.status_changed', 'case.reopened']).order('created_at'),
        caseData.partner_id ? supabase.from('partners').select('id, name, plan').eq('id', caseData.partner_id).maybeSingle() : Promise.resolve({ data: null }),
        caseData.partner_id ? supabase.from('cases').select('id, created_at, completed_at, status').eq('partner_id', caseData.partner_id) : Promise.resolve({ data: [] }),
        // Hours reported in the case's Time tab (no activity) count too.
        supabase.from('time_logs').select('id, user_id, hours, log_date, start_time, end_time').eq('case_id', cid),
      ]);
      const te = { data: [
        ...(te0.data ?? []),
        ...(tl.data ?? []).map(l => ({ id: `log-${l.id}`, consultant_id: l.user_id, hours: l.hours, activity_id: null, is_billable: true,
          date: l.log_date, start_time: l.start_time, end_time: l.end_time, _timeTab: true })),
      ] };
      const consultantIds = [...new Set([
        ...(te.data ?? []).map(t => t.consultant_id),
        ...(caseData.case_assignments ?? []).map(a => a.consultant_id),
      ].filter(Boolean))];
      const [{ data: profs }, { data: users }] = consultantIds.length ? await Promise.all([
        supabase.from('consultant_profiles').select('id, hourly_rate, expertise_level').in('id', consultantIds),
        supabase.from('users').select('id, full_name, role').in('id', consultantIds),
      ]) : [{ data: [] }, { data: [] }];
      if (!alive) return;
      const code = caseCurrency({ customer: cust.data, project: prj.data, caseRow: caseData });
      setCur({ code, rate: code === 'USD' ? 1 : (Number(cfg.fx_rates?.[code]) || null) });
      setData({ te: te.data ?? [], inv: inv.data ?? [], ai: ai.data ?? [], ex: ex.data ?? [], apps: apps.data ?? [],
        ops: ops.data ?? [], profs: profs ?? [], users: users ?? [],
        hist: hist.data ?? [], partner: partner.data ?? null, pcases: pcases.data ?? [] });
    })();
    return () => { alive = false; };
  }, [caseData.id, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const calc = useMemo(() => {
    if (!data) return null;
    const accepted = Object.fromEntries(data.apps.filter(a => a.status === 'accepted' && a.proposed_rate).map(a => [a.consultant_id, Number(a.proposed_rate)]));
    const profBy = Object.fromEntries(data.profs.map(p => [p.id, p]));
    const userBy = Object.fromEntries(data.users.map(u => [u.id, u]));
    const rateOf = (id) => accepted[id] ?? (Number(profBy[id]?.hourly_rate) || null)
      ?? cfg.default_rates[profBy[id]?.expertise_level] ?? cfg.default_rates.mid;
    const assigned = (caseData.case_assignments ?? []).map(a => a.consultant_id).filter(Boolean);
    const expSen = SENIORITY_LEVELS.includes(caseData.expected_seniority) ? caseData.expected_seniority : 'mid';
    const planRate = assigned.length ? assigned.reduce((s, id) => s + rateOf(id), 0) / assigned.length : cfg.default_rates[expSen];
    const planRateSrc = assigned.length ? L('assigned consultant rate', 'tarifa del consultor asignado') : L(`default ${expSen} rate`, `tarifa por defecto ${expSen}`);

    // Consultants: plan vs actual
    const acts = activities ?? [];
    const hArena = sum(acts, a => a.est_hours);
    const hStd = sum(acts, a => a.est_hours_manual ?? a.est_hours);
    const agreedPrice = hArena * planRate;
    const stdPrice = hStd * planRate;
    const actualHours = sum(data.te, t => t.hours);
    const actualCost = sum(data.te, t => (Number(t.hours) || 0) * rateOf(t.consultant_id));
    const byActivity = acts.map(a => {
      const tes = data.te.filter(t => t.activity_id === a.id);
      const rh = sum(tes, t => t.hours);
      return { id: a.id, title: a.title, std: Number(a.est_hours_manual ?? a.est_hours) || 0, arena: Number(a.est_hours) || 0,
        planned: (Number(a.est_hours) || 0) * planRate, hours: rh, cost: sum(tes, t => (Number(t.hours) || 0) * rateOf(t.consultant_id)) };
    });
    const unassignedHours = sum(data.te.filter(t => !t.activity_id || !acts.some(a => a.id === t.activity_id)), t => t.hours);
    const byConsultant = Object.values(data.te.reduce((m, t) => {
      const k = t.consultant_id ?? 'x';
      m[k] = m[k] ?? { id: k, name: userBy[k]?.full_name ?? L('Unknown', 'Desconocido'), rate: rateOf(k), hours: 0, billable: 0 };
      m[k].hours += Number(t.hours) || 0; if (t.is_billable !== false) m[k].billable += Number(t.hours) || 0;
      return m;
    }, {}));

    // Cost of quality: hours reported while the case was in a rework stage, or after go-live.
    const statusOn = statusTimeline(data.hist, caseData.status);
    const tagged = data.te.map(t => ({ ...t, st: statusOn(t.date, t.start_time) }));
    const withTime = data.te.filter(t => t.start_time).length;
    const reworkTe = tagged.filter(t => cfg.rework_stages.includes(t.st));
    const hyperTe = tagged.filter(t => cfg.hypercare_stages.includes(t.st));
    const reworkHours = sum(reworkTe, t => t.hours), reworkCost = sum(reworkTe, t => (Number(t.hours) || 0) * rateOf(t.consultant_id));
    const hyperHours = sum(hyperTe, t => t.hours), hyperCost = sum(hyperTe, t => (Number(t.hours) || 0) * rateOf(t.consultant_id));
    const reworkByStage = Object.entries(reworkTe.reduce((m, t) => { m[t.st] = (m[t.st] ?? 0) + (Number(t.hours) || 0); return m; }, {}));
    const hasHistory = data.hist.length > 0;

    // Partner subscription (Pro): monthly price split across the partner's active cases.
    let partnerShare = 0, partnerMonths = [];
    if (data.partner?.plan === 'pro') {
      const price = Number(settings?.plan_prices?.partner_pro?.amount) || 49;
      const end = caseData.completed_at ? new Date(caseData.completed_at) : new Date();
      partnerMonths = monthsBetween(caseData.created_at ?? new Date(), end).map(m => {
        const mStart = new Date(`${m}-01T00:00:00`), mEnd = new Date(mStart); mEnd.setMonth(mEnd.getMonth() + 1);
        const active = data.pcases.filter(c => new Date(c.created_at) < mEnd && (!c.completed_at || new Date(c.completed_at) >= mStart)).length || 1;
        return { month: m, active, cost: price / active };
      });
      partnerShare = sum(partnerMonths, r => r.cost);
    }

    // Income (budget and invoices are in the case's currency)
    const budgetUsd = caseData.budget ? toUsd(Number(caseData.budget), caseData.currency || 'USD', cfg) : null;
    const invUsd = (st) => sum(data.inv.filter(i => st(i.status)), i => toUsd(Number(i.amount) || 0, caseData.currency || 'USD', cfg));
    const invoiced = invUsd(s => s !== 'draft' && s !== 'cancelled');
    const paid = invUsd(s => s === 'paid');
    const incomeBasis = budgetUsd ?? agreedPrice;

    // AI
    const aiTotal = sum(data.ai, e => e.cost_usd);
    const aiBy = Object.values(data.ai.reduce((m, e) => {
      const k = e.feature || 'other';
      m[k] = m[k] ?? { feature: k, cost: 0, calls: 0, tokens: 0 };
      m[k].cost += Number(e.cost_usd) || 0; m[k].calls += 1; m[k].tokens += (e.input_tokens || 0) + (e.output_tokens || 0);
      return m;
    }, {})).sort((a, b) => b.cost - a.cost);

    // VM share
    const vmRows = (data.ops ?? []).map(o => ({ ...o, cost: o.total ? (o.ops / o.total) * cfg.vm_monthly_usd : 0 }));
    const vmTotal = sum(vmRows, r => r.cost);

    // Fees and other
    const arenaFee = incomeBasis * cfg.arena_fee_pct / 100;
    const supportFee = incomeBasis * cfg.support_fee_pct / 100;
    const paidCount = data.inv.filter(i => i.status === 'paid').length;
    const paymentFees = paid * cfg.payment_fee_pct / 100 + paidCount * cfg.payment_fee_fixed_usd;
    const hhCommission = sum(data.apps, a => a.headhunter_commission_amount);
    const expenses = sum(data.ex, e => toUsd(Number(e.amount) || 0, e.currency || 'USD', cfg));
    const contingency = agreedPrice * cfg.contingency_pct / 100;
    const taxes = incomeBasis * cfg.tax_pct / 100;

    const costsActual = actualCost + aiTotal + vmTotal + arenaFee + supportFee + paymentFees + hhCommission + expenses + taxes + partnerShare;
    const costsPlanned = agreedPrice + aiTotal + vmTotal + arenaFee + supportFee + hhCommission + expenses + contingency + taxes + partnerShare;
    return { planRate, planRateSrc, hArena, hStd, agreedPrice, stdPrice, actualHours, actualCost, byActivity, unassignedHours, byConsultant,
      budgetUsd, invoiced, paid, incomeBasis, aiTotal, aiBy, vmRows, vmTotal, arenaFee, supportFee, paymentFees, paidCount, hhCommission,
      expenses, contingency, taxes, costsActual, costsPlanned,
      reworkHours, reworkCost, hyperHours, hyperCost, reworkByStage, hasHistory, withTime, entriesCount: data.te.length, partnerShare, partnerMonths, partnerName: data.partner?.name,
      marginPlanned: incomeBasis - costsPlanned, marginActual: incomeBasis - costsActual,
      remaining: agreedPrice - actualCost, arenaSaving: stdPrice - agreedPrice };
  }, [data, activities, caseData, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!calc) return <div className="py-10 text-center text-sm text-gray-400">{L('Loading costs…', 'Cargando costos…')}</div>;

  // Money: USD, plus the customer's currency when it is not USD (and a rate is set).
  const M = (usd) => {
    const main = fmtMoney(usd, 'USD', lang);
    if (cur.code === 'USD') return main;
    if (!cur.rate) return main;
    return <>{main} <span className="text-[11px] font-normal text-gray-400">≈ {fmtMoney(fromUsd(usd, cur.code, cfg), cur.code, lang)}</span></>;
  };
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');

  return (
    <div className="space-y-3">
      {cur.code !== 'USD' && !cur.rate && (
        <div className="text-xs rounded-xl border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2">
          {L(`This case uses ${cur.code}. Set the ${cur.code} exchange rate in Settings → Costs to see converted amounts.`, `Este caso usa ${cur.code}. Defina el tipo de cambio de ${cur.code} en Configuración → Costos para ver los montos convertidos.`)}
        </div>
      )}

      {/* ── Summary ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: L('Income', 'Ingresos'), v: calc.incomeBasis, sub: calc.budgetUsd != null ? L('case budget', 'presupuesto del caso') : L('agreed price (plan × rate)', 'precio acordado (plan × tarifa)') },
          { label: L('Costs to date', 'Costos a la fecha'), v: calc.costsActual, sub: L('reported hours, AI, VM, fees…', 'horas reportadas, IA, VM, comisiones…') },
          { label: L('Margin to date', 'Margen a la fecha'), v: calc.marginActual, sub: pct(calc.marginActual, calc.incomeBasis), tone: calc.marginActual >= 0 ? 'pos' : 'neg' },
          { label: L('Planned margin', 'Margen planificado'), v: calc.marginPlanned, sub: pct(calc.marginPlanned, calc.incomeBasis), tone: calc.marginPlanned >= 0 ? 'pos' : 'neg' },
        ].map(k => (
          <div key={k.label} className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-900/60 p-3">
            <div className="text-[11px] text-gray-500 dark:text-gray-400">{k.label}</div>
            <div className={`text-lg font-bold tabular-nums ${k.tone === 'pos' ? 'text-emerald-700 dark:text-emerald-400' : k.tone === 'neg' ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>{M(k.v)}</div>
            <div className="text-[11px] text-gray-400">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Income ── */}
      <Card icon={Wallet} title={L('Income', 'Ingresos')} right={M(calc.incomeBasis)}>
        {calc.budgetUsd != null && <Line label={L('Case budget', 'Presupuesto del caso')} value={M(calc.budgetUsd)} />}
        <Line label={L('Agreed price', 'Precio acordado')} sub={L(`${calc.hArena} planned h (Arena) × ${fmtMoney(calc.planRate, 'USD', lang)}/h — ${calc.planRateSrc}`, `${calc.hArena} h planificadas (Arena) × ${fmtMoney(calc.planRate, 'USD', lang)}/h — ${calc.planRateSrc}`)} value={M(calc.agreedPrice)} />
        {calc.hStd !== calc.hArena && <Line label={L('Standard price (by hand)', 'Precio estándar (manual)')} sub={`${calc.hStd} h × ${fmtMoney(calc.planRate, 'USD', lang)}/h`} value={M(calc.stdPrice)} />}
        {calc.arenaSaving > 0 && <Line label={L('Saving with Arena', 'Ahorro con Arena')} value={M(calc.arenaSaving)} tone="pos" />}
        <Line label={L('Invoiced', 'Facturado')} value={M(calc.invoiced)} />
        <Line label={L('Paid', 'Cobrado')} value={M(calc.paid)} />
        <Line label={L('Still to invoice', 'Por facturar')} value={M(Math.max(0, calc.incomeBasis - calc.invoiced))} strong />
      </Card>

      {/* ── Consultants ── */}
      <Card icon={Users} title={L('Consultant resources', 'Recursos consultores')} right={M(calc.actualCost)}>
        <Line label={L('Planned', 'Planificado')} sub={`${calc.hArena} h × ${fmtMoney(calc.planRate, 'USD', lang)}/h`} value={M(calc.agreedPrice)} />
        <Line label={L('Reported', 'Reportado')} sub={`${Math.round(calc.actualHours * 10) / 10} h`} value={M(calc.actualCost)} />
        <Line label={L('Remaining (plan − reported)', 'Restante (plan − reportado)')} value={M(calc.remaining)} strong tone={calc.remaining >= 0 ? 'pos' : 'neg'} />
        {calc.byActivity.length > 0 && (
          <div className="md-table-wrap mt-3"><table className="md-table">
            <thead><tr><th>{L('Activity', 'Actividad')}</th><th>{L('Std h', 'h Est.')}</th><th>{L('Arena h', 'h Arena')}</th><th>{L('Planned', 'Planificado')}</th><th>{L('Reported h', 'h Report.')}</th><th>{L('Actual', 'Real')}</th></tr></thead>
            <tbody>
              {calc.byActivity.map(a => (
                <tr key={a.id}>
                  <td>{a.title}</td><td>{a.std}</td><td>{a.arena}</td><td>{fmtMoney(a.planned, 'USD', lang)}</td>
                  <td>{Math.round(a.hours * 10) / 10}</td>
                  <td className={a.cost > a.planned ? 'text-red-600' : ''}>{fmtMoney(a.cost, 'USD', lang)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {calc.unassignedHours > 0 && <p className="text-[11px] text-gray-400 mt-2">{L(`${Math.round(calc.unassignedHours * 10) / 10} h reported without an activity (including the case's Time tab).`, `${Math.round(calc.unassignedHours * 10) / 10} h reportadas sin actividad (incluye la pestaña Tiempo del caso).`)}</p>}
        {calc.byConsultant.length > 0 && (
          <div className="mt-3 space-y-1">
            {calc.byConsultant.map(c => (
              <Line key={c.id} label={c.name} sub={`${Math.round(c.hours * 10) / 10} h (${Math.round(c.billable * 10) / 10} ${L('billable', 'facturables')}) × ${fmtMoney(c.rate, 'USD', lang)}/h`} value={M(c.hours * c.rate)} />
            ))}
          </div>
        )}
      </Card>

      {/* ── AI ── */}
      <Card icon={Bot} title={L('AI (Claude API)', 'IA (API de Claude)')} right={M(calc.aiTotal)}>
        {calc.aiBy.length === 0
          ? <p className="text-xs text-gray-400">{L('No AI usage recorded for this case yet (recorded since the cost tracking was enabled).', 'Aún no hay uso de IA registrado para este caso (se registra desde que se activó el control de costos).')}</p>
          : calc.aiBy.map(r => (
            <Line key={r.feature} label={(AI_FEATURE_LABEL[lang] ?? AI_FEATURE_LABEL.en)[r.feature] ?? r.feature}
              sub={`${r.calls} ${L('calls', 'llamadas')} · ${Math.round(r.tokens / 1000)}k tokens`} value={fmtMoney(r.cost, 'USD', lang, 4)} />
          ))}
      </Card>

      {/* ── Infrastructure ── */}
      <Card icon={Server} title={L('Infrastructure (VM + MCP / bridge)', 'Infraestructura (VM + MCP / bridge)')} right={M(calc.vmTotal)}>
        <p className="text-[11px] text-gray-400 mb-1">{L(`VM cost ${fmtMoney(cfg.vm_monthly_usd, 'USD', lang)}/month, split by each case's share of SAP operations (writes, releases, live SAP AI calls).`, `Costo de la VM ${fmtMoney(cfg.vm_monthly_usd, 'USD', lang)}/mes, repartido según la participación de cada caso en las operaciones SAP (escrituras, liberaciones, llamadas IA con SAP en vivo).`)}</p>
        {calc.vmRows.length === 0
          ? <p className="text-xs text-gray-400">{L('No SAP operations recorded for this case.', 'No hay operaciones SAP registradas para este caso.')}</p>
          : calc.vmRows.map(r => <Line key={r.month} label={r.month} sub={`${r.ops} / ${r.total} ${L('operations', 'operaciones')} (${pct(r.ops, r.total)})`} value={fmtMoney(r.cost, 'USD', lang)} />)}
      </Card>

      {/* ── Cost of quality ── */}
      <Card icon={RotateCcw} title={L('Rework & hypercare', 'Retrabajo e hypercare')} right={M(calc.reworkCost + calc.hyperCost)} open={false}>
        <p className="text-[11px] text-gray-400 mb-1">{L('Part of the consultant cost above (not added again): hours reported while the case was in a rework stage, or after go-live.', 'Parte del costo de consultores (no se suma de nuevo): horas reportadas con el caso en una etapa de retrabajo, o después de la salida en vivo.')}</p>
        <p className="text-[11px] text-gray-400 mb-1">{L(`${calc.withTime} of ${calc.entriesCount} time entries have a start time (exact stage); the rest use midday of their date.`, `${calc.withTime} de ${calc.entriesCount} registros de horas tienen hora de inicio (etapa exacta); el resto usa el mediodía de su fecha.`)}</p>
        {!calc.hasHistory && <p className="text-[11px] text-amber-600 mb-1">{L('No status history recorded for this case — all hours count as regular work.', 'No hay historial de estados de este caso — todas las horas cuentan como trabajo normal.')}</p>}
        <Line label={L('Rework', 'Retrabajo')} sub={`${Math.round(calc.reworkHours * 10) / 10} h · ${cfg.rework_stages.join(', ')}`} value={M(calc.reworkCost)} tone={calc.reworkCost > 0 ? 'neg' : undefined} />
        {calc.reworkByStage.map(([st, h]) => <div key={st} className="pl-3 text-[11px] text-gray-400">{st}: {Math.round(h * 10) / 10} h</div>)}
        <Line label={L('Hypercare / warranty (after go-live)', 'Hypercare / garantía (después de salir en vivo)')} sub={`${Math.round(calc.hyperHours * 10) / 10} h · ${cfg.hypercare_stages.join(', ')}`} value={M(calc.hyperCost)} />
        <Line label={L('Share of consultant cost', 'Porcentaje del costo de consultores')} value={pct(calc.reworkCost + calc.hyperCost, calc.actualCost)} />
      </Card>

      {/* ── Arena & other ── */}
      <Card icon={Receipt} title={L('Arena, fees and other costs', 'Arena, comisiones y otros costos')} right={M(calc.arenaFee + calc.supportFee + calc.paymentFees + calc.hhCommission + calc.expenses + calc.taxes + calc.partnerShare)}>
        <Line label={L('Arena platform / management', 'Plataforma / gestión Arena')} sub={`${cfg.arena_fee_pct}% ${L('of income', 'de los ingresos')}`} value={M(calc.arenaFee)} />
        <Line label={L('Arena support', 'Soporte Arena')} sub={`${cfg.support_fee_pct}% ${L('of income', 'de los ingresos')}`} value={M(calc.supportFee)} />
        <Line label={L('Payment fees', 'Comisiones de pago')} sub={`${cfg.payment_fee_pct}% + ${fmtMoney(cfg.payment_fee_fixed_usd, 'USD', lang)} × ${calc.paidCount}`} value={M(calc.paymentFees)} />
        {calc.hhCommission > 0 && <Line label={L('Headhunter commission', 'Comisión headhunter')} value={M(calc.hhCommission)} />}
        {calc.partnerShare > 0 && <Line label={L(`Partner Pro subscription (share) — ${calc.partnerName ?? ''}`, `Suscripción Partner Pro (proporción) — ${calc.partnerName ?? ''}`)}
          sub={calc.partnerMonths.map(m => `${m.month}: 1/${m.active}`).join(' · ')} value={M(calc.partnerShare)} />}
        <Line label={L('Taxes / withholding', 'Impuestos / retenciones')} sub={`${cfg.tax_pct}%`} value={M(calc.taxes)} />
        <Line label={L('Contingency (planned only)', 'Contingencia (solo plan)')} sub={`${cfg.contingency_pct}% ${L('of planned consultant cost', 'del costo planificado de consultores')}`} value={M(calc.contingency)} />
        <ExpensesList caseId={caseData.id} expenses={data.ex} lang={lang} cfg={cfg} total={calc.expenses} onChange={() => setNonce(n => n + 1)} canEdit={auth?.isAdmin || auth?.isManager} M={M} />
      </Card>

      {/* ── Totals ── */}
      <Card icon={BarChart2} title={L('Summary', 'Resumen')} right={null}>
        <Line label={L('Income', 'Ingresos')} value={M(calc.incomeBasis)} strong />
        <Line label={L('Planned costs', 'Costos planificados')} value={M(calc.costsPlanned)} />
        <Line label={L('Planned margin', 'Margen planificado')} value={<>{M(calc.marginPlanned)} <span className="text-[11px]">({pct(calc.marginPlanned, calc.incomeBasis)})</span></>} strong tone={calc.marginPlanned >= 0 ? 'pos' : 'neg'} />
        <div className="border-t border-gray-100 dark:border-white/10 my-2" />
        <Line label={L('Costs to date', 'Costos a la fecha')} value={M(calc.costsActual)} />
        <Line label={L('Margin to date', 'Margen a la fecha')} value={<>{M(calc.marginActual)} <span className="text-[11px]">({pct(calc.marginActual, calc.incomeBasis)})</span></>} strong tone={calc.marginActual >= 0 ? 'pos' : 'neg'} />
      </Card>
    </div>
  );
}

function ExpensesList({ caseId, expenses, lang, cfg, total, onChange, canEdit, M }) {
  const L = (en, es) => (lang === 'es' ? es : en);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ category: 'other', description: '', amount: '', currency: 'USD', expense_date: new Date().toISOString().slice(0, 10) });
  async function add() {
    const amount = Number(f.amount);
    if (!amount) return;
    const { error } = await supabase.from('case_expenses').insert({ case_id: caseId, ...f, amount });
    if (error) { alert(error.message); return; }
    setAdding(false); setF(p => ({ ...p, description: '', amount: '' })); onChange();
  }
  async function archive(id) {
    const { error } = await supabase.from('case_expenses').update({ archived: true }).eq('id', id);
    if (error) alert(error.message); else onChange();
  }
  const cats = EXPENSE_CATEGORIES[lang] ?? EXPENSE_CATEGORIES.en;
  return (
    <div className="mt-2">
      <Line label={L('Expenses', 'Gastos')} value={M(total)} />
      {expenses.map(e => (
        <div key={e.id} className="flex items-center gap-2 pl-3 text-xs text-gray-500 py-0.5">
          <span className="flex-1 truncate">{e.expense_date} · {cats[e.category] ?? e.category}{e.description ? ` — ${e.description}` : ''}</span>
          <span className="tabular-nums">{fmtMoney(Number(e.amount), e.currency, lang)}</span>
          {canEdit && <button onClick={() => archive(e.id)} className="text-gray-300 hover:text-red-500" title={L('Remove', 'Quitar')}><X size={12} /></button>}
        </div>
      ))}
      {canEdit && !adding && (
        <button onClick={() => setAdding(true)} className="mt-1 flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"><Plus size={12} />{L('Add expense', 'Agregar gasto')}</button>
      )}
      {adding && (
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2 items-center">
          <select value={f.category} onChange={e => setF(p => ({ ...p, category: e.target.value }))} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white">
            {Object.entries(cats).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input value={f.description} onChange={e => setF(p => ({ ...p, description: e.target.value }))} placeholder={L('Description', 'Descripción')} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs sm:col-span-2" />
          <input type="number" value={f.amount} onChange={e => setF(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
          <div className="flex gap-1">
            <select value={f.currency} onChange={e => setF(p => ({ ...p, currency: e.target.value }))} className="border border-gray-200 rounded-lg px-1 py-1.5 text-xs bg-white">
              {['USD', ...Object.keys(cfg.fx_rates ?? {})].map(c => <option key={c}>{c}</option>)}
            </select>
            <button onClick={add} className="px-2 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold">OK</button>
            <button onClick={() => setAdding(false)} className="px-1 text-gray-400"><X size={12} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
