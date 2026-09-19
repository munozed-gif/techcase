import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";

const STATUS_COLORS = {
  open:        "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  review:      "bg-purple-100 text-purple-700",
  completed:   "bg-green-100 text-green-700",
  cancelled:   "bg-gray-100 text-gray-500",
};

const PRIORITY_COLORS = {
  critical: "bg-red-100 text-red-700",
  high:     "bg-orange-100 text-orange-700",
  medium:   "bg-yellow-100 text-yellow-700",
  low:      "bg-green-100 text-green-700",
};

export default function AreaLeaderView({ auth, onNav }) {
  const [cases, setCases]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const uid = auth.user?.id;
      if (!uid) return;

      const { data: areaRows } = await supabase
        .from("area_leader_areas")
        .select("area_sap")
        .eq("user_id", uid);

      const coveredAreas = (areaRows ?? []).map(r => r.area_sap);

      const queries = [
        supabase
          .from("cases")
          .select("id, title, area_sap, status, priority, users!cases_client_id_fkey(full_name)")
          .eq("area_leader_id", uid),
      ];

      if (coveredAreas.length > 0) {
        queries.push(
          supabase
            .from("cases")
            .select("id, title, area_sap, status, priority, users!cases_client_id_fkey(full_name)")
            .in("area_sap", coveredAreas)
            .is("area_leader_id", null)
        );
      }

      const results = await Promise.all(queries);
      const all = results.flatMap(r => r.data ?? []);
      const seen = new Set();
      setCases(all.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; }));
      setLoading(false);
    }
    load();
  }, [auth.user?.id]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Area Cases</h1>
        <p className="text-sm text-gray-500 mt-1">Cases assigned to you or unassigned in your covered areas</p>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
      ) : cases.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <p className="text-gray-400 text-sm">No cases found in your areas.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-semibold">Title</th>
                <th className="text-left px-4 py-3 font-semibold">Client</th>
                <th className="text-left px-4 py-3 font-semibold">SAP Area</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-left px-4 py-3 font-semibold">Priority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cases.map(c => (
                <tr key={c.id}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => onNav("cases")}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{c.title}</td>
                  <td className="px-4 py-3 text-gray-600">{c.users?.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{c.area_sap ?? "—"}</td>
                  <td className="px-4 py-3">
                    {c.status && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {c.status.replace("_", " ")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.priority && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[c.priority] ?? "bg-gray-100 text-gray-600"}`}>
                        {c.priority}
                      </span>
                    )}
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
