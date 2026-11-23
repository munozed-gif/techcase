/**
 * Supabase Edge Function — Send Queued Emails
 *
 * Sends the rows waiting in public.email_outbox (e.g. SLA alerts) through Resend, with the Arena
 * branded template. Called every minute by the pg_cron job "send-queued-emails" when mail is
 * waiting. Takes no input: calling it only processes what the database already queued, so it needs
 * no caller authentication. It uses the service role to claim rows and record the result
 * (retries: up to 3 attempts with back-off, then "failed").
 *
 * Secrets: RESEND_API_KEY, RESEND_FROM_EMAIL, RESEND_FROM_NAME (same as send-email).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

const LOGO = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cmFkaWFsR3JhZGllbnQgaWQ9Im9nIiBjeD0iMzYlIiBjeT0iMzMlIiByPSI3OCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiM0RjZFRjciLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiMwRDFGM0MiLz48L3JhZGlhbEdyYWRpZW50PjwvZGVmcz48Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSIzOSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNEY2RUY3IiBzdHJva2Utb3BhY2l0eT0iMC4xOCIgc3Ryb2tlLXdpZHRoPSIxIi8+PGNpcmNsZSBjeD0iNDAiIGN5PSI0MCIgcj0iMjgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzRGNkVGNyIgc3Ryb2tlLW9wYWNpdHk9IjAuMzUiIHN0cm9rZS13aWR0aD0iMSIvPjxjaXJjbGUgY3g9IjQwIiBjeT0iNDAiIHI9IjEzIiBmaWxsPSJ1cmwoI29nKSIvPjx0ZXh0IHg9IjQwIiB5PSI0NiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsLHNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSI4MDAiIGZvbnQtc2l6ZT0iMTYiIGZpbGw9IiNmZmZmZmYiPkE8L3RleHQ+PGNpcmNsZSBjeD0iNDAiIGN5PSIxLjUiIHI9IjMiIGZpbGw9IiM0RjZFRjciLz48Y2lyY2xlIGN4PSIxMyIgY3k9IjY0IiByPSIyLjIiIGZpbGw9IiM4MThjZjgiIG9wYWNpdHk9IjAuOCIvPjxjaXJjbGUgY3g9IjY4IiBjeT0iMTgiIHI9IjIuNSIgZmlsbD0iIzYzNjZmMSIvPjwvc3ZnPg==";

function buildEmailHtml(title: string, bodyHtml: string, ctaText = "", ctaUrl = ""): string {
  const cta = ctaText && ctaUrl
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 20px"><tr><td align="center">
         <a href="${ctaUrl}" style="display:inline-block;background:#4F6EF7;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;font-family:'Plus Jakarta Sans',Arial,sans-serif">${ctaText}</a>
       </td></tr></table>`
    : "";
  return `<!DOCTYPE html>
<html lang="en" style="color-scheme:dark"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${title}</title>
<style>:root { color-scheme: dark; } body { background-color: #0B0F1A !important; }</style></head>
<body style="margin:0;padding:0;background:#0B0F1A !important;font-family:'Plus Jakarta Sans',Arial,sans-serif;color-scheme:dark">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0B0F1A;min-height:100vh"><tr><td align="center" style="padding:40px 16px">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin-bottom:28px">
    <tr><td align="center" style="padding-bottom:10px"><img src="${LOGO}" width="72" height="72" alt="Arena" style="display:block;margin:0 auto"></td></tr>
    <tr><td align="center"><span style="font-size:26px;font-weight:800;color:#4F6EF7;letter-spacing:-0.04em">Arena</span>
      <span style="font-size:14px;font-weight:600;color:#94a3b8;margin-left:6px;vertical-align:middle">Solutions Platform</span></td></tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0f1826;border-radius:18px;border:1px solid rgba(79,110,247,0.25);overflow:hidden">
    <tr><td style="background:linear-gradient(90deg,#4F6EF7 0%,#3b55d4 100%);height:4px;font-size:0;line-height:0">&nbsp;</td></tr>
    <tr><td style="padding:36px 36px 28px">
      <h1 style="margin:0 0 20px;font-size:22px;font-weight:800;color:#f1f5f9;line-height:1.3">${title}</h1>
      <div style="font-size:15px;line-height:1.7;color:#94a3b8">${bodyHtml}</div>
      ${cta}
    </td></tr>
    <tr><td style="background:#080d16;border-top:1px solid rgba(79,110,247,0.15);padding:16px 36px;text-align:center">
      <p style="margin:0;font-size:12px;color:#334155">You received this because you have an account on <span style="color:#4F6EF7">Arena Solutions Platform</span>.
      You can turn SLA emails off in Notifications → preferences.</p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

Deno.serve(async () => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = `${Deno.env.get("RESEND_FROM_NAME") ?? "Arena Solutions Platform"} <${Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@arenasolutionsplatform.com"}>`;

  const { data: rows, error } = await db.rpc("email_outbox_claim", { p_limit: 25 });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  let sent = 0, failed = 0;
  for (const r of rows ?? []) {
    try {
      if (!apiKey) throw new Error("RESEND_API_KEY not configured");
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [r.to_email], subject: r.subject, html: buildEmailHtml(r.title ?? r.subject, r.body_html, r.cta_text ?? "", r.cta_url ?? "") }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `Resend error ${res.status}`);
      await db.rpc("email_outbox_result", { p_id: r.id, p_ok: true, p_error: null, p_provider_id: data?.id ?? null });
      sent++;
    } catch (e) {
      await db.rpc("email_outbox_result", { p_id: r.id, p_ok: false, p_error: String((e as Error).message ?? e), p_provider_id: null });
      failed++;
    }
  }
  return new Response(JSON.stringify({ claimed: rows?.length ?? 0, sent, failed }), { headers: { "Content-Type": "application/json" } });
});
