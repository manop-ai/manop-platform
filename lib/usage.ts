// lib/usage.ts — pure rules for the usage counter (no I/O). The counter answers two investor questions: how many different visitors came
// in a month, and how many different signed-in users were active. It stores a random id kept in the visitor's own browser and the page path.
// No IP address, no name, no email, no page content. A visitor whose browser sends Do-Not-Track is not counted.

export const VISITOR_ID_RE = /^[A-Za-z0-9_-]{8,64}$/
const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|uptime|lighthouse|headless|curl|wget|python-requests|axios|node-fetch|go-http/i

/** Paths that are never counted: the admin area, APIs and Next internals. */
export function countablePath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.length > 300) return null
  const path = raw.split('?')[0].split('#')[0]
  if (/^\/(admin|api|_next)(\/|$)/.test(path)) return null
  return path || '/'
}

export function isBot(userAgent: string | null | undefined): boolean {
  return !userAgent || BOT_RE.test(userAgent)
}

export function referrerHost(raw: unknown, ownHost: string | null): string | null {
  if (typeof raw !== 'string' || !raw) return null
  try { const h = new URL(raw).hostname.toLowerCase(); return h && h !== ownHost ? h.slice(0, 120) : null } catch { return null }
}

/** One page view per visitor and path in any 30 seconds; at most 60 per visitor per minute. */
export function shouldRecord(i: { sameRecentView: boolean; viewsLastMinute: number }): boolean {
  return !i.sameRecentView && i.viewsLastMinute < 60
}

export interface MonthRow { month: string; visitors: number; page_views: number; signed_in_users: number; new_signups: number; enquiries: number; routed_enquiries: number }
export function growth(cur: number, prev: number | null | undefined): string {
  if (prev === null || prev === undefined) return '—'
  if (prev === 0) return cur === 0 ? '0%' : 'new'
  const g = Math.round(((cur - prev) / prev) * 100)
  return `${g > 0 ? '+' : ''}${g}%`
}