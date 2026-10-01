// lib/notify-admin.ts
//
// Best-effort admin notification for new site submissions — same
// spirit as the Reviewed Developments track's "agency submissions
// trigger an admin notification" pattern, using Resend (the same
// provider the original handover named as the default choice).
//
// IMPORTANT: if the Reviewed Developments track already has a
// working notification system wired up (a different provider, a
// different admin routing address), tell me and I'll switch this to
// match rather than running two separate notification paths — this
// is a first pass, not a decision to fork infrastructure.
//
// Never blocks or fails the submission it's attached to — a
// notification failing to send should never mean a site failed to save.

export async function notifyAdminOfSiteSubmission(params: {
  siteId: string
  city: string
  neighborhood?: string | null
  entrySource: string
  isAgencySubmission: boolean
}) {
  const apiKey = process.env.RESEND_API_KEY
  const adminEmail = process.env.MANOP_ADMIN_NOTIFICATION_EMAIL
  if (!apiKey || !adminEmail) return // not configured — silently skip, not an error

  const urgency = params.isAgencySubmission
    ? 'Agency submission — mandate evidence required before this can be published.'
    : 'New site submission.'

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'MANOP Site Intelligence <notifications@manop.africa>',
        to: adminEmail,
        subject: `New site for review — ${params.neighborhood || params.city}`,
        text: [
          urgency,
          `Location: ${params.neighborhood ? params.neighborhood + ', ' : ''}${params.city}`,
          `Entry source: ${params.entrySource}`,
          `Review it: https://manop.africa/admin/sites/${params.siteId}`,
        ].join('\n'),
      }),
    })
  } catch {
    // Best-effort only — see file header.
  }
}