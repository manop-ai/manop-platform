'use client'
// app/site-intelligence/[id]/studio/report/page.tsx
//
// The professional handoff report — the actual capstone of the evidence
// model (FACT/DERIVED/ESTIMATE/ASSUMPTION/UNKNOWN) this whole build has
// been enforcing. Turns a scenario's readings and open Site Intelligence
// investigation items into a document a developer can literally hand to
// a planning consultant, surveyor, architect, QS, or valuer as their
// actual starting brief.
//
// No PDF library anywhere in this codebase (checked package.json before
// building this) and adding one isn't something I can do and verify
// builds without the person running npm install themselves. This page
// is deliberately print-optimised (@media print below) — "Print / Save
// as PDF" uses the browser's own, zero-dependency PDF export. Reliable,
// nothing new to install.
//
// Authenticated only. The public share page has its own, separate,
// deliberately more conservative report view — see its own file for why
// evidence/investigation items are withheld there and not here.

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { sb } from '../../../../../lib/supabase/client'
import { authedFetch } from '../../../../../lib/authed-fetch'
import ManopLogo from '../../../../../components/ManopLogo'
import { Site, InvestigationItem, formatArea } from '../../../../../lib/site-intelligence'
import { DEVELOPMENT_CATEGORY_LABEL } from '../../../../../lib/development-presets'
import { getInitialDark, listenTheme, getDesignColors, designTokens } from '../../../../../lib/theme'
import { buildProfessionalHandoffReport, ProfessionalHandoffReport, ProfessionalType } from '../../../../../lib/investigation-report'
import type { ScenarioReading } from '../../../../../lib/scenario-engine'

const STATUS_LABEL: Record<string, string> = {
  fact: 'FACT', assumption: 'ASSUMPTION', derived: 'DERIVED', estimate: 'ESTIMATE',
  professional_opinion: 'PROFESSIONAL OPINION', unknown: 'UNKNOWN',
}
const PROFESSIONAL_ORDER: ProfessionalType[] = [
  'Planning Consultant', 'Licensed Surveyor', 'Architect', 'Quantity Surveyor', 'Valuer', 'Legal / Title',
]

export default function ScenarioReportPage() {
  const { id: siteId } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const scenarioId = searchParams.get('scenario_id')

  const [dark, setDark] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [report, setReport] = useState<ProfessionalHandoffReport | null>(null)

  useEffect(() => { setDark(getInitialDark()); return listenTheme(setDark) }, [])
  const c = getDesignColors(dark)

  useEffect(() => {
    if (!scenarioId) { setError('No scenario selected.'); setLoading(false); return }
    let cancelled = false
    ;(async () => {
      try {
        const [scenarioRes, siteRow, appraisalsRes, investigationsRes, boundaryRes, exploratoryRes] = await Promise.all([
          authedFetch(`/api/scenarios/${scenarioId}`).then(r => r.json()),
          sb.from('sites').select('*').eq('id', siteId).single(),
          authedFetch(`/api/sites/${siteId}/appraisals`).then(r => r.json()).catch(() => ({ appraisals: [] })),
          sb.from('investigation_items').select('*').eq('site_id', siteId).eq('status', 'open'),
          // sites.boundary is a raw PostGIS column — not usable via a plain
          // select('*') truthy check (and not even declared on the Site type
          // for that reason). Same dedicated RPCs the Studio/shared pages
          // already use.
          sb.rpc('get_site_boundary_geojson', { p_site_id: siteId }),
          sb.rpc('get_site_exploratory_boundary_geojson', { p_site_id: siteId }),
        ])
        if (cancelled) return

        const site = siteRow.data as Site | null
        const scenario = scenarioRes.scenario
        const readings: ScenarioReading[] = scenarioRes.readings || []
        const linkedAppraisal = (appraisalsRes.appraisals || []).find((a: { scenario_id: string | null }) => a.scenario_id === scenarioId)
        const investigationItems: InvestigationItem[] = (investigationsRes.data || []) as InvestigationItem[]
        const boundaryStatus = boundaryRes.data ? 'Confirmed boundary polygon'
          : exploratoryRes.data ? 'Exploratory (user-drawn) boundary — not surveyed'
          : 'Boundary not confirmed — location only'

        setReport(buildProfessionalHandoffReport({
          site: {
            reference: site?.reference ?? null,
            city: site?.city ?? null,
            neighborhood: site?.neighborhood ?? null,
            areaSqm: site?.area_sqm ?? site?.boundary_area_sqm ?? null,
            boundaryStatus,
          },
          scenario: {
            name: scenario.name,
            reference: scenario.reference ?? null,
            developmentCategoryLabel: DEVELOPMENT_CATEGORY_LABEL[scenario.development_category as keyof typeof DEVELOPMENT_CATEGORY_LABEL] || scenario.development_category,
            status: scenario.status,
          },
          readings,
          investigationItems,
          appraisal: linkedAppraisal ? {
            scenarioName: linkedAppraisal.scenario_name,
            grossDevelopmentValueNgn: linkedAppraisal.gross_development_value_ngn,
            totalCostsExclLandNgn: linkedAppraisal.total_costs_excl_land_ngn,
            residualLandValueNgn: linkedAppraisal.residual_land_value_ngn,
            residualMarginPct: linkedAppraisal.residual_margin_pct,
            viabilityLabel: linkedAppraisal.viability_label,
          } : null,
        }))
      } catch {
        if (!cancelled) setError('Could not load this report.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [scenarioId, siteId])

  const shell: React.CSSProperties = { background: c.background, color: c.textPrimary, minHeight: '100vh', fontFamily: designTokens.font.family }

  if (loading || error || !report) {
    return (
      <div style={{ ...shell, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <ManopLogo />
          <p style={{ marginTop: 16, color: c.textMuted }}>{loading ? 'Preparing report…' : error}</p>
        </div>
      </div>
    )
  }

  const fmtNgn = (n: number | null) => n == null ? '—' : `₦${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  const questionsByProfessional = PROFESSIONAL_ORDER
    .map(prof => ({ prof, questions: report.investigationQuestions.filter(q => q.professional === prof) }))
    .filter(g => g.questions.length > 0)

  return (
    <div style={shell}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderBottom: `1px solid ${c.border}` }}>
        <ManopLogo />
        <button
          onClick={() => window.print()}
          style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: designTokens.radius.sm, border: 'none', background: c.intelligencePurple, color: '#fff', cursor: 'pointer' }}
        >
          Print / Save as PDF
        </button>
      </div>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: c.textMuted, marginBottom: 6 }}>
          MANOP Professional Handoff Report
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px' }}>{report.scenario.name}</h1>
        <div style={{ fontSize: 13, color: c.textMuted, marginBottom: 4 }}>
          {report.scenario.reference ? `${report.scenario.reference} · ` : ''}{report.scenario.developmentCategoryLabel}
          {report.site.city ? ` · ${[report.site.neighborhood, report.site.city].filter(Boolean).join(', ')}` : ''}
        </div>
        <div style={{ fontSize: 11.5, color: c.textFaint, marginBottom: 20 }}>
          Generated {new Date(report.generatedAt).toLocaleString()}
        </div>

        <div style={{ padding: 12, background: c.surfaceCard, border: `1px solid ${c.border}`, borderRadius: designTokens.radius.sm, fontSize: 12.5, color: c.textMuted, marginBottom: 24 }}>
          Indicative scenario — not planning approval, final architectural design, valuation, or professional advice.
          Every figure below carries its own evidence status; unknowns are listed explicitly rather than omitted.
        </div>

        <Section title="Site" c={c}>
          <Row c={c} k="Reference" v={report.site.reference || '—'} />
          <Row c={c} k="Area" v={formatArea(report.site.areaSqm)} />
          <Row c={c} k="Boundary" v={report.site.boundaryStatus} />
        </Section>

        <Section title="Readings" c={c}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {report.readings.map(r => (
                <tr key={r.reading_key} style={{ borderTop: `1px solid ${c.border}` }}>
                  <td style={{ padding: '6px 0', color: c.textMuted }}>{r.label}</td>
                  <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 600 }}>
                    {r.numeric_value != null ? `${r.numeric_value.toLocaleString()}${r.unit ? ` ${r.unit}` : ''}` : 'Not currently calculable'}
                  </td>
                  <td style={{ padding: '6px 0 6px 12px', textAlign: 'right', fontSize: 10.5, fontWeight: 700, width: 90, color: r.value_status === 'unknown' ? c.statusRed : r.value_status === 'fact' ? c.verificationTeal : c.intelligencePurple }}>
                    {STATUS_LABEL[r.value_status] || r.value_status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {report.appraisalSummary && (
          <Section title="Construction Appraisal" c={c}>
            <Row c={c} k="Gross Development Value" v={fmtNgn(report.appraisalSummary.grossDevelopmentValueNgn)} />
            <Row c={c} k="Total Costs (excl. land)" v={fmtNgn(report.appraisalSummary.totalCostsExclLandNgn)} />
            <Row c={c} k="Residual Land Value" v={fmtNgn(report.appraisalSummary.residualLandValueNgn)} />
            {report.appraisalSummary.residualMarginPct != null && (
              <Row c={c} k="Residual Margin" v={`${(report.appraisalSummary.residualMarginPct * 100).toFixed(1)}%`} />
            )}
            {report.appraisalSummary.viabilityLabel && <Row c={c} k="Viability" v={report.appraisalSummary.viabilityLabel} />}
          </Section>
        )}

        <Section title="Investigation — what to confirm, and with whom" c={c}>
          {questionsByProfessional.length === 0 ? (
            <p style={{ fontSize: 13, color: c.textMuted }}>No open investigation items or unknowns for this scenario.</p>
          ) : (
            questionsByProfessional.map(({ prof, questions }) => (
              <div key={prof} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>{prof}</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  {questions.map((q, i) => <li key={i} style={{ marginBottom: 4 }}>{q.question}</li>)}
                </ul>
              </div>
            ))
          )}
        </Section>
      </main>
    </div>
  )
}

function Section({ title, c, children }: { title: string; c: ReturnType<typeof getDesignColors>; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 24, pageBreakInside: 'avoid' }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', margin: '0 0 10px', color: c.textMuted }}>{title}</h2>
      {children}
    </section>
  )
}
function Row({ c, k, v }: { c: ReturnType<typeof getDesignColors>; k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', borderTop: `1px solid ${c.border}`, fontSize: 13 }}>
      <span style={{ color: c.textMuted }}>{k}</span><span style={{ textAlign: 'right' }}>{v}</span>
    </div>
  )
}