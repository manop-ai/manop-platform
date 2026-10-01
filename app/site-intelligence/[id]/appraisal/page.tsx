'use client'
// app/site-intelligence/[id]/appraisal/page.tsx
//
// Construction Appraisal — reachable from a Quick Review result and
// from a published Site Intelligence Profile alike (both link here
// with the site's id). Open to run without login; downloading the
// report requires being signed in, checked here client-side against
// the current Supabase session.

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { Plus, Trash2, Download, Lock } from 'lucide-react'
import { BackToDiscovery } from '../../../../components/SiteIntelligenceNav'
import { computeAppraisal, AppraisalInputs, UnitMixRow, AppraisalOutputs } from '../../../../lib/construction-appraisal'
import { getDesignColors, designTokens } from '../../../../lib/theme'
import { authedFetch } from '../../../../lib/authed-fetch'

const dark = true
const c = getDesignColors(dark)

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

const DEFAULT_INPUTS: AppraisalInputs = {
  landowner_asking_price_ngn: null,
  landowner_jv_expectation_pct: null,
  unit_mix: [{ label: '3-Bed Apartment', units: 1, sale_price_ngn: 0, build_area_sqm: 0 }],
  build_cost_per_sqm_ngn: 0,
  other_development_costs_ngn: 0,
  contingency_pct: 7.5,
  debt_funding_pct: 60,
  interest_rate_pct: 22,
  loan_period_months: 18,
  developer_profit_target_pct: 20,
  sales_downside_pct: 10,
  cost_upside_pct: 10,
}

export default function AppraisalPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [scenarioName, setScenarioName] = useState('Base Case')
  const [inputs, setInputs] = useState<AppraisalInputs>(DEFAULT_INPUTS)
  const [linkedScenarioId, setLinkedScenarioId] = useState<string | null>(null)
  const [linkedScenarioRef, setLinkedScenarioRef] = useState<string | null>(null)
  const [results, setResults] = useState<AppraisalOutputs | null>(null)
  const [savedScenarios, setSavedScenarios] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setIsLoggedIn(!!data.user))
    authedFetch(`/api/sites/${params.id}/appraisals`).then(r => r.json()).then(d => setSavedScenarios(d.appraisals || []))
  }, [params.id])

  // Prefill from a Site Studio scenario, when opened with ?scenario_id=...
  // Never runs silently: everything it fills in is shown in a banner so
  // the person always knows what came from Studio vs what's theirs.
  useEffect(() => {
    const scenarioId = searchParams.get('scenario_id')
    if (!scenarioId) return

    fetch(`/api/scenarios/${scenarioId}`).then(r => r.json()).then((data) => {
      const scenario = data.scenario
      const readings = data.readings || []
      if (!scenario) return

      setLinkedScenarioId(scenario.id)
      setLinkedScenarioRef(scenario.reference || scenario.name)
      setScenarioName(scenario.reference ? `${scenario.reference} — Appraisal` : `${scenario.name} — Appraisal`)

      const gfaReading = readings.find((r: any) => r.reading_key === 'indicative_gfa_sqm')
      const unitReadings = readings.filter((r: any) => r.reading_key.startsWith('unit_mix_') && r.numeric_value != null)

      if (unitReadings.length > 0 && scenario.avg_unit_area_sqm) {
        setInputs((prev) => ({
          ...prev,
          unit_mix: unitReadings.map((r: any) => ({
            label: r.label.replace(/ Units$/, ''),
            units: r.numeric_value,
            sale_price_ngn: 0,
            build_area_sqm: scenario.avg_unit_area_sqm,
          })),
        }))
      } else if (gfaReading?.numeric_value) {
        // No unit-mix preset (e.g. Commercial) — carry the GFA over as
        // a single build-area row rather than leaving the calculator
        // at its generic 1-row default.
        setInputs((prev) => ({
          ...prev,
          unit_mix: [{ label: scenario.name, units: 1, sale_price_ngn: 0, build_area_sqm: gfaReading.numeric_value }],
        }))
      }
    })
  }, [searchParams])

  function updateUnitRow(i: number, field: keyof UnitMixRow, value: string) {
    const next = [...inputs.unit_mix]
    next[i] = { ...next[i], [field]: field === 'label' ? value : Number(value) }
    setInputs({ ...inputs, unit_mix: next })
  }

  function addUnitRow() {
    setInputs({ ...inputs, unit_mix: [...inputs.unit_mix, { label: '', units: 1, sale_price_ngn: 0, build_area_sqm: 0 }] })
  }

  function removeUnitRow(i: number) {
    setInputs({ ...inputs, unit_mix: inputs.unit_mix.filter((_, idx) => idx !== i) })
  }

  function previewResults() {
    setResults(computeAppraisal(inputs))
  }

  async function saveScenario() {
    setSaving(true)
    setError('')
    try {
      const res = await authedFetch(`/api/sites/${params.id}/appraisals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_name: scenarioName, scenario_id: linkedScenarioId, ...inputs }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setResults(data.appraisal)
      setSavedScenarios([data.appraisal, ...savedScenarios])
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  function handleDownload() {
    if (!isLoggedIn) {
      router.push(`/login?next=/site-intelligence/${params.id}/appraisal`)
      return
    }
    if (!results) return
    const blob = new Blob([JSON.stringify({ scenario: scenarioName, inputs, results }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `manop-appraisal-${scenarioName.replace(/\s+/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: designTokens.radius.sm,
    border: `1px solid ${c.border}`, background: c.surfaceCard, color: c.textPrimary,
  }
  const labelStyle: React.CSSProperties = { fontSize: 11, color: c.textMuted, marginBottom: 4, display: 'block' }
  const fmt = (n: number) => `₦${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`

  return (
    <div style={{
      background: c.background, color: c.textPrimary, minHeight: '100vh',
      fontFamily: designTokens.font.family, padding: '32px', maxWidth: 720, margin: '0 auto',
    }}>
      <BackToDiscovery dark={dark} />
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Construction Appraisal</h1>
      <p style={{ fontSize: 13.5, color: c.textMuted, marginBottom: 24, lineHeight: 1.5 }}>
        This is your own working analysis — the figures and conclusions come from what you enter,
        not from MANOP. Run as many scenarios as you like; nothing here is a MANOP claim about this site.
      </p>

      {linkedScenarioRef && (
        <div style={{
          fontSize: 12.5, color: c.textMuted, marginBottom: 16, padding: '10px 12px',
          border: `1px solid ${c.border}`, borderRadius: designTokens.radius.sm, background: c.surfaceCard,
        }}>
          Unit count and build area prefilled from <b style={{ color: c.textPrimary }}>{linkedScenarioRef}</b> in Site Studio.
          Sale prices are not filled in — MANOP does not supply market pricing here; enter your own.
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Scenario name</label>
        <input style={inputStyle} value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} />
      </div>

      {/* Unit mix */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Unit mix</label>
        {inputs.unit_mix.map((row, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.4fr 1fr auto', gap: 6, marginBottom: 6 }}>
            <input style={inputStyle} placeholder="Label" value={row.label} onChange={(e) => updateUnitRow(i, 'label', e.target.value)} />
            <input style={inputStyle} type="number" placeholder="Units" value={row.units || ''} onChange={(e) => updateUnitRow(i, 'units', e.target.value)} />
            <input style={inputStyle} type="number" placeholder="Sale price (₦)" value={row.sale_price_ngn || ''} onChange={(e) => updateUnitRow(i, 'sale_price_ngn', e.target.value)} />
            <input style={inputStyle} type="number" placeholder="Sqm each" value={row.build_area_sqm || ''} onChange={(e) => updateUnitRow(i, 'build_area_sqm', e.target.value)} />
            <button onClick={() => removeUnitRow(i)} style={{ background: 'transparent', border: 'none', color: c.textFaint, cursor: 'pointer' }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button onClick={addUnitRow} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: c.intelligencePurple,
          background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
        }}>
          <Plus size={13} /> Add unit type
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div><label style={labelStyle}>Landowner asking price (₦)</label>
          <input style={inputStyle} type="number" value={inputs.landowner_asking_price_ngn ?? ''} onChange={(e) => setInputs({ ...inputs, landowner_asking_price_ngn: e.target.value ? Number(e.target.value) : null })} /></div>
        <div><label style={labelStyle}>Landowner JV expectation (%, optional)</label>
          <input style={inputStyle} type="number" value={inputs.landowner_jv_expectation_pct ?? ''} onChange={(e) => setInputs({ ...inputs, landowner_jv_expectation_pct: e.target.value ? Number(e.target.value) : null })} /></div>
        <div><label style={labelStyle}>Build cost per sqm (₦)</label>
          <input style={inputStyle} type="number" value={inputs.build_cost_per_sqm_ngn || ''} onChange={(e) => setInputs({ ...inputs, build_cost_per_sqm_ngn: Number(e.target.value) })} /></div>
        <div><label style={labelStyle}>Other development costs (₦)</label>
          <input style={inputStyle} type="number" value={inputs.other_development_costs_ngn || ''} onChange={(e) => setInputs({ ...inputs, other_development_costs_ngn: Number(e.target.value) })} /></div>
        <div><label style={labelStyle}>Contingency (%)</label>
          <input style={inputStyle} type="number" value={inputs.contingency_pct} onChange={(e) => setInputs({ ...inputs, contingency_pct: Number(e.target.value) })} /></div>
        <div><label style={labelStyle}>Debt funding (%)</label>
          <input style={inputStyle} type="number" value={inputs.debt_funding_pct} onChange={(e) => setInputs({ ...inputs, debt_funding_pct: Number(e.target.value) })} /></div>
        <div><label style={labelStyle}>Interest rate (%)</label>
          <input style={inputStyle} type="number" value={inputs.interest_rate_pct} onChange={(e) => setInputs({ ...inputs, interest_rate_pct: Number(e.target.value) })} /></div>
        <div><label style={labelStyle}>Loan period (months)</label>
          <input style={inputStyle} type="number" value={inputs.loan_period_months} onChange={(e) => setInputs({ ...inputs, loan_period_months: Number(e.target.value) })} /></div>
        <div><label style={labelStyle}>Developer profit target (%)</label>
          <input style={inputStyle} type="number" value={inputs.developer_profit_target_pct} onChange={(e) => setInputs({ ...inputs, developer_profit_target_pct: Number(e.target.value) })} /></div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <button onClick={previewResults} style={{
          padding: '10px 16px', fontSize: 13.5, borderRadius: designTokens.radius.sm,
          border: `1px solid ${c.border}`, background: 'transparent', color: c.textPrimary, cursor: 'pointer',
        }}>
          Calculate
        </button>
        <button onClick={saveScenario} disabled={saving} style={{
          padding: '10px 16px', fontSize: 13.5, fontWeight: 600, borderRadius: designTokens.radius.sm,
          border: 'none', background: c.intelligencePurple, color: '#fff', cursor: saving ? 'default' : 'pointer',
        }}>
          {saving ? 'Saving…' : 'Save Scenario'}
        </button>
      </div>

      {error && <div style={{ color: c.statusRed, fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {results && (
        <div style={{ background: c.surfaceCard, border: `1px solid ${c.border}`, borderRadius: designTokens.radius.sm, padding: 16, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{results.viability_label}</div>
            <button onClick={handleDownload} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
              padding: '6px 12px', borderRadius: designTokens.radius.sm, border: `1px solid ${c.border}`,
              background: 'transparent', color: isLoggedIn ? c.textPrimary : c.textFaint, cursor: 'pointer',
            }}>
              {isLoggedIn ? <Download size={13} /> : <Lock size={13} />}
              {isLoggedIn ? 'Download Report' : 'Sign in to download'}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, fontSize: 13, marginBottom: 12 }}>
            <div><div style={{ color: c.textMuted, fontSize: 11 }}>GDV</div>{fmt(results.gross_development_value_ngn)}</div>
            <div><div style={{ color: c.textMuted, fontSize: 11 }}>Total costs (excl. land)</div>{fmt(results.total_costs_excl_land_ngn)}</div>
            <div><div style={{ color: c.textMuted, fontSize: 11 }}>Residual Land Value</div>{fmt(results.residual_land_value_ngn)}</div>
          </div>
          {results.residual_margin_pct != null && (
            <div style={{ fontSize: 13, marginBottom: 12 }}>
              Margin vs asking price: <b>{(results.residual_margin_pct * 100).toFixed(1)}%</b>
            </div>
          )}
          <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 8 }}>SENSITIVITY</div>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <tbody>
              {results.sensitivity_results.map((s, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${c.border}` }}>
                  <td style={{ padding: '6px 0' }}>{s.scenario}</td>
                  <td style={{ padding: '6px 0', textAlign: 'right' }}>{fmt(s.residual_land_value_ngn)}</td>
                  <td style={{ padding: '6px 0', textAlign: 'right', color: c.textMuted }}>{s.viability_label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {savedScenarios.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 8 }}>SAVED SCENARIOS FOR THIS SITE</div>
          {savedScenarios.map((s) => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${c.border}`, fontSize: 13 }}>
              <span>{s.scenario_name}</span>
              <span style={{ color: c.textMuted }}>{s.viability_label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}