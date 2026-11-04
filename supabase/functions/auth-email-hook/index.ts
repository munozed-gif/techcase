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

// ── Branded email template (matches buildEmailHtml in src/lib/utils.js) ──────
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
  const platformName = "Arena Solutions Platform";
  const cta =
    ctaText && ctaUrl
      ? `<div style="margin:28px 0">
           <a href="${ctaUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:15px;font-weight:600">${ctaText}</a>
         </div>`
      : "";
  const footer = footerNote
    ? `<p style="font-size:13px;color:#6b7280;margin:16px 0 0;line-height:1.5">${footerNote}</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
  <tr><td align="center">
    <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
      <tr><td style="background:#1d4ed8;padding:28px 32px;text-align:center">
        <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px">${platformName}</div>
      </td></tr>
      <tr><td style="padding:32px 32px 24px">
        <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#111827;line-height:1.3">${title}</h1>
        <div style="font-size:15px;line-height:1.6;color:#374151">${bodyHtml}</div>
        ${cta}
        ${footer}
      </td></tr>
      <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center">
        <p style="margin:0;font-size:12px;color:#9ca3af">You received this because you have an account on ${platformName}.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// ── OTP code block helper ─────────────────────────────────────────────────────
function otpBlock(token: string): string {
  return `<div style="margin:24px 0;text-align:center">
    <div style="display:inline-block;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px 32px">
      <span style="font-size:32px;font-weight:800;letter-spacing:8px;color:#1d4ed8;font-family:monospace">${token}</span>
    </div>
    <p style="margin:12px 0 0;font-size:13px;color:#6b7280">This code expires in 10 minutes.</p>
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
        subject: "Your TechCase verification code",
        html: buildEmailHtml({
          title: "Verify your email ✉️",
          bodyHtml: `<p>Hi ${name},</p>
            <p>Enter the code below on the TechCase signup screen to verify your email address.</p>
            ${token ? otpBlock(token) : ""}
            <p>Or click the button below to verify directly:</p>`,
          ctaText: "Verify email address",
          ctaUrl: confirmUrl,
          footerNote: "If you didn't create an account, you can safely ignore this email.",
        }),
      };

    case "recovery":
      return {
        subject: "Reset your Arena Solutions Platform password",
        html: buildEmailHtml({
          title: "Reset Your Password 🔑",
          bodyHtml: `<p>Hi ${name},</p>
            <p>We received a request to reset the password for your account. Click the button below to choose a new password.</p>
            <p style="font-size:13px;color:#6b7280">This link expires in 24 hours and can only be used once.</p>`,
          ctaText: "Reset Password",
          ctaUrl: confirmUrl,
          footerNote: "If you didn't request a password reset, you can safely ignore this email — your password will not change.",
        }),
      };

    case "magiclink":
      return {
        subject: "Your Arena Solutions Platform sign-in link",
        html: buildEmailHtml({
          title: "Sign in to Arena Solutions Platform 🚀",
          bodyHtml: `<p>Hi ${name},</p>
            <p>Click the button below to sign in. This link expires in 10 minutes and can only be used once.</p>`,
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
          title: "Confirm Email Change ✉️",
          bodyHtml: `<p>Hi ${name},</p>
            <p>Click the button below to confirm your new email address. This link expires in 24 hours.</p>`,
          ctaText: "Confirm New Email",
          ctaUrl: confirmUrl,
          footerNote: "If you didn't request this change, please contact support immediately.",
        }),
      };

    case "invite":
      return {
        subject: "You've been invited to Arena Solutions Platform",
        html: buildEmailHtml({
          title: "You're Invited 🎉",
          bodyHtml: `<p>Hi ${name},</p>
            <p>You've been invited to join Arena Solutions Platform. Click the button below to accept your invitation and set up your account.</p>`,
          ctaText: "Accept Invitation",
          ctaUrl: confirmUrl,
          footerNote: "If you weren't expecting this invitation, you can safely ignore this email.",
        }),
      };

    default:
      return {
        subject: "Arena Solutions Platform — action required",
        html: buildEmailHtml({
          title: "Action Required",
          bodyHtml: `<p>Hi ${name},</p><p>Please click the button below to continue.</p>`,
          ctaText: "Continue",
          ctaUrl: confirmUrl,
        }),
      };
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Verify hook secret — Supabase sends it as Bearer JWT
  const hookSecret = Deno.env.get("HOOK_SECRET");
  if (hookSecret) {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { "Content-Type": "application/json" },
      });
    }
    // Verify HMAC-signed JWT using Web Crypto (no external deps)
    try {
      const [headerB64, payloadB64, sigB64] = token.split(".");
      const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
      const keyBytes = new TextEncoder().encode(hookSecret);
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
