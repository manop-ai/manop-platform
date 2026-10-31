'use client'

// components/BuyerPackButton.tsx — "Download Buyer Pack". One component for every entry point (public development page,
// watchlist, investor and buyer dashboards) so they all call the same route and get the same pack. Downloads a real PDF
// through authedFetch (signed-in users get developer identity; signed-out users get the public pack) and reports errors.

import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { authedFetch } from '../lib/authed-fetch'

export default function BuyerPackButton({ projectId, dark = true, compact = false }: { projectId: string; dark?: boolean; compact?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const text = dark ? '#F8FAFC' : '#0F172A', border = dark ? 'rgba(248,250,252,0.22)' : 'rgba(15,23,42,0.28)'

  async function download() {
    if (busy) return
    setBusy(true); setErr(null)
    try {
      const res = await authedFetch(`/api/developments/${projectId}/buyer-pack`)
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error || 'The Buyer Pack could not be generated.'); return }
      const blob = await res.blob()
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'MANOP-Buyer-Pack.pdf'
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    } catch { setErr('Could not download the Buyer Pack. Check your connection and try again.') }
    finally { setBusy(false) }
  }

  return (
    <div>
      <button type="button" onClick={download} disabled={busy} aria-busy={busy}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: compact ? 36 : 44, padding: compact ? '0.3rem 0.8rem' : '0.6rem 1.1rem', borderRadius: 4, border: `1px solid ${border}`, background: 'transparent', color: text, fontSize: compact ? 12.5 : 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1, fontFamily: 'inherit', width: compact ? 'auto' : '100%' }}>
        <FileDown size={compact ? 14 : 16} aria-hidden />{busy ? 'Preparing your pack…' : 'Download Buyer Pack'}
      </button>
      {err && <div role="alert" style={{ fontSize: 12, color: '#EF4444', marginTop: 6 }}>{err}</div>}
    </div>
  )
}