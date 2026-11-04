/**
 * Supabase Auth Hook — Send Email
 *
 * Intercepts every Supabase auth email (signup OTP, password reset,
 * magic link, email change) and re-sends it via Resend with the
 * Arena Solutions Platform branded HTML template.
 *
 * Register this in Supabase Dashboard:
 *   Authentication → Hooks → Send Email → HTTP endpoint
 *   URL: https://<project-ref>.supabase.co/functions/v1/auth-email-hook
 *
 * Required secrets (Edge Functions → Secrets):
 *   RESEND_API_KEY       — your Resend API key
 *   RESEND_FROM_EMAIL    — e.g. noreply@arenasolutionsplatform.com
 *   RESEND_FROM_NAME     — e.g. Arena Solutions Platform
 *   HOOK_SECRET          — the secret shown after saving the hook in the dashboard
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Branded email template — matches Arena Solutions Platform login screen ────
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

// ── OTP code block helper ─────────────────────────────────────────────────────
function otpBlock(token: string): string {
  return `<div style="margin:24px 0;text-align:center">
    <div style="display:inline-block;background:#0d1424;border:1px solid rgba(79,110,247,0.5);border-radius:12px;padding:18px 36px">
      <span style="font-size:34px;font-weight:800;letter-spacing:10px;color:#4F6EF7;font-family:'Courier New',monospace">${token}</span>
    </div>
    <p style="margin:12px 0 0;font-size:13px;color:#475569">This code expires in 10 minutes.</p>
  </div>`;
}

// ── Build subject + HTML per auth event type ──────────────────────────────────
function buildEmail(
  actionType: string,
  emailData: Record<string, string>,
  userName: string,
  supabaseUrl: string,
): { subject: string; html: string } {
  const redirectTo = emailData.redirect_to ?? supabaseUrl;
  const tokenHash = emailData.token_hash ?? "";
  const token = emailData.token ?? "";
  const name = userName || "there";

  // Confirmation URL for link-based flows
  const confirmUrl = tokenHash
    ? `${supabaseUrl}/auth/v1/verify?token=${tokenHash}&type=${actionType}&redirect_to=${encodeURIComponent(redirectTo)}`
    : redirectTo;

  switch (actionType) {
    case "signup":
      return {
        subject: "Your Arena Solutions Platform verification code",
        html: buildEmailHtml({
          title: "Verify your email",
          bodyHtml: `<p style="margin:0 0 12px;color:#cbd5e1">Hi ${name},</p>
            <p style="margin:0 0 20px;color:#94a3b8">Enter the code below on the signup screen to verify your email address.</p>
            ${token ? otpBlock(token) : ""}
            <p style="margin:0 0 4px;color:#94a3b8">Or click the button below to verify directly:</p>`,
          ctaText: "Verify Email Address",
          ctaUrl: confirmUrl,
          footerNote: "If you didn't create an account, you can safely ignore this email.",
        }),
      };

    case "recovery":
      return {
        subject: "Reset your Arena Solutions Platform password",
        html: buildEmailHtml({
          title: "Reset your password",
          bodyHtml: `<p style="margin:0 0 12px;color:#cbd5e1">Hi ${name},</p>
            <p style="margin:0 0 12px;color:#94a3b8">We received a request to reset the password for your account. Click the button below to choose a new password.</p>
            <p style="margin:0;font-size:13px;color:#475569">This link expires in 24 hours and can only be used once.</p>`,
          ctaText: "Reset Password",
          ctaUrl: confirmUrl,
          footerNote: "If you didn't request a password reset, you can safely ignore this email — your password will not change.",
        }),
      };

    case "magiclink":
      return {
        subject: "Your Arena Solutions Platform sign-in link",
        html: buildEmailHtml({
          title: "Sign in to Arena",
          bodyHtml: `<p style="margin:0 0 12px;color:#cbd5e1">Hi ${name},</p>
            <p style="margin:0 0 12px;color:#94a3b8">Click the button below to sign in to Arena Solutions Platform.</p>
            <p style="margin:0;font-size:13px;color:#475569">This link expires in 10 minutes and can only be used once.</p>`,
          ctaText: "Sign In Now",
          ctaUrl: confirmUrl,
          footerNote: "If you didn't request this link, you can safely ignore this email.",
        }),
      };

    case "email_change":
    case "email_change_new":
      return {
        subject: "Confirm your new email address",
        html: buildEmailHtml({
          title: "Confirm email change",
          bodyHtml: `<p style="margin:0 0 12px;color:#cbd5e1">Hi ${name},</p>
            <p style="margin:0 0 12px;color:#94a3b8">Click the button below to confirm your new email address.</p>
            <p style="margin:0;font-size:13px;color:#475569">This link expires in 24 hours.</p>`,
          ctaText: "Confirm New Email",
          ctaUrl: confirmUrl,
          footerNote: "If you didn't request this change, please contact support immediately.",
        }),
      };

    case "invite":
      return {
        subject: "You've been invited to Arena Solutions Platform",
        html: buildEmailHtml({
          title: "You're invited",
          bodyHtml: `<p style="margin:0 0 12px;color:#cbd5e1">Hi ${name},</p>
            <p style="margin:0 0 12px;color:#94a3b8">You've been invited to join Arena Solutions Platform. Click the button below to accept your invitation and set up your account.</p>`,
          ctaText: "Accept Invitation",
          ctaUrl: confirmUrl,
          footerNote: "If you weren't expecting this invitation, you can safely ignore this email.",
        }),
      };

    default:
      return {
        subject: "Arena Solutions Platform — action required",
        html: buildEmailHtml({
          title: "Action required",
          bodyHtml: `<p style="margin:0 0 12px;color:#cbd5e1">Hi ${name},</p><p style="margin:0;color:#94a3b8">Please click the button below to continue.</p>`,
          ctaText: "Continue",
          ctaUrl: confirmUrl,
        }),
      };
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Verify hook secret — Supabase signs requests as HS256 JWT
  // Secret format from dashboard: "v1,whsec_<base64>" — strip prefix and decode
  const hookSecret = Deno.env.get("HOOK_SECRET");
  if (hookSecret) {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { "Content-Type": "application/json" },
      });
    }
    try {
      const [headerB64, payloadB64, sigB64] = token.split(".");
      const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
      // Strip the "v1,whsec_" prefix Supabase prepends, then base64-decode
      const rawSecret = hookSecret.startsWith("v1,whsec_")
        ? hookSecret.slice("v1,whsec_".length)
        : hookSecret;
      const keyBytes = Uint8Array.from(atob(rawSecret), c => c.charCodeAt(0));
      const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
      const sig = Uint8Array.from(atob(sigB64.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
      const valid = await crypto.subtle.verify("HMAC", key, sig, data);
      if (!valid) throw new Error("invalid signature");
    } catch {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { "Content-Type": "application/json" },
      });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const user = (payload.user ?? {}) as Record<string, unknown>;
  const emailData = (payload.email_data ?? {}) as Record<string, string>;

  const toEmail = user.email as string;
  const actionType = emailData.email_action_type ?? "signup";
  const userMeta = (user.user_metadata ?? {}) as Record<string, string>;
  const userName = userMeta.full_name ?? userMeta.name ?? (toEmail?.split("@")[0] ?? "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

  if (!toEmail) {
    return new Response(JSON.stringify({ error: "No email address in payload" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const { subject, html } = buildEmail(actionType, emailData, userName, supabaseUrl);

  // Send via Resend
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@arenasolutionsplatform.com";
  const fromName = Deno.env.get("RESEND_FROM_NAME") ?? "Arena Solutions Platform";

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [toEmail], subject, html }),
  });

  if (!resendRes.ok) {
    const err = await resendRes.json().catch(() => ({})) as Record<string, string>;
    console.error("Resend error:", err);
    return new Response(JSON.stringify({ error: err.message ?? `Resend ${resendRes.status}` }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  // Supabase expects an empty 200 on success
  return new Response(JSON.stringify({}), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
