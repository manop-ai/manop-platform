'use client'
// app/admin/usage/page.tsx — how many people use MANOP each month (admin only). For investor conversations.
// Visitors = different browsers that opened a public page. Signed-in users = different accounts that were active. These are counts of
// real recorded visits since counting began; months before that show zero, not an estimate.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '../../../lib/useAuth'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import { authedFetch } from '../../../lib/authed-fetch'
import ManopLoader from '../../../components/ManopLoader'
import { growth } from '../../../lib/usage'

export default function AdminUsagePage() {
  const { user, checking } = useAuth('admin')
  const [dark, setDark] = useState(true); const [d, setD] = useState<any>(null); const [err, setErr] = useState('')
  useEffect(() => { setDark(getInitialDark()); return listenTheme(setDark) }, [])
  useEffect(() => {
    if (!user) return
    authedFetch('/api/admin/usage?months=12').then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) setErr(j.error || 'Could not load usage.'); else setD(j) })
  }, [user])
  if (checking || !user) return <ManopLoader dark={dark} label="Loading…" />
  const bg = dark ? '#0F172A' : '#F8FAFC', text = dark ? '#F8FAFC' : '#0F172A', text3 = dark ? 'rgba(248,250,252,0.6)' : 'rgba(15,23,42,0.65)', border = dark ? 'rgba(248,250,252,0.14)' : 'rgba(15,23,42,0.18)'
  const th: React.CSSProperties = { textAlign: 'right', padding: '8px 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: text3, borderBottom: `1px solid ${border}` }
  const td: React.CSSProperties = { textAlign: 'right', padding: '8px 10px', borderBottom: `1px solid ${border}`, fontVariantNumeric: 'tabular-nums' }
  const rows: any[] = d?.rows ?? []
  return (
    <div style={{ background: bg, color: text, minHeight: '100vh', padding: 'clamp(1rem,4vw,2rem)' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <Link href="/admin" style={{ color: text3, fontSize: 13, textDecoration: 'none' }}>← Command Center</Link>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '8px 0 4px' }}>Usage by month</h1>
        <div style={{ fontSize: 13.5, color: text3, marginBottom: 14, maxWidth: 720, lineHeight: 1.6 }}>
          Visitors are different browsers that opened a public page. Signed-in users are different accounts that were active. Sign-ups, enquiries and routed enquiries come from the database.
          {d?.countingSince ? ` Page-view counting began ${new Date(d.countingSince).toLocaleDateString()}; earlier months show zero visitors because nothing was recorded then.` : ' No page views recorded yet.'}
          {' '}No IP address or personal detail is stored with a visit. Admin pages and bots are not counted.
        </div>
        {err && <div role="alert" style={{ color: '#EF4444', marginBottom: 12 }}>{err}</div>}
        {d && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr><th style={{ ...th, textAlign: 'left' }}>Month</th><th style={th}>Visitors</th><th style={th}>vs last month</th><th style={th}>Page views</th><th style={th}>Signed-in users</th><th style={th}>New sign-ups</th><th style={th}>Enquiries</th><th style={th}>Routed</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.month}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{r.month}</td><td style={td}>{r.visitors}</td><td style={td}>{growth(r.visitors, rows[i + 1]?.visitors)}</td>
                    <td style={td}>{r.page_views}</td><td style={td}>{r.signed_in_users}</td><td style={td}>{r.new_signups}</td><td style={td}>{r.enquiries}</td><td style={td}>{r.routed_enquiries}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}