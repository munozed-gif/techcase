import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase.js";
import { notify, notifyManagers, notifyCaseParticipants, buildEmailHtml, sendEmailToUser, sendEmailToManagers } from "../lib/utils.js";
import { LIFECYCLE_PRESETS } from "../lib/businessConstants.js";

// useLifecycleTemplates, runStartDateMonitor, useStartDateMonitor, runDueDateMonitor

function useLifecycleTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loadingTmpl, setLoadingTmpl] = useState(true);

  async function fetchTemplates() {
    setLoadingTmpl(true);
    const { data } = await supabase.from("lifecycle_templates")
      .select("*").eq("is_active", true).order("sort_order");
    setTemplates(data ?? []);
    setLoadingTmpl(false);
  }

  useEffect(() => { fetchTemplates(); }, []);

  function getTemplateStages(preset) {
    const tmpl = templates.find(t => t.key === preset);
    if (tmpl) return tmpl.stages;
    return LIFECYCLE_PRESETS[preset]?.stages ?? LIFECYCLE_PRESETS.standard.stages;
  }

  return { templates, loadingTmpl, fetchTemplates, getTemplateStages };
}

async function runStartDateMonitor(auth, cases) {
  const todayMs = Date.now();
  const todayStr = new Date().toISOString().slice(0, 10);
  const assignedWithStart = cases.filter(c => c.status === "assigned" && c.start_date);
  if (!assignedWithStart.length) return;

  const clientIds = [...new Set(assignedWithStart.map(c => c.client_id).filter(Boolean))];
  const settingsMap = {};
  if (clientIds.length) {
    try {
      const { data } = await supabase.from("client_profiles")
        .select("id, assignment_settings").in("id", clientIds);
      (data ?? []).forEach(cp => { settingsMap[cp.id] = cp.assignment_settings ?? {}; });
    } catch (_) {}
  }
  const SD = {
    start_reminders_enabled: true, start_reminder_1_days: 3, start_reminder_2_days: 1,
    start_overdue_action: "auto_start", start_overdue_grace_hours: 24,
  };

  for (const c of assignedWithStart) {
    const s = { ...SD, ...(settingsMap[c.client_id] ?? {}) };
    if (!s.start_reminders_enabled) continue;
    const startMs = new Date(c.start_date + "T00:00:00").getTime();
    const daysUntil = Math.ceil((startMs - todayMs) / 86400000);
    const hoursOverdue = daysUntil <= 0 ? (todayMs - startMs) / 3600000 : 0;
    const consultants = (c.case_assignments ?? []).map(a => a.consultant_id).filter(Boolean);

    if (daysUntil <= s.start_reminder_1_days && daysUntil > s.start_reminder_2_days) {
      const key = `sdrem1_${c.id}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, todayStr);
        const msg1 = `"${c.title}" starts in ${daysUntil} day${daysUntil !== 1 ? "s" : ""} (${c.start_date}). Please be ready to begin on time.`;
        for (const uid of consultants) {
          await notify(uid, "Case Starting Soon", msg1);
          sendEmailToUser(uid, `Case Starting in ${daysUntil} Day${daysUntil !== 1 ? 's' : ''}`, buildEmailHtml({
            title: `Case Starting Soon`,
            preheader: `"${c.title}" starts in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`,
            bodyHtml: `<p>${msg1}</p>`,
            ctaText: 'View Case',
            ctaUrl: window.location.origin,
          }));
        }
      }
    }

    if (daysUntil <= s.start_reminder_2_days && daysUntil > 0) {
      const key = `sdrem2_${c.id}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, todayStr);
        const title2 = daysUntil === 1 ? "Case Starts Tomorrow" : "Case Starting Today";
        const msg2 = `"${c.title}" must start by ${c.start_date}. If not started in time it may be auto-progressed or reassigned.`;
        for (const uid of consultants) {
          await notify(uid, title2, msg2);
          sendEmailToUser(uid, title2, buildEmailHtml({
            title: title2,
            preheader: msg2,
            bodyHtml: `<p>${msg2}</p>`,
            ctaText: 'View Case',
            ctaUrl: window.location.origin,
          }));
        }
        await notifyManagers("Case Starting Soon",
          `"${c.title}" is set to begin in ${daysUntil} day${daysUntil !== 1 ? "s" : ""}. Current status: Assigned.`);
        sendEmailToManagers("Case Starting Soon", buildEmailHtml({
          title: "Case Starting Soon",
          preheader: `"${c.title}" starts in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`,
          bodyHtml: `<p>"${c.title}" is set to begin in ${daysUntil} day${daysUntil !== 1 ? 's' : ''} (${c.start_date}). Current status: Assigned.</p>`,
          ctaText: 'View Case',
          ctaUrl: window.location.origin,
        }));
      }
    }

    if (daysUntil < 0 && hoursOverdue >= s.start_overdue_grace_hours && (auth.isAdmin || auth.isManager)) {
      const key = `sdovr_${c.id}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, todayStr);
        const daysLate = Math.floor(hoursOverdue / 24);
        if (s.start_overdue_action === "auto_start") {
          await supabase.from("cases").update({ status: "in_progress" }).eq("id", c.id);
          for (const uid of consultants)
            await notify(uid, "Case Auto-Started", `"${c.title}" was automatically moved to In Progress as the start date has passed.`);
          await notifyManagers("Case Auto-Started", `"${c.title}" was automatically moved to In Progress — start date ${c.start_date} has passed.`);
        } else if (s.start_overdue_action === "auto_unassign") {
          await supabase.from("case_assignments").delete().eq("case_id", c.id);
          await supabase.from("cases").update({ status: "open" }).eq("id", c.id);
          for (const uid of consultants)
            await notify(uid, "Assignment Removed", `Your assignment to "${c.title}" was removed — work was not started by the planned date (${c.start_date}).`);
          await notifyManagers("Case Unassigned", `"${c.title}" was unassigned — consultant did not start by ${c.start_date}.`);
        } else {
          await notifyManagers("Case Start Overdue",
            `"${c.title}" is ${daysLate} day${daysLate !== 1 ? "s" : ""} overdue. Still in Assigned status.`);
        }
      }
    }
  }
}

function useStartDateMonitor(auth, cases) {
  const fired = useRef(false);
  useEffect(() => {
    if (!auth?.user?.id || !cases.length || fired.current) return;
    fired.current = true;
    runStartDateMonitor(auth, cases);
    runDueDateMonitor(cases);
  }, [auth?.user?.id, cases.length]);
}

async function runDueDateMonitor(cases) {
  const todayMs = Date.now();
  const TERMINAL = ["completed","cancelled","terminated","closed","approved"];
  const active = cases.filter(c => c.due_date && !TERMINAL.includes(c.status));
  for (const c of active) {
    const dueMs = new Date(c.due_date + "T00:00:00").getTime();
    const daysLeft = Math.ceil((dueMs - todayMs) / 86400000);
    const lsKey3 = `duerem3_${c.id}`, lsKey1 = `duerem1_${c.id}`;
    if (daysLeft === 3 && !localStorage.getItem(lsKey3)) {
      localStorage.setItem(lsKey3, "1");
      notifyCaseParticipants(c.id, null, "Due date in 3 days", `"${c.title}" is due on ${c.due_date} — 3 days remaining.`, { case_id: c.id, event_type: "due_date" });
      notifyManagers("Due date approaching", `"${c.title}" is due in 3 days (${c.due_date}).`);
    }
    if (daysLeft <= 1 && daysLeft >= 0 && !localStorage.getItem(lsKey1)) {
      localStorage.setItem(lsKey1, "1");
      const when = daysLeft === 0 ? "today" : "tomorrow";
      notifyCaseParticipants(c.id, null, `Due date ${when}`, `"${c.title}" is due ${when} (${c.due_date}).`, { case_id: c.id, event_type: "due_date" });
      notifyManagers("Due date urgent", `"${c.title}" is due ${when} (${c.due_date}) and is still in progress.`);
    }
    if (daysLeft < 0 && !localStorage.getItem(`dueoverdue_${c.id}`)) {
      localStorage.setItem(`dueoverdue_${c.id}`, "1");
      notifyManagers("Case overdue", `"${c.title}" passed its due date (${c.due_date}) and is still open.`);
      sendEmailToManagers("Case Overdue", buildEmailHtml({
        title: "Case Overdue",
        preheader: `"${c.title}" has passed its due date`,
        bodyHtml: `<p>"${c.title}" passed its due date (${c.due_date}) and is still open. Immediate review may be required.</p>`,
        ctaText: 'View Case',
        ctaUrl: window.location.origin,
      }));
    }
  }
}

export {
  useLifecycleTemplates,
  runStartDateMonitor,
  useStartDateMonitor,
  runDueDateMonitor,
};
