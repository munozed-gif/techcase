// Partner area: a consultant or firm asks for a Partner account (approved by an administrator),
// then manages its customers, projects, team members and plan. PartnersAdminPanel is the
// administrators' review list (Settings → Partners).
import { useEffect, useMemo, useState } from "react";
import {
  Building2, Check, CheckCircle2, Clock, CreditCard, Crown, Handshake, Layers, Mail, Pencil,
  Plus, RefreshCw, Rocket, Send, Server, Shield, ShieldAlert, UserPlus, Users, X, XCircle,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { CountrySelect, EmptyState, Input, Modal, Select, Textarea } from "../components/ui.jsx";
import { Spinner } from "../components/ProfileComponents.jsx";
import { usePartnerContext, PARTNER_LIMIT_LABELS, fmtLimit } from "../hooks/usePartnerContext.js";
import { usePlanConfig, useSystemSettings } from "../hooks/useSystemSettings.jsx";
import { SapIntegrationPanel } from "../components/SapPanels.jsx";
import { buildEmailHtml, sendEmail } from "../lib/utils.js";
import { COMMON_CURRENCIES } from "../lib/costs.js";
import { ValidationRulesEditor } from "../components/ValidationRulesPanel.jsx";
import { ServicePlansEditor } from "../components/ServicePlansEditor.jsx";
import { useT } from "../i18n/index.jsx";

const OPEN_CASE_EXCLUDED = ["completed", "closed", "cancelled", "resolved", "terminated"];
const CLOSED_PROJECT = ["cancelled", "completed", "closed", "archived"];
const STATUS_STYLE = {
  pending:   "bg-amber-100 text-amber-800",
  approved:  "bg-green-100 text-green-800",
  rejected:  "bg-red-100 text-red-700",
  suspended: "bg-gray-200 text-gray-700",
};
const CUSTOMER_ROLES = [
  { value: "admin",           label: "Customer admin" },
  { value: "project_manager", label: "Project manager" },
  { value: "key_user",        label: "Key user" },
  { value: "final_user",      label: "End user" },
  { value: "viewer",          label: "Viewer" },
];

const errText = (e) => (e?.message ?? String(e ?? "")).replace(/^.*?:\s*(?=[A-Z])/, "") || "Something went wrong";

function PlanBadge({ plan }) {
  return plan === "pro"
    ? <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800"><Crown size={12} />Pro</span>
    : <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">Free</span>;
}
function StatusBadge({ status }) {
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[status] ?? "bg-gray-100"}`}>{status}</span>;
}
function Banner({ kind = "error", children, onClose }) {
  const cls = kind === "error" ? "bg-red-50 border-red-200 text-red-800" : "bg-green-50 border-green-200 text-green-800";
  return (
    <div className={`flex items-start gap-2 border rounded-xl px-4 py-3 text-sm mb-4 ${cls}`}>
      <div className="flex-1">{children}</div>
      {onClose && <button onClick={onClose} className="opacity-60 hover:opacity-100"><X size={14} /></button>}
    </div>
  );
}

async function loadUsers(ids) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return {};
  const { data } = await supabase.from("users").select("id, full_name, email, avatar_url").in("id", uniq);
  return Object.fromEntries((data ?? []).map(u => [u.id, u]));
}

// ─── Become a Partner ───────────────────────────────────────────────────────
function RequestPartnerCard({ auth, previous, onDone }) {
  const [name, setName] = useState(previous?.name ?? auth.profile?.full_name ?? "");
  const [kind, setKind] = useState("individual");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    setBusy(true); setError(null);
    const { error } = await supabase.rpc("request_partner", { p_name: name, p_kind: kind, p_note: note || null });
    setBusy(false);
    if (error) { setError(errText(error)); return; }
    onDone();
  }

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center"><Handshake size={20} /></div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Become a Partner</h2>
            <p className="text-sm text-gray-500">Run your own customers, projects and cases on the platform.</p>
          </div>
        </div>
        <ul className="text-sm text-gray-600 space-y-1 my-4 pl-1">
          <li className="flex gap-2"><Check size={15} className="text-green-600 mt-0.5" />Create projects and cases for your own customers</li>
          <li className="flex gap-2"><Check size={15} className="text-green-600 mt-0.5" />Connect each customer's SAP systems</li>
          <li className="flex gap-2"><Check size={15} className="text-green-600 mt-0.5" />Invite your customer's users and your own team</li>
          <li className="flex gap-2"><Clock size={15} className="text-amber-600 mt-0.5" />An administrator reviews the request; you start on the Free plan</li>
        </ul>
        {previous?.status === "rejected" && (
          <Banner>Your previous request was not approved{previous.review_note ? `: ${previous.review_note}` : "."} You can send a new one.</Banner>
        )}
        {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
        <Input label="Partner name" value={name} onChange={e => setName(e.target.value)} placeholder="Your name or your company's name" />
        <Select label="Type" value={kind} onChange={e => setKind(e.target.value)}
          options={[{ value: "individual", label: "Independent consultant" }, { value: "firm", label: "Consulting firm" }]} />
        <Textarea label="Note for the reviewer (optional)" rows={3} value={note} onChange={e => setNote(e.target.value)}
          placeholder="Who are your customers, what will you use the platform for…" />
        <button onClick={submit} disabled={busy || !name.trim()}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl px-5 py-2.5 text-sm">
          <Send size={15} />{busy ? "Sending…" : "Send request"}
        </button>
      </div>
    </div>
  );
}

function PendingCard({ partner }) {
  return (
    <div className="max-w-2xl bg-white rounded-2xl border border-amber-200 p-6">
      <div className="flex items-center gap-3">
        <Clock className="text-amber-600" size={22} />
        <div>
          <h2 className="text-lg font-bold text-gray-900">Request sent — {partner.name}</h2>
          <p className="text-sm text-gray-600">An administrator will review it. You'll get a notification when it's approved.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Usage ──────────────────────────────────────────────────────────────────
function usePartnerUsage(partnerId, nonce) {
  const [usage, setUsage] = useState(null);
  useEffect(() => {
    if (!partnerId) return;
    let alive = true;
    (async () => {
      const [cu, pr, ca, me] = await Promise.all([
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).eq("archived", false),
        supabase.from("projects").select("id, status").eq("partner_id", partnerId),
        supabase.from("cases").select("id", { count: "exact", head: true }).eq("partner_id", partnerId)
          .not("status", "in", `(${OPEN_CASE_EXCLUDED.join(",")})`),
        supabase.from("partner_members").select("user_id", { count: "exact", head: true }).eq("partner_id", partnerId),
      ]);
      if (!alive) return;
      setUsage({
        maxCustomers: cu.count ?? 0,
        maxProjects: (pr.data ?? []).filter(p => !CLOSED_PROJECT.includes(p.status)).length,
        maxOpenCases: ca.count ?? 0,
        maxMembers: me.count ?? 0,
      });
    })();
    return () => { alive = false; };
  }, [partnerId, nonce]);
  return usage;
}

function UsageStrip({ limits, usage }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {["maxCustomers", "maxProjects", "maxOpenCases", "maxMembers"].map(k => {
        const meta = PARTNER_LIMIT_LABELS.find(l => l.key === k);
        const lim = limits?.[k];
        const used = usage?.[k];
        const full = lim >= 0 && used >= lim;
        return (
          <div key={k} className={`rounded-xl border p-3 bg-white ${full ? "border-amber-300" : "border-gray-200"}`}>
            <div className="text-xs text-gray-500">{meta.label}</div>
            <div className="text-lg font-bold text-gray-900">
              {used ?? "…"}<span className="text-sm font-medium text-gray-400"> / {fmtLimit(lim, "count")}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Customers ──────────────────────────────────────────────────────────────
function CustomerForm({ partnerId, initial, onSaved, onCancel }) {
  const [f, setF] = useState({
    name: initial?.name ?? "", industry: initial?.industry ?? "", website: initial?.website ?? "",
    country: initial?.country ?? "", contact_name: initial?.contact_name ?? "",
    contact_email: initial?.contact_email ?? "", contact_phone: initial?.contact_phone ?? "", notes: initial?.notes ?? "",
    currency: initial?.currency ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }));

  async function save() {
    setBusy(true); setError(null);
    const row = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === "string" ? (v.trim() || null) : v]));
    const q = initial?.id
      ? supabase.from("customers").update(row).eq("id", initial.id)
      : supabase.from("customers").insert({ ...row, partner_id: partnerId });
    const { error } = await q;
    setBusy(false);
    if (error) { setError(errText(error)); return; }
    onSaved();
  }

  return (
    <div>
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      <Input label="Customer name" value={f.name} onChange={set("name")} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
        <Input label="Industry" value={f.industry} onChange={set("industry")} />
        <CountrySelect label="Country" value={f.country} onChange={code => setF(p => ({ ...p, country: code }))} />
        <Input label="Website" value={f.website} onChange={set("website")} />
        <Input label="Contact name" value={f.contact_name} onChange={set("contact_name")} />
        <Input label="Contact email" type="email" value={f.contact_email} onChange={set("contact_email")} />
        <Input label="Contact phone" value={f.contact_phone} onChange={set("contact_phone")} />
        <Select label="Currency" value={f.currency} onChange={set("currency")}
          options={[{ value: "", label: "Platform currency (USD)" }, ...COMMON_CURRENCIES.filter(c => c !== "USD").map(c => ({ value: c, label: c }))]} />
      </div>
      <Textarea label="Notes" rows={2} value={f.notes} onChange={set("notes")} />
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-sm rounded-xl border border-gray-200">Cancel</button>
        <button onClick={save} disabled={busy || !f.name.trim()}
          className="px-4 py-2 text-sm rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function CustomerUsers({ customer, canManage, partnerName }) {
  const [members, setMembers] = useState(null);
  const [invites, setInvites] = useState([]);
  const [users, setUsers] = useState({});
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("key_user");
  const [msg, setMsg] = useState(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    (async () => {
      const [{ data: people }, { data: inv }] = await Promise.all([
        supabase.rpc("customer_people", { p_customer: customer.id }),
        canManage
          ? supabase.from("customer_invites").select("id, email, role, status, created_at").eq("customer_id", customer.id).eq("status", "pending")
          : Promise.resolve({ data: [] }),
      ]);
      setMembers((people ?? []).filter(x => x.role !== "account_owner"));
      setInvites(inv ?? []);
      setUsers(Object.fromEntries((people ?? []).map(x => [x.user_id, x])));
    })();
  }, [customer.id, nonce, canManage, customer.client_user_id]);

  async function invite() {
    setMsg(null);
    const { data, error } = await supabase.rpc("invite_customer_member", { p_customer: customer.id, p_email: email, p_role: role });
    if (error) { setMsg({ kind: "error", text: errText(error) }); return; }
    let mailed = false;
    if (data !== "linked") {
      try {
        const url = window.location.origin;
        await sendEmail(email, `You're invited to ${customer.name} on the platform`, buildEmailHtml({
          title: `Join ${customer.name}`,
          preheader: `${partnerName ?? "Your consultant"} invited you to follow ${customer.name}'s projects`,
          bodyHtml: `<p>${partnerName ?? "Your consultant"} invited you to follow the projects and cases of <b>${customer.name}</b>.</p>
                     <p>Sign up with this email address (${email}); once your account is approved you'll see ${customer.name} automatically.</p>`,
          ctaText: "Create your account", ctaUrl: url,
        }));
        mailed = true;
      } catch { /* the invitation stays valid without the email */ }
    }
    setMsg({ kind: "ok", text: data === "linked"
      ? `${email} already has an account — they now have access to ${customer.name}.`
      : `Invitation saved${mailed ? " and emailed" : ""}. When ${email} signs up with that email, they get access to ${customer.name}.` });
    setEmail(""); setNonce(n => n + 1);
  }
  async function revoke(id) {
    await supabase.from("customer_invites").update({ status: "revoked" }).eq("id", id);
    setNonce(n => n + 1);
  }
  async function changeRole(userId, newRole) {
    const { error } = await supabase.from("customer_members").update({ role: newRole }).eq("customer_id", customer.id).eq("user_id", userId);
    if (error) setMsg({ kind: "error", text: errText(error) }); else setNonce(n => n + 1);
  }

  if (!members) return <div className="text-sm text-gray-400 py-2">Loading…</div>;
  const owner = customer.client_user_id ? users[customer.client_user_id] : null;
  return (
    <div className="space-y-3">
      {msg && <Banner kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Banner>}
      <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
        {owner && (
          <div className="flex items-center justify-between px-3 py-2 text-sm">
            <span>{owner.full_name ?? owner.email} <span className="text-gray-400">· {owner.email}</span></span>
            <span className="text-xs text-gray-500">Customer account owner</span>
          </div>
        )}
        {members.map(m => (
          <div key={m.user_id} className="flex items-center justify-between px-3 py-2 text-sm gap-2">
            <span className="truncate">{users[m.user_id]?.full_name || users[m.user_id]?.email || "Unknown user"} <span className="text-gray-400">· {users[m.user_id]?.email}</span></span>
            {canManage
              ? <select value={m.role} onChange={e => changeRole(m.user_id, e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white">
                  {CUSTOMER_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              : <span className="text-xs text-gray-500">{CUSTOMER_ROLES.find(r => r.value === m.role)?.label ?? m.role}</span>}
          </div>
        ))}
        {invites.map(i => (
          <div key={i.id} className="flex items-center justify-between px-3 py-2 text-sm text-gray-500">
            <span className="flex items-center gap-2"><Mail size={13} />{i.email} · invited as {CUSTOMER_ROLES.find(r => r.value === i.role)?.label ?? i.role}</span>
            {canManage && <button onClick={() => revoke(i.id)} className="text-xs text-red-600 hover:underline">Revoke</button>}
          </div>
        ))}
        {!owner && !members.length && !invites.length && <div className="px-3 py-3 text-sm text-gray-400">No customer users yet.</div>}
      </div>
      {canManage && (
        <div className="flex flex-wrap gap-2 items-center">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@customer.com"
            className="flex-1 min-w-[180px] border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <select value={role} onChange={e => setRole(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white">
            {CUSTOMER_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <button onClick={invite} disabled={!email.includes("@")}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">
            <UserPlus size={14} />Invite
          </button>
        </div>
      )}
    </div>
  );
}

function CustomersTab({ partner, canManage, onChanged, auth }) {
  const [rows, setRows] = useState(null);
  const [sapFor, setSapFor] = useState(null);
  const [editing, setEditing] = useState(null);   // customer row or {} for new
  const [openId, setOpenId] = useState(null);
  const [nonce, setNonce] = useState(0);
  const [projectsBy, setProjectsBy] = useState({});

  useEffect(() => {
    (async () => {
      const [{ data }, { data: pr }] = await Promise.all([
        supabase.from("customers").select("*").eq("partner_id", partner.id).order("name"),
        supabase.from("projects").select("id, customer_id, status").eq("partner_id", partner.id),
      ]);
      setRows(data ?? []);
      const by = {};
      (pr ?? []).forEach(p => { if (p.customer_id) by[p.customer_id] = (by[p.customer_id] ?? 0) + 1; });
      setProjectsBy(by);
    })();
  }, [partner.id, nonce]);

  async function setArchived(c, archived) {
    await supabase.from("customers").update({ archived }).eq("id", c.id);
    setNonce(n => n + 1); onChanged();
  }

  if (!rows) return <Spinner />;
  const active = rows.filter(r => !r.archived);
  const archived = rows.filter(r => r.archived);
  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <button onClick={() => setEditing({})} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-4 py-2 text-sm">
            <Plus size={15} />New customer
          </button>
        </div>
      )}
      {!active.length && <EmptyState Icon={Building2} title="No customers yet" subtitle="Add the companies you work for, then create their projects." />}
      {active.map(c => (
        <div key={c.id} className="bg-white rounded-2xl border border-gray-200">
          <div className="flex items-center gap-3 px-5 py-4">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center"><Building2 size={18} /></div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900 truncate">{c.name}</div>
              <div className="text-xs text-gray-500 truncate">
                {[c.industry, c.country, c.contact_name, `${projectsBy[c.id] ?? 0} project(s)`].filter(Boolean).join(" · ")}
              </div>
            </div>
            <button onClick={() => setOpenId(openId === c.id ? null : c.id)} className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1">
              <Users size={13} />Users
            </button>
            <button onClick={() => setSapFor(c)} className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1">
              <Server size={13} />SAP systems
            </button>
            {canManage && <button onClick={() => setEditing(c)} className="p-1.5 text-gray-400 hover:text-gray-700"><Pencil size={14} /></button>}
            {canManage && <button onClick={() => setArchived(c, true)} className="text-xs text-gray-400 hover:text-red-600">Archive</button>}
          </div>
          {openId === c.id && (
            <div className="px-5 pb-4 border-t border-gray-100 pt-3">
              <CustomerUsers customer={c} canManage={canManage} partnerName={partner.name} />
            </div>
          )}
        </div>
      ))}
      {archived.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-500">Archived customers ({archived.length})</summary>
          <div className="mt-2 space-y-1">
            {archived.map(c => (
              <div key={c.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                <span>{c.name}</span>
                {canManage && <button onClick={() => setArchived(c, false)} className="text-xs text-blue-600 hover:underline">Restore</button>}
              </div>
            ))}
          </div>
        </details>
      )}
      <Modal open={!!sapFor} onClose={() => setSapFor(null)} title={sapFor ? `SAP systems — ${sapFor.name}` : ""} wide>
        {sapFor && (
          <div>
            <p className="text-xs text-gray-500 mb-3">
              Development / sandbox systems of this customer. Your plan allows {fmtLimit(partner.limits?.maxSapEnvs, "count").toLowerCase()} SAP environment(s) per customer
              {partner.limits?.projectVpn ? "" : "; per-project VPNs need the Pro plan"}.
            </p>
            <SapIntegrationPanel clientId={sapFor.id} auth={auth} editable={canManage} />
          </div>
        )}
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit customer" : "New customer"} wide>
        {editing && <CustomerForm partnerId={partner.id} initial={editing.id ? editing : null}
          onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); setNonce(n => n + 1); onChanged(); }} />}
      </Modal>
    </div>
  );
}

// ─── Projects ───────────────────────────────────────────────────────────────
function ProjectsTab({ partner, onNavigate }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    supabase.from("projects").select("id, name, status, customer_id, created_at, customer:customer_id(name), cases(id, status)")
      .eq("partner_id", partner.id).order("created_at", { ascending: false })
      .then(({ data }) => setRows(data ?? []));
  }, [partner.id]);
  if (!rows) return <Spinner />;
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button onClick={() => onNavigate?.("projects")} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-4 py-2 text-sm">
          <Plus size={15} />New project
        </button>
      </div>
      {!rows.length && <EmptyState Icon={Layers} title="No projects yet" subtitle="Create one from Projects → New project and pick one of your customers." />}
      {rows.map(p => {
        const open = (p.cases ?? []).filter(c => !OPEN_CASE_EXCLUDED.includes(c.status)).length;
        return (
          <button key={p.id} onClick={() => onNavigate?.("projects", { projectId: p.id })}
            className="w-full text-left flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3 hover:border-blue-300">
            <Layers size={16} className="text-blue-600" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900 truncate">{p.name}</div>
              <div className="text-xs text-gray-500">{p.customer?.name ?? "Internal (no customer)"} · {open} open / {(p.cases ?? []).length} cases</div>
            </div>
            <span className="text-xs text-gray-500 capitalize">{String(p.status ?? "").replace(/_/g, " ")}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Validations (Pro) ──────────────────────────────────────────────────────
function ValidationsTab({ partner, canManage }) {
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  useEffect(() => {
    supabase.from("customers").select("id, name").eq("partner_id", partner.id).eq("archived", false).order("name")
      .then(({ data }) => setCustomers(data ?? []));
  }, [partner.id]);
  const allowed = canManage && !!partner.limits?.validations;
  return (
    <div className="space-y-6 max-w-4xl">
      {!partner.limits?.validations && (
        <Banner>Custom validation rules are part of the Partner Pro plan. On Free, your cases follow the platform's global rules.</Banner>
      )}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <p className="font-bold text-gray-900 text-sm">Rules for all of {partner.name}</p>
        <p className="text-xs text-gray-500 mt-0.5 mb-4">Override the platform's global rules for every customer and project of this partner (Global → Partner → Customer → Project).</p>
        <ValidationRulesEditor level="partner" entityId={partner.id} canEdit={allowed} />
      </div>
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <p className="font-bold text-gray-900 text-sm">Rules for one customer</p>
        <p className="text-xs text-gray-500 mt-0.5 mb-3">Projects can override these again in the project's Validations tab.</p>
        <select value={customerId} onChange={e => setCustomerId(e.target.value)} className="mb-4 w-full sm:w-80 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
          <option value="">— Choose a customer —</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {customerId && <ValidationRulesEditor key={customerId} level="client" entityId={customerId} parentPartnerId={partner.id} canEdit={allowed} />}
      </div>
    </div>
  );
}

// ─── Members ────────────────────────────────────────────────────────────────
function MembersTab({ partner, canManage, isOwner, myId, onChanged }) {
  const [rows, setRows] = useState(null);
  const [users, setUsers] = useState({});
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [msg, setMsg] = useState(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("partner_people", { p_partner: partner.id });
      setRows(data ?? []);
      setUsers(Object.fromEntries((data ?? []).map(r => [r.user_id, r])));
    })();
  }, [partner.id, nonce]);

  async function add() {
    setMsg(null);
    const { error } = await supabase.rpc("add_partner_member", { p_partner: partner.id, p_email: email, p_role: role });
    if (error) { setMsg({ kind: "error", text: errText(error) }); return; }
    setMsg({ kind: "ok", text: `${email} added to ${partner.name}.` });
    setEmail(""); setNonce(n => n + 1); onChanged();
  }
  async function changeRole(uid, r) {
    const { error } = await supabase.from("partner_members").update({ role: r }).eq("partner_id", partner.id).eq("user_id", uid);
    if (error) setMsg({ kind: "error", text: errText(error) }); else setNonce(n => n + 1);
  }

  if (!rows) return <Spinner />;
  return (
    <div className="space-y-4 max-w-3xl">
      {msg && <Banner kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Banner>}
      <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
        {rows.map(r => (
          <div key={r.user_id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 truncate">{users[r.user_id]?.full_name || users[r.user_id]?.email || "Unknown user"}{r.user_id === myId ? " (you)" : ""}</div>
              <div className="text-xs text-gray-500 truncate">{users[r.user_id]?.email}</div>
            </div>
            {canManage && r.role !== "owner" && r.user_id !== myId
              ? <select value={r.role} onChange={e => changeRole(r.user_id, e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white">
                  <option value="admin">Admin</option><option value="member">Member</option>
                  {isOwner && <option value="owner">Owner</option>}
                </select>
              : <span className="text-xs font-semibold text-gray-600 capitalize">{r.role}</span>}
          </div>
        ))}
      </div>
      {canManage && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="text-sm font-semibold text-gray-800 mb-1">Add a team member</div>
          <p className="text-xs text-gray-500 mb-3">They need an approved account on the platform. Admins manage customers and projects; members work on the partner's cases.</p>
          <div className="flex flex-wrap gap-2">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@company.com"
              className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <select value={role} onChange={e => setRole(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white">
              <option value="member">Member</option><option value="admin">Admin</option>
            </select>
            <button onClick={add} disabled={!email.includes("@")}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">
              <UserPlus size={14} />Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Plan ───────────────────────────────────────────────────────────────────
function PlanTab({ partner, auth, canManage }) {
  const planCfg = usePlanConfig();
  const ss = useSystemSettings();
  const partnerPlans = planCfg.config?.partner ?? {};
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const proPrice = (ss.settings?.plan_prices ?? {}).partner_pro?.amount ?? partnerPlans.pro?.price ?? null;
  const priceId = (ss.settings?.stripe_price_ids ?? {}).partner_pro;

  async function upgrade() {
    setBusy(true); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/stripe-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ priceId, partnerId: partner.id, planKey: "pro", roleType: "partner",
          successUrl: `${window.location.origin}?stripe=success&plan=partner_pro`, cancelUrl: `${window.location.origin}?stripe=cancel` }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.url) throw new Error(out.error || "Checkout is not available right now");
      window.location.href = out.url;
    } catch (e) { setError(e.message); setBusy(false); }
  }

  const plans = ["free", "pro"].map(k => ({ key: k, limits: { ...(k === "pro"
    ? { maxCustomers: -1, maxProjects: -1, maxOpenCases: -1, maxMembers: 5, maxSapEnvs: -1, projectVpn: true, sapImplementation: true, validations: true, proposals: true }
    : { maxCustomers: 1, maxProjects: 1, maxOpenCases: 3, maxMembers: 1, maxSapEnvs: 1, projectVpn: false, sapImplementation: false, validations: false, proposals: true }),
    ...(partnerPlans[k] ?? {}) } }));

  return (
    <div className="max-w-3xl space-y-4">
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      <div className="grid md:grid-cols-2 gap-4">
        {plans.map(({ key, limits }) => {
          const current = partner.plan === key;
          return (
            <div key={key} className={`rounded-2xl border-2 p-5 bg-white ${current ? "border-blue-500" : "border-gray-200"}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2"><PlanBadge plan={key} />{current && <span className="text-xs text-blue-700 font-semibold">Current plan</span>}</div>
                {key === "pro" && proPrice ? <span className="text-sm font-bold text-gray-900">${proPrice}/mo</span> : null}
              </div>
              <ul className="space-y-1.5 text-sm">
                {PARTNER_LIMIT_LABELS.map(l => (
                  <li key={l.key} className="flex justify-between gap-3">
                    <span className="text-gray-600">{l.label}</span>
                    <span className={`font-semibold ${l.kind === "flag" && !limits[l.key] ? "text-gray-300" : "text-gray-900"}`}>{fmtLimit(limits[l.key], l.kind)}</span>
                  </li>
                ))}
              </ul>
              {key === "pro" && partner.plan !== "pro" && canManage && (
                priceId
                  ? <button onClick={upgrade} disabled={busy} className="mt-4 w-full inline-flex justify-center items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl px-4 py-2.5 text-sm disabled:opacity-50">
                      <Rocket size={15} />{busy ? "Opening checkout…" : "Upgrade to Pro"}
                    </button>
                  : <p className="mt-4 text-xs text-gray-500">To upgrade, contact the platform administrator.</p>
              )}
            </div>
          );
        })}
      </div>
      {partner.kind === "direct" && <p className="text-xs text-gray-500">This account was created from a customer company that works directly with the platform.</p>}
    </div>
  );
}

// ─── Partner area ───────────────────────────────────────────────────────────
// Each partner's own service-plan catalog (UE plans) used in its service proposals.
function PartnerServicePlansTab({ partner, canManage }) {
  const { lang } = useT();
  const [state, setState] = useState({ loading: true, value: null, fallback: null });
  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase.from("partners").select("service_plans").eq("id", partner.id).maybeSingle(),
      supabase.from("system_settings").select("value").eq("key", "service_plans_default").maybeSingle(),
    ]).then(([{ data: pr }, { data: st }]) => { if (alive) setState({ loading: false, value: pr?.service_plans ?? null, fallback: st?.value ?? null }); });
    return () => { alive = false; };
  }, [partner.id]);
  if (state.loading) return <Spinner />;
  return (
    <div className="space-y-3">
      {!state.value && (
        <p className="text-xs text-gray-500">{lang === "es"
          ? "Aún usas los planes por defecto de la plataforma. Ajusta tus tarifas y guarda para tener tu propio catálogo."
          : "You are using the platform's default plans. Adjust your rates and save to have your own catalog."}</p>
      )}
      <ServicePlansEditor value={state.value} fallback={state.fallback} lang={lang}
        hint={lang === "es"
          ? "Tus planes mensuales en UE (1 UE = un consultor a tiempo completo por mes) para las propuestas de servicio de tus proyectos. El cliente elige el período al aceptar."
          : "Your monthly UE plans (1 UE = one full-time consultant month) for the service proposals of your projects. The customer chooses the term when accepting."}
        onSave={async catalog => {
          if (!canManage) throw new Error(lang === "es" ? "Solo el propietario o un administrador del partner puede cambiar los planes." : "Only the partner owner or an admin can change the plans.");
          const { error } = await supabase.from("partners").update({ service_plans: catalog }).eq("id", partner.id);
          if (error) throw error;
          setState(s => ({ ...s, value: catalog }));
        }} />
    </div>
  );
}

function PartnerView({ auth, onNavigate }) {
  const ctx = usePartnerContext(auth.user?.id);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("customers");
  const [nonce, setNonce] = useState(0);

  const visible = ctx.partners.filter(p => p.status !== "rejected");
  const partner = visible.find(p => p.id === selectedId) ?? visible.find(p => p.status === "approved") ?? visible[0] ?? null;
  const usage = usePartnerUsage(partner?.status === "approved" ? partner.id : null, nonce);

  if (ctx.loading) return <Spinner />;

  const rejected = ctx.partners.find(p => p.status === "rejected");
  if (!partner) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Partner</h1>
        <RequestPartnerCard auth={auth} previous={rejected} onDone={() => ctx.refresh()} />
      </div>
    );
  }

  const canManage = partner.role === "owner" || partner.role === "admin" || auth.isAdmin || auth.isManager;
  const changed = () => { setNonce(n => n + 1); ctx.refresh(); };
  const TABS = [
    { id: "customers", label: "Customers", Icon: Building2 },
    { id: "projects",  label: "Projects",  Icon: Layers },
    { id: "members",   label: "Team",      Icon: Users },
    { id: "validations", label: "Validations", Icon: Shield },
    { id: "plan",      label: "Plan",      Icon: CreditCard },
    { id: "service_plans", label: "Service plans", Icon: Layers },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center"><Handshake size={22} /></div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{partner.name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <PlanBadge plan={partner.plan} /><StatusBadge status={partner.status} />
            <span className="text-xs text-gray-500">{partner.kind === "individual" ? "Independent consultant" : partner.kind === "firm" ? "Consulting firm" : "Direct customer"} · your role: {partner.role}</span>
          </div>
        </div>
        {visible.length > 1 && (
          <select value={partner.id} onChange={e => setSelectedId(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            {visible.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {partner.status === "pending" && <PendingCard partner={partner} />}
      {partner.status === "suspended" && (
        <Banner><span className="flex items-center gap-2"><ShieldAlert size={15} />This partner account is suspended{partner.review_note ? `: ${partner.review_note}` : ""}. Contact the platform administrator.</span></Banner>
      )}

      {partner.status === "approved" && (
        <>
          <UsageStrip limits={partner.limits} usage={usage} />
          <div className="flex border-b border-gray-200 mb-5 overflow-x-auto">
            {TABS.map(({ id, label, Icon: Ic }) => (
              <button key={id} onClick={() => setTab(id)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px ${tab === id ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                <Ic size={15} />{label}
              </button>
            ))}
          </div>
          {tab === "customers" && <CustomersTab partner={partner} canManage={canManage} onChanged={changed} auth={auth} />}
          {tab === "validations" && <ValidationsTab partner={partner} canManage={canManage} />}
          {tab === "projects"  && <ProjectsTab partner={partner} onNavigate={onNavigate} />}
          {tab === "members"   && <MembersTab partner={partner} canManage={canManage} isOwner={partner.role === "owner"} myId={auth.user?.id} onChanged={changed} />}
          {tab === "plan"      && <PlanTab partner={partner} auth={auth} canManage={canManage} />}
          {tab === "service_plans" && <PartnerServicePlansTab partner={partner} canManage={canManage} />}
        </>
      )}
    </div>
  );
}

// ─── Admin: review partners ─────────────────────────────────────────────────
function PartnersAdminPanel() {
  const [rows, setRows] = useState(null);
  const [owners, setOwners] = useState({});
  const [counts, setCounts] = useState({});
  const [filter, setFilter] = useState("pending");
  const [query, setQuery] = useState("");
  const [review, setReview] = useState(null);   // { partner, status, plan, note }
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("partners").select("*").order("created_at", { ascending: false });
      if (error) { setError(errText(error)); setRows([]); return; }
      setRows(data ?? []);
      setOwners(await loadUsers((data ?? []).map(p => p.owner_id)));
      const [{ data: cu }, { data: pr }, { data: me }] = await Promise.all([
        supabase.from("customers").select("partner_id"),
        supabase.from("projects").select("partner_id"),
        supabase.from("partner_members").select("partner_id"),
      ]);
      const c = {};
      const bump = (list, k) => (list ?? []).forEach(r => { if (!r.partner_id) return; c[r.partner_id] = c[r.partner_id] ?? { customers: 0, projects: 0, members: 0 }; c[r.partner_id][k]++; });
      bump(cu, "customers"); bump(pr, "projects"); bump(me, "members");
      setCounts(c);
    })();
  }, [nonce]);

  const shown = useMemo(() => (rows ?? []).filter(p =>
    (filter === "all" || p.status === filter) &&
    (!query || `${p.name} ${owners[p.owner_id]?.full_name ?? ""} ${owners[p.owner_id]?.email ?? ""}`.toLowerCase().includes(query.toLowerCase()))
  ), [rows, filter, query, owners]);

  async function submitReview() {
    setError(null);
    const { error } = await supabase.rpc("review_partner", {
      p_id: review.partner.id, p_status: review.status, p_plan: review.plan, p_note: review.note || null,
    });
    if (error) { setError(errText(error)); return; }
    setReview(null); setNonce(n => n + 1);
  }

  if (!rows) return <Spinner />;
  const pendingCount = rows.filter(r => r.status === "pending").length;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Partners</h2>
        <p className="text-sm text-gray-500">Consultants and firms that run their own customers on the platform. Approve requests and set each partner's plan.</p>
      </div>
      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}
      <div className="flex flex-wrap items-center gap-2">
        {["pending", "approved", "suspended", "rejected", "all"].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full border capitalize ${filter === s ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}>
            {s}{s === "pending" && pendingCount ? ` (${pendingCount})` : ""}
          </button>
        ))}
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…" className="ml-auto border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        <button onClick={() => setNonce(n => n + 1)} className="p-2 text-gray-400 hover:text-gray-700"><RefreshCw size={14} /></button>
      </div>
      {!shown.length && <EmptyState Icon={Handshake} title={filter === "pending" ? "No pending requests" : "No partners"} />}
      <div className="space-y-2">
        {shown.map(p => {
          const o = owners[p.owner_id];
          const c = counts[p.id] ?? {};
          return (
            <div key={p.id} className="bg-white rounded-2xl border border-gray-200 px-5 py-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center gap-2"><span className="font-semibold text-gray-900">{p.name}</span><PlanBadge plan={p.plan} /><StatusBadge status={p.status} /></div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {p.kind} · owner {o?.full_name ?? "—"}{o?.email ? ` (${o.email})` : ""} · {c.customers ?? 0} customers · {c.projects ?? 0} projects · {c.members ?? 0} members
                </div>
                {p.request_note && <div className="text-xs text-gray-600 mt-1 italic">“{p.request_note}”</div>}
                {p.review_note && <div className="text-xs text-gray-400 mt-1">Review note: {p.review_note}</div>}
              </div>
              {p.status === "pending" ? (
                <>
                  <button onClick={() => setReview({ partner: p, status: "approved", plan: p.plan, note: "" })}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-600 text-white"><CheckCircle2 size={13} />Approve</button>
                  <button onClick={() => setReview({ partner: p, status: "rejected", plan: p.plan, note: "" })}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-700"><XCircle size={13} />Reject</button>
                </>
              ) : (
                <button onClick={() => setReview({ partner: p, status: p.status, plan: p.plan, note: "" })}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700"><Pencil size={13} />Change</button>
              )}
            </div>
          );
        })}
      </div>
      <Modal open={!!review} onClose={() => setReview(null)} title={review ? `Review — ${review.partner.name}` : ""}>
        {review && (
          <div>
            <Select label="Status" value={review.status} onChange={e => setReview(r => ({ ...r, status: e.target.value }))}
              options={["pending", "approved", "rejected", "suspended"].map(s => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} />
            <Select label="Plan" value={review.plan} onChange={e => setReview(r => ({ ...r, plan: e.target.value }))}
              options={[{ value: "free", label: "Free" }, { value: "pro", label: "Pro" }]} />
            <Textarea label="Note to the partner (optional)" rows={2} value={review.note} onChange={e => setReview(r => ({ ...r, note: e.target.value }))} />
            <div className="flex justify-end gap-2">
              <button onClick={() => setReview(null)} className="px-4 py-2 text-sm rounded-xl border border-gray-200">Cancel</button>
              <button onClick={submitReview} className="px-4 py-2 text-sm rounded-xl bg-blue-600 text-white font-semibold">Save</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export { PartnerView, PartnersAdminPanel, PlanBadge };
