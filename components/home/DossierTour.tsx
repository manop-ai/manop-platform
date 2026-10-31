'use client'
// components/home/DossierTour.tsx — an interactive walk through what a MANOP dossier contains. Every figure on it is an ILLUSTRATIVE EXAMPLE,
// labelled as such on screen; it is not data about any real development.
import { useState } from 'react'

const STEPS = [
  { id: 'overview', t: 'The development', s: 'Location, stage, units, handover.', h: 'Start with the facts that matter', d: 'Each dossier starts with what was provided: where the development is, how far along it is, how many units there are, and when it is due.',
    body: (<div className="hm-pr"><div><small>Stage</small><b>Foundation</b></div><div><small>Units</small><b>18</b></div><div><small>Handover</small><b>Jun 2028</b></div><div><small>Units from</small><b>₦338m</b></div></div>) },
  { id: 'evidence', t: 'The evidence', s: 'Every claim, with where it came from.', h: 'See what is backed and what is only claimed', d: 'Each claim is tagged by its source. A developer’s own statement is never shown as if MANOP had confirmed it. Filter by status or topic.',
    body: (<>
      <div className="hm-meter" style={{ marginBottom: 14 }}><i style={{ flex: 2, background: '#3B82F6' }} /><i style={{ flex: 2, background: 'var(--hm-teal)' }} /><i style={{ flex: 3, background: 'var(--hm-amber)' }} /><i style={{ flex: 1, background: 'var(--hm-faint)' }} /></div>
      <div className="hm-mini">
        <div className="c" style={{ borderLeftColor: '#3B82F6' }}>Survey plan matches the stated plot size.<small style={{ color: '#3B82F6' }}>Documented</small></div>
        <div className="c" style={{ borderLeftColor: 'var(--hm-amber)' }}>Building permit granted.<small style={{ color: 'var(--hm-amber)' }}>Developer-stated</small></div>
        <div className="c" style={{ borderLeftColor: 'var(--hm-faint)' }}>Environmental assessment status.<small style={{ color: 'var(--hm-faint)' }}>Unknown</small></div>
      </div></>) },
  { id: 'review', t: 'The MANOP review', s: 'What was examined, and what is uncertain.', h: 'See what was examined and what still needs confirming', d: 'In plain language: what MANOP examined, what remains uncertain, and what needs independent professional confirmation. Not a recommendation, and never advice.',
    body: (<div className="hm-mini"><div className="c" style={{ borderLeftColor: 'var(--hm-teal)' }}>We examined the brochure, the published unit schedule and the stated handover window.<small style={{ color: 'var(--hm-teal)' }}>What was examined</small></div><div className="c" style={{ borderLeftColor: 'var(--hm-amber)' }}>Title and approvals are not yet independently verified.<small style={{ color: 'var(--hm-amber)' }}>What remains uncertain</small></div><div className="c" style={{ borderLeftColor: 'var(--hm-violet)' }}>Title and approvals should be confirmed by a qualified lawyer and surveyor before any commitment.<small style={{ color: 'var(--hm-violet)' }}>Needs independent professional confirmation</small></div></div>) },
  { id: 'price', t: 'The price and plan', s: 'Unit prices and payment plans.', h: 'Understand the money before you commit', d: 'Published prices by unit type, the developer’s payment plan where one exists, and a dated naira-to-dollar reference for buyers abroad.',
    body: (<div className="hm-pr"><div><small>2-bedroom apartment</small><b>₦508,000,000</b></div><div><small>Deposit (30%)</small><b>₦152,400,000</b></div></div>) },
  { id: 'progress', t: 'The progress', s: 'Construction updates, labelled by who reported them.', h: 'Follow construction over time', d: 'A timeline of updates. Each one says who reported it, so a developer’s report is not confused with something MANOP confirmed.',
    body: (<div className="hm-mini"><div className="c" style={{ borderLeftColor: 'var(--hm-green)' }}>Piling completed.<small style={{ color: 'var(--hm-green)' }}>MANOP-confirmed</small></div><div className="c" style={{ borderLeftColor: 'var(--hm-amber)' }}>Contractor mobilised on site.<small style={{ color: 'var(--hm-amber)' }}>Reported by the developer</small></div></div>) },
]

export default function DossierTour() {
  const [a, setA] = useState(0)
  const s = STEPS[a]
  return (
    <div className="hm-tour">
      <div className="hm-steps" role="tablist" aria-label="Parts of a dossier">
        {STEPS.map((x, i) => (
          <button key={x.id} role="tab" className="hm-step" aria-selected={i === a} onClick={() => setA(i)}>
            <span className="n">{i + 1}</span>
            <span>{x.t}<small>{x.s}</small></span>
          </button>
        ))}
      </div>
      <div className="hm-stage" role="tabpanel">
        <span className="hm-tag">Illustrative example — not a real development</span>
        <h3>{s.h}</h3>
        <p className="d">{s.d}</p>
        {s.body}
      </div>
    </div>
  )
}