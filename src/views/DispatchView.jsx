import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";

const PRIORITY_COLORS = {
  critical: "bg-red-100 text-red-700",
  high:     "bg-orange-100 text-orange-700",
  medium:   "bg-yellow-100 text-yellow-700",
  low:      "bg-green-100 text-green-700",
};

function AssignModal({ caseRow, onClose, onAssigned }) {
  const [leaders, setLeaders]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    async function load() {
      const { data: areaRows } = await supabase
        .from("area_leader_areas")
        .select("user_id, users(id, full_name)")
        .eq("area_sap", caseRow.area_sap);

      if (!areaRows?.length) { setLoading(false); return; }

      const leaderIds = areaRows.map(r => r.user_id);
      const { data: loadRows } = await supabase
        .from("cases")
        .select("area_leader_id")
        .in("area_leader_id", leaderIds)
        .not("status", "in", '("completed","cancelled")');

      const loadMap = {};
      (loadRows ?? []).forEach(r => {
        loadMap[r.area_leader_id] = (loadMap[r.area_leader_id] ?? 0) + 1;
      });

      setLeaders(
        areaRows.map(r => ({
          id:        r.users.id,
          full_name: r.users.full_name,
          load:      loadMap[r.users.id] ?? 0,
        })).sort((a, b) => a.load - b.load)
      );
      setLoading(false);
    }
    load();
  }, [caseRow.area_sap]);

  async function handleConfirm() {
    if (!selected) return;
    setSaving(true);
    const { error } = await supabase
      .from("cases")
      .update({ area_leader_id: selected })
      .eq("id", caseRow.id);
    setSaving(false);
    if (!error) onAssigned();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Assign Area Leader</h3>
        <p className="text-sm text-gray-500 mb-4">
          Case: <span className="font-medium text-gray-700">{caseRow.title}</span>
          {caseRow.area_sap && <> · <span className="text-blue-600">{caseRow.area_sap}</span></>}
        </p>

        {loading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading leaders…</p>
        ) : leaders.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No area leaders cover this SAP area.</p>
        ) : (
          <div className="space-y-2 mb-6">
            {leaders.map(l => (
              <label key={l.id}
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${
                  selected === l.id
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input type="radio" name="leader" value={l.id}
                    checked={selected === l.id}
                    onChange={() => setSelected(l.id)}
                    className="accent-blue-600" />
                  <span className="text-sm font-medium text-gray-800">{l.full_name}</span>
                </div>
                <span className="text-xs text-gray-500">{l.load} active case{l.load !== 1 ? "s" : ""}</span>
              </label>
            ))}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={!selected || saving}
            className="px-4 py-2 text-sm rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Assigning…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DispatchView({ auth }) {
  const [cases, setCases]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modalCase, setModalCase] = useState(null);

  async function fetchCases() {
    setLoading(true);
    const { data } = await supabase
      .from("cases")
      .select("id, title, area_sap, created_at, priority, status, users!cases_client_id_fkey(full_name)")
      .is("area_leader_id", null)
      .not("status", "in", '("completed","cancelled")')
      .order("created_at", { ascending: false });
    setCases(data ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchCases(); }, []);

  function handleAssigned() {
    setModalCase(null);
    fetchCases();
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dispatch Queue</h1>
        <p className="text-sm text-gray-500 mt-1">Cases awaiting area leader assignment</p>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
      ) : cases.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <p className="text-gray-400 text-sm">No unassigned cases — queue is clear.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-semibold">Title</th>
                <th className="text-left px-4 py-3 font-semibold">Client</th>
                <th className="text-left px-4 py-3 font-semibold">SAP Area</th>
                <th className="text-left px-4 py-3 font-semibold">Created</th>
                <th className="text-left px-4 py-3 font-semibold">Priority</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cases.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.title}</td>
                  <td className="px-4 py-3 text-gray-600">{c.users?.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{c.area_sap ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {c.priority && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[c.priority] ?? "bg-gray-100 text-gray-600"}`}>
                        {c.priority}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setModalCase(c)}
                      className="px-3 py-1.5 text-xs font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      Assign Leader
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalCase && (
        <AssignModal
          caseRow={modalCase}
          onClose={() => setModalCase(null)}
          onAssigned={handleAssigned}
        />
      )}
    </div>
  );
}
