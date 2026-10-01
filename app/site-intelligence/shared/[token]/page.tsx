'use client'
// app/site-intelligence/shared/[token]/page.tsx
//
// The page the Studio "Share" button links to. Before this file existed,
// every share link 404'd. PUBLIC and VIEW-ONLY: the recipient has no MANOP
// session, can inspect, read and navigate (2D/3D, Map/Satellite), and cannot
// modify anything — ScenarioMap is rendered with no draw mode and no edit
// callbacks, and the only network call is a GET to /api/shared/scenarios/[token].
//
// Evidence discipline carries through: every reading keeps its FACT / DERIVED /
// ESTIMATE / ASSUMPTION / UNKNOWN status, unknowns are called out rather than
// hidden, and the page states plainly that this is an indicative scenario.

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import ManopLogo from '../../../../components/ManopLogo'
import ScenarioMap, { MapStyleMode, BuildingFeature, OpenSpaceFeature } from '../../../../components/ScenarioMap'
import { DEVELOPMENT_CATEGORY_LABEL } from '../../../../lib/development-presets'
import { formatArea } from '../../../../lib/site-intelligence'
import { getInitialDark, listenTheme, getDesignColors, designTokens } from '../../../../lib/theme'

interface SharedReading {
  reading_key: string; label: string; numeric_value: number | null; unit: string | null
  value_status: 'fact' | 'assumption' | 'derived' | 'estimate' | 'professional_opinion' | 'unknown'
  derivation_note: string | null; source: string | null
}
interface SharedPayload {
  permission: 'view' | 'edit'
  scenario: {
    id: string; reference: string | null; name: string; development_category: string
    coverage_pct: number | null; storeys: number | null; avg_unit_area_sqm: number | null
    parking_ratio: number | null; open_space_pct: number | null; status: string
  }
  readings: SharedReading[]
  buildings: BuildingFeature[]
  openSpaces: OpenSpaceFeature[]
  site: {
    reference: string | null; city: string | null; state: string | null; neighborhood: string | null
    lat: number | null; lng: number | null; area_sqm: number | null; area_source: string | null
    boundary_area_sqm: number | null
    boundary: GeoJSON.Polygon | null; exploratory_boundary: GeoJSON.Polygon | null
  } | null
}

const STATUS_LABEL: Record<string, string> = {
  fact: 'FACT', assumption: 'ASSUMPTION', derived: 'DERIVED', estimate: 'ESTIMATE',
  professional_opinion: 'PROFESSIONAL OPINION', unknown: 'UNKNOWN',
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: SharedPayload }
  | { kind: 'error'; title: string; message: string }

export default function SharedScenarioPage() {
  const { token } = useParams<{ token: string }>()
  const [dark, setDark] = useState(true)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [is3D, setIs3D] = useState(true)
  const [mapStyle, setMapStyle] = useState<MapStyleMode>('satellite')

  useEffect(() => { setDark(getInitialDark()); return listenTheme(setDark) }, [])
  const c = getDesignColors(dark)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/shared/scenarios/${encodeURIComponent(String(token))}`)
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok) return setState({ kind: 'ready', data: body as SharedPayload })
        if (res.status === 404) return setState({ kind: 'error', title: 'Link not available', message: body.error || 'This share link is invalid or has been revoked.' })
        if (res.status === 503) return setState({ kind: 'error', title: 'Sharing not enabled yet', message: body.error })
        setState({ kind: 'error', title: 'Could not load scenario', message: body.error || 'Something went wrong loading this shared scenario.' })
      } catch {
        if (!cancelled) setState({ kind: 'error', title: 'Could not load scenario', message: 'Network error — please try again.' })
      }
    })()
    return () => { cancelled = true }
  }, [token])

  const data = state.kind === 'ready' ? state.data : null
  const parking = data?.readings.find(r => r.reading_key === 'indicative_parking_count')
  const footprint = data?.readings.find(r => r.reading_key === 'indicative_footprint_sqm')
  const unknowns = useMemo(() => (data?.readings || []).filter(r => r.value_status === 'unknown' || r.numeric_value == null), [data])

  const shell: React.CSSProperties = { background: c.background, color: c.textPrimary, minHeight: '100vh', fontFamily: designTokens.font.family }

  if (state.kind !== 'ready') {
    return (
      <div style={{ ...shell, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 460, textAlign: 'center' }}>
          <ManopLogo />
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '18px 0 8px' }}>{state.kind === 'loading' ? 'Loading shared scenario…' : state.title}</h1>
          {state.kind === 'error' && <p style={{ fontSize: 14, color: c.textMuted, lineHeight: 1.6 }}>{state.message}</p>}
        </div>
      </div>
    )
  }

  const { scenario, site } = state.data
  const categoryLabel = DEVELOPMENT_CATEGORY_LABEL[scenario.development_category as keyof typeof DEVELOPMENT_CATEGORY_LABEL] || scenario.development_category
  const boundaryStatus = site?.boundary ? 'Confirmed boundary polygon' : site?.exploratory_boundary ? 'Exploratory (user-drawn) boundary — not surveyed' : 'Boundary not confirmed — location only'

  return (
    <div style={shell}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: `1px solid ${c.border}` }}>
        <ManopLogo />
        <span style={{ fontSize: 12, color: c.textMuted }}>View-only shared scenario</span>
      </header>

      <div style={{ padding: '10px 24px', background: c.surfaceCard, borderBottom: `1px solid ${c.border}`, fontSize: 12, color: c.textMuted }}>
        Indicative scenario — not planning approval, final design, valuation, or professional advice.
      </div>

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{scenario.name}</h1>
        <div style={{ fontSize: 13, color: c.textMuted, marginTop: 4 }}>
          {scenario.reference ? `${scenario.reference} · ` : ''}{categoryLabel}
          {site ? ` · ${[site.neighborhood, site.city].filter(Boolean).join(', ')}` : ''}
          {scenario.status === 'archived' ? ' · Archived by the owner' : ''}
        </div>

        <div style={{ display: 'flex', gap: 8, margin: '16px 0 8px' }}>
          {(['2D', '3D'] as const).map(m => (
            <button key={m} onClick={() => setIs3D(m === '3D')} style={btn(c, (m === '3D') === is3D)}>{m}</button>
          ))}
          {(['map', 'satellite'] as MapStyleMode[]).map(m => (
            <button key={m} onClick={() => setMapStyle(m)} style={btn(c, mapStyle === m)}>{m === 'map' ? 'Map' : 'Satellite'}</button>
          ))}
        </div>

        <div style={{ height: 520, border: `1px solid ${c.border}`, borderRadius: designTokens.radius.sm, overflow: 'hidden' }}>
          <ScenarioMap
            lat={site?.lat ?? null} lng={site?.lng ?? null}
            boundary={site?.boundary ?? null} exploratoryBoundary={site?.exploratory_boundary ?? null}
            footprintSqm={state.data.buildings.length === 0 ? footprint?.numeric_value ?? null : null} heightM={null}
            is3D={is3D} mapStyle={mapStyle} dark={dark} height="100%"
            drawMode="none"
            buildings={state.data.buildings} openSpaces={state.data.openSpaces}
            developmentCategory={scenario.development_category}
            indicativeParkingStallCount={parking?.numeric_value ?? null}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 20 }}>
          <section style={panel(c)}>
            <h2 style={h2}>Site</h2>
            <Row c={c} k="Area" v={formatArea(site?.area_sqm ?? site?.boundary_area_sqm ?? null)} />
            <Row c={c} k="Boundary" v={boundaryStatus} />
            <Row c={c} k="Location" v={site?.lat != null ? 'Identified' : 'Not available'} />
          </section>
          <section style={panel(c)}>
            <h2 style={h2}>Scenario assumptions</h2>
            <Row c={c} k="Storeys" v={fmt(scenario.storeys)} />
            <Row c={c} k="Site coverage" v={scenario.coverage_pct != null ? `${scenario.coverage_pct}%` : '—'} />
            <Row c={c} k="Avg unit area" v={scenario.avg_unit_area_sqm != null ? `${scenario.avg_unit_area_sqm} sqm` : '—'} />
            <Row c={c} k="Parking ratio" v={scenario.parking_ratio != null ? `${scenario.parking_ratio} / unit` : '—'} />
            <Row c={c} k="Open space" v={scenario.open_space_pct != null ? `${scenario.open_space_pct}%` : '—'} />
          </section>
        </div>

        <section style={{ ...panel(c), marginTop: 16 }}>
          <h2 style={h2}>Readings</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {state.data.readings.map(r => (
              <div key={r.reading_key} style={{ border: `1px solid ${c.border}`, borderRadius: designTokens.radius.sm, padding: 10 }}>
                <div style={{ fontSize: 11, color: c.textMuted }}>{r.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{r.numeric_value != null ? `${r.numeric_value.toLocaleString()} ${r.unit || ''}` : 'Not currently calculable'}</div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: r.value_status === 'unknown' ? c.textFaint : r.value_status === 'fact' ? c.verificationTeal : c.intelligencePurple, marginTop: 2 }}>
                  {STATUS_LABEL[r.value_status] || r.value_status}
                </div>
                {r.derivation_note && <div style={{ fontSize: 10.5, color: c.textFaint, marginTop: 4 }}>{r.derivation_note}</div>}
              </div>
            ))}
          </div>
        </section>

        {unknowns.length > 0 && (
          <section style={{ ...panel(c), marginTop: 16 }}>
            <h2 style={h2}>What is not known</h2>
            <p style={{ fontSize: 12.5, color: c.textMuted, margin: '0 0 8px' }}>
              These values could not be established from the evidence available and should be confirmed with the relevant professional or authority before being relied on.
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {unknowns.map(u => <li key={u.reading_key}>{u.label}</li>)}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}

const fmt = (n: number | null) => (n == null ? '—' : String(n))
const h2: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', margin: '0 0 10px' }
const panel = (c: ReturnType<typeof getDesignColors>): React.CSSProperties => ({ border: `1px solid ${c.border}`, background: c.surfaceCard, borderRadius: designTokens.radius.sm, padding: 16 })
const btn = (c: ReturnType<typeof getDesignColors>, active: boolean): React.CSSProperties => ({
  padding: '6px 12px', fontSize: 12.5, cursor: 'pointer', borderRadius: designTokens.radius.sm,
  border: `1px solid ${active ? c.intelligencePurple : c.border}`, background: active ? c.intelligencePurple : 'transparent', color: active ? '#fff' : c.textPrimary,
})
function Row({ c, k, v }: { c: ReturnType<typeof getDesignColors>; k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', borderTop: `1px solid ${c.border}`, fontSize: 13 }}>
      <span style={{ color: c.textMuted }}>{k}</span><span style={{ textAlign: 'right' }}>{v}</span>
    </div>
  )
}