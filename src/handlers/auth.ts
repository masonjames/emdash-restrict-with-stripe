// Magic link authentication for content access
// Sends a login email, verifies tokens, sets access cookies
//
// Flow:
//   1. POST /auth/send-link  { email } → sends magic link email
//   2. GET  /auth/verify?token=xxx    → validates token, sets cookie, redirects
//   3. GET  /auth/logout              → clears cookie, redirects
//
// The cookie (rwstripe_session) maps to an email in plugin storage.
// Access checks look up email → Stripe customer → verify purchase.

import { StripeClient } from "../stripe.js";

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 48; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

// POST /auth/send-link — sends magic link email
export async function sendLinkHandler(ctx: any) {
  const body = ctx.input || {};
  const email = (body.email || "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return { error: "Valid email required." };
  }

  // Generate a token that expires in 15 minutes
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  // Store the token
  await ctx.storage.authTokens.put(token, {
    email,
    token,
    expiresAt,
    used: false,
    createdAt: new Date().toISOString(),
  });

  // Build the verify URL — points to the Astro page that handles cookie setting
  const siteUrl = new URL(ctx.request.url).origin;
  const verifyUrl = `${siteUrl}/account/verify?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent(body.redirect || "/")}`;

  // Send email via SMTP (localhost:1025 for Mailpit, or configurable)
  const smtpHost = (await ctx.kv.get("smtp_host")) || "127.0.0.1";
  const smtpPort = parseInt((await ctx.kv.get("smtp_port")) || "1025", 10);
  const fromEmail = (await ctx.kv.get("from_email")) || "noreply@emdash.local";
  const siteName = (await ctx.kv.get("site_name")) || "EmDash Site";

  const emailBody = [
    `From: ${siteName} <${fromEmail}>`,
    `To: ${email}`,
    `Subject: Your login link`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    `<p>Click the link below to log in:</p>`,
    `<p><a href="${verifyUrl}" style="display:inline-block;padding:10px 20px;background:#635bff;color:white;text-decoration:none;border-radius:6px;font-weight:500">Log In</a></p>`,
    `<p style="color:#6b7280;font-size:13px">This link expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>`,
  ].join("\r\n");

  try {
    // Use raw TCP to send via SMTP (works in Node.js runtime)
    // For Cloudflare Workers, would need a different approach (Resend/SES API)
    const net = await import("node:net");
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection(smtpPort, smtpHost, () => {
        let step = 0;
        const commands = [
          `EHLO emdash.local`,
          `MAIL FROM:<${fromEmail}>`,
          `RCPT TO:<${email}>`,
          `DATA`,
          emailBody + "\r\n.",
          `QUIT`,
        ];

        socket.on("data", () => {
          if (step < commands.length) {
            socket.write(commands[step] + "\r\n");
            step++;
          }
        });

        socket.on("end", resolve);
        socket.on("error", reject);

        setTimeout(() => { socket.destroy(); resolve(); }, 5000);
      });
    });
  } catch (err: any) {
    console.error("[rwstripe] Failed to send email:", err.message);
    return { error: "Failed to send login email. Check SMTP configuration." };
  }

  return { ok: true, message: "Check your inbox for a login link." };
}

// GET /auth/verify — validates token, sets cookie, redirects
export async function verifyHandler(ctx: any) {
  const url = new URL(ctx.request.url);
  const token = url.searchParams.get("token");
  const redirect = url.searchParams.get("redirect") || "/";

  if (!token) {
    return { __html: errorPage("Invalid login link.") };
  }

  // Look up the token
  const record = await ctx.storage.authTokens.get(token);
  if (!record) {
    return { __html: errorPage("Login link not found or expired.") };
  }

  const data = record.data || record;

  // Check expiration
  if (new Date(data.expiresAt) < new Date()) {
    await ctx.storage.authTokens.delete(token);
    return { __html: errorPage("Login link has expired. Please request a new one.") };
  }

  // Check if already used
  if (data.used) {
    return { __html: errorPage("This login link has already been used.") };
  }

  // Mark as used
  await ctx.storage.authTokens.put(token, { ...data, used: true });

  // Generate a session token (long-lived, 30 days)
  const sessionToken = generateToken();
  const sessionExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await ctx.storage.sessions.put(sessionToken, {
    email: data.email,
    sessionToken,
    expiresAt: sessionExpires,
    createdAt: new Date().toISOString(),
  });

  // Plugin routes always return JSON — we can't return raw HTML or set cookies.
  // Instead, return the session token and redirect URL. The caller handles it.
  // For magic link clicks from email: return a redirect URL with the session token
  // as a query param. The frontend JS captures it and sets the cookie.
  const sep = redirect.includes("?") ? "&" : "?";
  const redirectUrl = `${redirect}${sep}rwstripe_session=${encodeURIComponent(sessionToken)}`;

  return { ok: true, redirect: redirectUrl, sessionToken };
}

// GET /auth/logout — clears session
export async function logoutHandler(ctx: any) {
  const url = new URL(ctx.request.url);
  const redirect = url.searchParams.get("redirect") || "/";

  return {
    __html: `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Logging out...</title></head><body>
<script>
document.cookie = "rwstripe_session=; path=/; max-age=0";
localStorage.removeItem("rwstripe_token");
window.location.href = ${JSON.stringify(redirect)};
</script>
<p>Logging you out...</p>
</body></html>`,
  };
}

// Helper: look up session from cookie in request
export async function getSessionEmail(ctx: any): Promise<string | null> {
  const cookieHeader = ctx.request.headers.get("cookie") || "";
  const match = cookieHeader.match(/rwstripe_session=([^;]+)/);
  if (!match) return null;

  const sessionToken = match[1];
  const record = await ctx.storage.sessions.get(sessionToken);
  if (!record) return null;

  const data = record.data || record;
  if (new Date(data.expiresAt) < new Date()) {
    await ctx.storage.sessions.delete(sessionToken);
    return null;
  }

  return data.email;
}

function errorPage(msg: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Error</title></head><body style="font-family:system-ui;max-width:400px;margin:4rem auto;text-align:center">
<h2>Login Error</h2><p style="color:#dc2626">${msg}</p>
<p><a href="javascript:history.back()">Go back</a></p>
</body></html>`;
}
