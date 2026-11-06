/**
 * Supabase Edge Function — Send Email
 *
 * General-purpose transactional email sender using the Arena Solutions Platform
 * branded template (same design as auth-email-hook).
 *
 * Accepts two calling conventions:
 *
 *   Structured (preferred — template built here):
 *     { to, subject, title, bodyHtml, ctaText?, ctaUrl?, footerNote? }
 *
 *   Legacy (pre-built HTML passed from client):
 *     { to, subject, html, text? }
 *
 * Required secrets (Edge Functions → Secrets):
 *   RESEND_API_KEY       — your Resend API key
 *   RESEND_FROM_EMAIL    — e.g. noreply@arenasolutionsplatform.com
 *   RESEND_FROM_NAME     — e.g. Arena Solutions Platform
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Branded email template — matches Arena Solutions Platform auth-email-hook ──
function buildEmailHtml({
  title,
  bodyHtml,
  ctaText = "",
  ctaUrl = "",
  footerNote = "",
}: {
  title: string;
  bodyHtml: string;
  ctaText?: string;
  ctaUrl?: string;
  footerNote?: string;
}): string {
  const cta =
    ctaText && ctaUrl
      ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 20px">
           <tr><td align="center">
             <a href="${ctaUrl}" style="display:inline-block;background:#4F6EF7;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.01em;font-family:'Plus Jakarta Sans',Arial,sans-serif">${ctaText}</a>
           </td></tr>
         </table>`
      : "";
  const footer = footerNote
    ? `<p style="font-size:12px;color:#4a5568;margin:20px 0 0;line-height:1.6;text-align:center">${footerNote}</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="en" style="color-scheme:dark">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${title}</title>
<style>
:root { color-scheme: dark; }
body { background-color: #0B0F1A !important; }
</style>
</head>
<body style="margin:0;padding:0;background:#0B0F1A !important;font-family:'Plus Jakarta Sans',Arial,sans-serif;color-scheme:dark">
<!--[if mso]><table width="100%" bgcolor="#0B0F1A" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0B0F1A;min-height:100vh">
  <tr><td align="center" style="padding:40px 16px">

    <!-- Logo row -->
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin-bottom:28px">
      <tr><td align="center" style="padding-bottom:10px">
        <img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cmFkaWFsR3JhZGllbnQgaWQ9Im9nIiBjeD0iMzYlIiBjeT0iMzMlIiByPSI3OCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiM0RjZFRjciLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiMwRDFGM0MiLz48L3JhZGlhbEdyYWRpZW50PjwvZGVmcz48Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSIzOSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNEY2RUY3IiBzdHJva2Utb3BhY2l0eT0iMC4xOCIgc3Ryb2tlLXdpZHRoPSIxIi8+PGNpcmNsZSBjeD0iNDAiIGN5PSI0MCIgcj0iMjgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzRGNkVGNyIgc3Ryb2tlLW9wYWNpdHk9IjAuMzUiIHN0cm9rZS13aWR0aD0iMSIvPjxjaXJjbGUgY3g9IjQwIiBjeT0iNDAiIHI9IjEzIiBmaWxsPSJ1cmwoI29nKSIvPjx0ZXh0IHg9IjQwIiB5PSI0NiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsLHNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSI4MDAiIGZvbnQtc2l6ZT0iMTYiIGZpbGw9IiNmZmZmZmYiPkE8L3RleHQ+PGNpcmNsZSBjeD0iNDAiIGN5PSIxLjUiIHI9IjMiIGZpbGw9IiM0RjZFRjciLz48Y2lyY2xlIGN4PSIxMyIgY3k9IjY0IiByPSIyLjIiIGZpbGw9IiM4MThjZjgiIG9wYWNpdHk9IjAuOCIvPjxjaXJjbGUgY3g9IjY4IiBjeT0iMTgiIHI9IjIuNSIgZmlsbD0iIzYzNjZmMSIvPjwvc3ZnPg==" width="72" height="72" alt="Arena" style="display:block;margin:0 auto">
      </td></tr>
      <tr><td align="center">
        <div style="display:inline-block">
          <span style="font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:26px;font-weight:800;color:#4F6EF7;letter-spacing:-0.04em">Arena</span>
          <span style="font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:14px;font-weight:600;color:#94a3b8;letter-spacing:0.01em;margin-left:6px;vertical-align:middle">Solutions Platform</span>
        </div>
      </td></tr>
    </table>

    <!-- Card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0f1826;border-radius:18px;border:1px solid rgba(79,110,247,0.25);overflow:hidden">

      <!-- Blue accent top bar -->
      <tr><td style="background:linear-gradient(90deg,#4F6EF7 0%,#3b55d4 100%);height:4px;font-size:0;line-height:0">&nbsp;</td></tr>

      <!-- Body -->
      <tr><td style="padding:36px 36px 28px">

        <!-- Title -->
        <h1 style="margin:0 0 20px;font-size:22px;font-weight:800;color:#f1f5f9;line-height:1.3;letter-spacing:-0.02em;font-family:'Plus Jakarta Sans',Arial,sans-serif">${title}</h1>

        <!-- Content -->
        <div style="font-size:15px;line-height:1.7;color:#94a3b8;font-family:'Plus Jakarta Sans',Arial,sans-serif">${bodyHtml}</div>

        ${cta}
        ${footer}

      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#080d16;border-top:1px solid rgba(79,110,247,0.15);padding:16px 36px;text-align:center">
        <p style="margin:0;font-size:12px;color:#334155;font-family:'Plus Jakarta Sans',Arial,sans-serif">
          You received this because you have an account on <span style="color:#4F6EF7">Arena Solutions Platform</span>.
        </p>
      </td></tr>

    </table>

  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</body></html>`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { to, subject, text } = body;

    if (!to || !subject) {
      return new Response(JSON.stringify({ error: "Missing required fields: to, subject" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) throw new Error("RESEND_API_KEY secret not configured in Supabase Edge Functions");

    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@arenasolutionsplatform.com";
    const fromName  = Deno.env.get("RESEND_FROM_NAME")  ?? "Arena Solutions Platform";

    // Structured call: build the branded template here
    // Legacy call: raw html passed — still wrap in branded template as body content
    let html: string;
    if (body.title && body.bodyHtml) {
      html = buildEmailHtml({
        title:      body.title,
        bodyHtml:   body.bodyHtml,
        ctaText:    body.ctaText  ?? "",
        ctaUrl:     body.ctaUrl   ?? "",
        footerNote: body.footerNote ?? "",
      });
    } else if (body.html) {
      // Legacy: caller already built the full branded HTML — use it as-is
      html = body.html;
    } else {
      return new Response(JSON.stringify({ error: "Provide either {title, bodyHtml} or {html}" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    `${fromName} <${fromEmail}>`,
        to:      Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(text ? { text } : {}),
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? `Resend error ${res.status}`);

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-email error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
