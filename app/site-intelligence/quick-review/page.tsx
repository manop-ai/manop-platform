'use client'
// app/site-intelligence/quick-review/page.tsx
//
// The instant, no-staff-review entry point: coordinates in, spatial
// check out. Deliberately a much shorter form than Submit — no
// documents, no ownership evidence, because that's the whole point
// of "quick." Result lands on the same Site Intelligence Profile
// page, marked with a Quick Review badge.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import SiteIntelligenceNav from '../../../components/SiteIntelligenceNav'
import { getInitialDark, getDesignColors, designTokens } from '../../../lib/theme'
import { authedFetch } from '../../../lib/authed-fetch'

export default function QuickReviewPage() {
  const router = useRouter()
  const dark = getInitialDark()
  const c = getDesignColors(dark)

  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: designTokens.radius.sm,
    border: `1px solid ${c.border}`, background: c.surfaceCard, color: c.textPrimary, fontSize: 14,
  }
  const labelStyle: React.CSSProperties = { fontSize: 12, color: c.textMuted, marginBottom: 6, display: 'block' }

  async function handleSubmit() {
    setError('')
    if (!city.trim() || !lat || !lng) { setError('City and coordinates are required.'); return }

    setSubmitting(true)
    try {
      const res = await authedFetch('/api/sites/quick-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country_code: 'NG', city, state: state || undefined,
          lat: Number(lat), lng: Number(lng),
        }),
      })
      const data = await res.json()
      if (!res.ok && res.status !== 207) throw new Error(data.error || 'Quick review failed')
      router.push(`/site-intelligence/${data.site.id}`)
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      background: c.background, color: c.textPrimary, minHeight: '100vh',
      fontFamily: designTokens.font.family, padding: '32px',
    }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <SiteIntelligenceNav dark={dark} />
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Quick Site Review</h1>
        <p style={{ fontSize: 13.5, color: c.textMuted, marginBottom: 28, lineHeight: 1.5 }}>
          Instant check against whatever planning data MANOP currently has for the area —
          no documents needed, no staff review. This does not confirm land ownership,
          zoning approval, or buildability. To bring a site through MANOP's full evidence
          and review process instead, use{' '}
          <a href="/site-intelligence/submit" style={{ color: c.intelligencePurple }}>Submit a Site</a>.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>City *</label>
            <input style={inputStyle} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lagos" />
          </div>
          <div>
            <label style={labelStyle}>State</label>
            <input style={inputStyle} value={state} onChange={(e) => setState(e.target.value)} placeholder="Lagos" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>Latitude *</label>
            <input style={inputStyle} value={lat} onChange={(e) => setLat(e.target.value)} placeholder="6.4390" />
          </div>
          <div>
            <label style={labelStyle}>Longitude *</label>
            <input style={inputStyle} value={lng} onChange={(e) => setLng(e.target.value)} placeholder="3.4780" />
          </div>
        </div>

        {error && <div style={{ color: c.statusRed, fontSize: 13, marginBottom: 16 }}>{error}</div>}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            width: '100%', padding: '12px', borderRadius: designTokens.radius.sm, border: 'none',
            background: c.intelligencePurple, color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? 'Checking…' : 'Run Quick Review'}
        </button>
      </div>
    </div>
  )
}