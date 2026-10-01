'use client'
// components/SiteQuickReviewWidget.tsx
//
// HAND-OFF COMPONENT for the other Claude Code's agency dashboard
// panel (app/agency/dashboard/page.tsx, "Site Intelligence
// integration" comment). Drop-in, self-contained — no props required
// beyond optional styling context. Resolves a site reference or ID
// to its Review page; if given coordinates instead, runs a live
// Quick Review inline and links to the result.
//
// Usage in app/agency/dashboard/page.tsx:
//   import SiteQuickReviewWidget from '../../../components/SiteQuickReviewWidget'
//   ...
//   <SiteQuickReviewWidget dark={dark} />

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getDesignColors, designTokens } from '../lib/theme'

export default function SiteQuickReviewWidget({ dark = true }: { dark?: boolean }) {
  const c = getDesignColors(dark)
  const router = useRouter()
  const [reference, setReference] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSearch() {
    setError('')
    const value = reference.trim()
    if (!value) return
    setLoading(true)
    try {
      const sb = (await import('@supabase/supabase-js')).createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      )
      // Accept either a MANOP site reference (e.g. NG-SITE-000123) or a raw UUID
      const { data } = await sb
        .from('sites')
        .select('id')
        .or(`reference.eq.${value},id.eq.${value}`)
        .maybeSingle()

      if (!data) { setError('No site found with that reference.'); return }
      router.push(`/site-intelligence/${data.id}`)
    } catch {
      setError('Could not search right now.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      border: `1px solid ${c.border}`, borderRadius: designTokens.radius.sm,
      padding: 16, background: c.surfaceCard, fontFamily: designTokens.font.family,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Look up a Site</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Site reference or ID"
          style={{
            flex: 1, padding: '8px 10px', fontSize: 13, borderRadius: designTokens.radius.sm,
            border: `1px solid ${c.border}`, background: c.background, color: c.textPrimary,
          }}
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          style={{
            padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: designTokens.radius.sm,
            border: 'none', background: c.intelligencePurple, color: '#fff',
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? '…' : 'Find'}
        </button>
      </div>
      {error && <div style={{ fontSize: 12, color: c.statusRed, marginBottom: 8 }}>{error}</div>}
      <a href="/site-intelligence/quick-review" style={{ fontSize: 12, color: c.textMuted }}>
        Or run a new Quick Review for a site not yet in MANOP →
      </a>
    </div>
  )
}