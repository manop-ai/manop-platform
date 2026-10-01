// lib/email.ts — MANOP admin email notifications
//
// Calls Resend's REST API directly with fetch — no `resend` npm package
// needed, so this works the moment RESEND_API_KEY is set, no install step.
//
// REQUIRED ENV VARS (set these in your deployment, e.g. Vercel):
//   RESEND_API_KEY     — from resend.com dashboard
//   MANOP_ADMIN_EMAIL   — where lead/enquiry notifications should land
//   RESEND_FROM_EMAIL   — must be a verified sender/domain in Resend,
//                         e.g. 'MANOP <notifications@manopintel.com>'
//
// Every call is designed to be used fire-and-forget (never awaited into
// a response, never allowed to fail a lead/enquiry submission) — if the
// env vars aren't set yet, this just logs a warning once and no-ops,
// exactly like the rest of the fire-and-forget activity_log pattern
// already used in the leads API routes.

let warnedMissingConfig = false

export async function sendAdminNotification(subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const to     = process.env.MANOP_ADMIN_EMAIL
  const from   = process.env.RESEND_FROM_EMAIL

  if (!apiKey || !to || !from) {
    if (!warnedMissingConfig) {
      console.warn('[email] Skipping admin notification — set RESEND_API_KEY, MANOP_ADMIN_EMAIL, and RESEND_FROM_EMAIL to enable.')
      warnedMissingConfig = true
    }
    return
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[email] Resend API error:', res.status, body)
    }
  } catch (err) {
    console.error('[email] Failed to send admin notification:', err)
  }
}

// Small formatting helper so every notification email looks consistent
export function notificationHtml(title: string, rows: Array<[string, string | null | undefined]>): string {
  const rowsHtml = rows
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([label, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748B;font-size:13px;white-space:nowrap;">${label}</td><td style="padding:4px 0;color:#0F172A;font-size:13px;font-weight:600;">${v}</td></tr>`)
    .join('')
  return `
    <div style="font-family:-apple-system,sans-serif;max-width:480px;">
      <h2 style="font-size:16px;color:#0F172A;margin:0 0 12px;">${title}</h2>
      <table cellpadding="0" cellspacing="0">${rowsHtml}</table>
    </div>
  `
}