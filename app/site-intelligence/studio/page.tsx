// app/site-intelligence/studio/page.tsx
//
// Public introduction to MANOP Site Studio. A STATIC route at this exact path (Next.js resolves it before app/site-intelligence/[id]/page.tsx,
// which is what fixed the earlier "Site not found" when "studio" was read as a site id).
//
// Server component: the theme follows the site-wide light/dark choice (html[data-theme]) with no flash, and the page carries real metadata for search.
// Every capability statement below was checked against the implementation (app/site-intelligence/[id]/studio/page.tsx, lib/scenario-templates.ts,
// lib/development-presets.ts). What is NOT available yet is listed on the page, in plain words.
//
// The interface picture is an illustrative drawing built from plain SVG, labelled as such. It is not a screenshot and not a real site.
import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, Search, Sliders, Boxes, LineChart } from 'lucide-react'
import '../../../components/home/home.css'
import '../../../components/public/pub.css'
import TypologyIcon from '../../../components/TypologyIcon'
import { SITE_URL } from '../../../lib/market-intelligence'

export const metadata: Metadata = {
  title: 'Site Studio | MANOP',
  description: 'Explore what a site could become. Site Studio is MANOP’s spatial workspace for viewing a site and its surroundings, testing indicative development scenarios in 2D and 3D, and carrying them into Construction Appraisal.',
  alternates: { canonical: `${SITE_URL}/site-intelligence/studio` },
  openGraph: { title: 'Site Studio | MANOP', description: 'A spatial workspace for exploring what a site could become, with every reading marked as fact, assumption, derived value or unknown.', url: `${SITE_URL}/site-intelligence/studio`, type: 'website' },
}

const WITH_WITHOUT = [
  { t: 'Site intake', w: 'Open a site and see its context straight away: location, area, planning evidence and what is still unconfirmed. No blank canvas.', o: 'Days waiting on a feasibility study just to know whether a parcel is worth pursuing.' },
  { t: 'Deal scenarios', w: 'Start from a development preset, then test alternatives side by side (storeys, coverage, unit mix) and compare them directly.', o: 'Every new configuration means another round with an architect before it can be compared with the last.' },
  { t: 'Deal economics', w: 'A scenario’s unit counts and build area carry straight into Construction Appraisal, with no re-typing into a separate spreadsheet.', o: 'The site plan lives in one place and the numbers in another. Each geometry change means rebuilding the model by hand.' },
  { t: 'Sharing', w: 'Share a read-only link to a scenario report. No MANOP account is needed on the other end.', o: 'A question comes up mid-meeting that the plan on the wall cannot answer, and momentum stalls.' },
]

const AVAILABLE = [
  'Map and satellite views of the site, with its boundary',
  'Controlled 2D and 3D views',
  'Buildings and open space as editable scenario objects: draw, move, resize and rotate',
  'Starter layouts generated from a development preset, as scenario assumptions',
  'Scenario readings such as floor area, units and parking, each marked as fact, assumption, derived or unknown',
  'A read-only share link and report for a scenario',
  'Carrying a scenario’s quantities into Construction Appraisal',
]
const NOT_YET = [
  'Zoning, roads and planning map layers',
  'Split view',
  'Access as a placed scenario object',
  'Parking as a placed, editable object. Today it is an indicative area preview',
  'Detailed quantity take-offs and cost plans in Construction Appraisal',
]

function Mock() {
  return (
    <div className="pg-mock" aria-hidden="true">
      <div className="bar"><b>MANOP Site Studio</b><span>Site workspace</span><span className="sw"><i>2D</i><i>3D</i></span></div>
      <div className="body">
        <div className="side l">
          {['Site area', 'Coverage', 'Storeys', 'Open space'].map(l => <div key={l}>{l}<i /></div>)}
        </div>
        <svg className="map" viewBox="0 0 500 340" preserveAspectRatio="xMidYMid slice">
          <defs><pattern id="g" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M26 0H0V26" fill="none" stroke="currentColor" strokeOpacity=".08" /></pattern></defs>
          <rect width="500" height="340" fill="url(#g)" style={{ color: 'var(--hm-text)' }} />
          <polygon points="90,60 420,40 460,290 60,300" fill="rgba(20,184,166,.07)" stroke="#14B8A6" strokeWidth="2" />
          <polygon points="120,90 395,72 428,262 92,270" fill="none" stroke="#A78BFA" strokeWidth="1.2" strokeDasharray="6 5" />
          <rect x="140" y="120" width="96" height="132" rx="3" fill="#5B2EFF" />
          <rect x="150" y="130" width="76" height="112" rx="2" fill="none" stroke="#fff" strokeOpacity=".25" />
          <rect x="258" y="150" width="76" height="102" rx="3" fill="#7C5FFF" />
          <rect x="344" y="188" width="62" height="62" rx="3" fill="#2DD4BF" fillOpacity=".35" stroke="#2DD4BF" strokeOpacity=".7" />
        </svg>
        <div className="side r">
          <div style={{ fontWeight: 700, color: 'var(--hm-muted)', marginBottom: 10 }}>SCENARIO READINGS</div>
          {[['Floor area', 'sample'], ['Units', 'sample'], ['Parking', 'sample']].map(([l, v]) => <div key={l}>{l}<b>{v}</b></div>)}
        </div>
      </div>
      <span className="pg-tag">Illustrative interface, not a real site</span>
    </div>
  )
}

export default function SiteStudioLandingPage() {
  return (
    <div className="hm">
      {/* HERO */}
      <section className="pg-hero">
        <div className="hm-wrap pg-two">
          <div>
            <span className="hm-eyebrow">Site Studio</span>
            <h1 className="pg-h1">Explore what a site could become.</h1>
            <p className="pg-lead">Site Studio turns site evidence, planning context and development assumptions into a spatial workspace: scenarios you can see, move and reshape in 2D and 3D, with every reading marked as fact, assumption, derived value or unknown.</p>
            <p className="pg-small">Built first for developers working across Nigeria and the wider African market. Planners, architects and other professional workflows come once this foundation is proven.</p>
            <div className="pg-cta">
              <Link href="/site-intelligence/sandbox" className="hm-btn p">Open Site Studio <ArrowRight size={16} /></Link>
              <Link href="/site-intelligence" className="hm-btn g">Start from Site Intelligence</Link>
            </div>
            <p className="pg-cta-note">Opens MANOP’s controlled test environment while Site Studio is in active development.</p>
          </div>
          <Mock />
        </div>
      </section>

      {/* WHAT IT DOES */}
      <section className="pg-sec pg-alt">
        <div className="hm-wrap">
          <span className="hm-eyebrow">What it does</span>
          <h2 className="pg-h2">From evidence to a scenario you can test.</h2>
          <div className="pg-cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>
            {[
              { i: Search, t: 'Explore', b: 'Start with a site and its available evidence (location, planning context, constraints) and see what is known before assuming anything.' },
              { i: Sliders, t: 'Configure', b: 'Adjust development assumptions such as storeys, coverage, unit mix and parking, starting from a category-specific starter layout or your own.' },
              { i: Boxes, t: 'Visualise', b: 'See the scenario directly on the site, in 2D and 3D massing. Draw, move, resize and rotate buildings by hand.' },
              { i: LineChart, t: 'Evaluate', b: 'Carry a scenario’s quantities into Construction Appraisal, part of Finance Intelligence, to understand indicative development economics.' },
            ].map(x => (
              <div className="pg-card" key={x.t}>
                <span className="pg-ico"><x.i size={19} /></span>
                <h3>{x.t}</h3>
                <p>{x.b}</p>
              </div>
            ))}
          </div>
          <div className="pg-flow" aria-label="From site to scenario">
            {['Site Intelligence', 'Site context', 'Development scenario', '2D and 3D massing', 'Scenario readings', 'Construction Appraisal'].map((s, i, a) => (
              <span key={s} style={{ display: 'contents' }}>
                <span className={`s${i === a.length - 1 ? ' hi' : ''}`}>{s}</span>
                {i < a.length - 1 && <ArrowRight size={15} />}
              </span>
            ))}
          </div>
          <p className="pg-note">Every reading is marked as a fact, an assumption, a derived value or unknown. Site Studio never presents an assumption as if it were planning approval.</p>
        </div>
      </section>

      {/* BUILT FOR DEVELOPERS */}
      <section className="pg-sec">
        <div className="hm-wrap">
          <span className="hm-eyebrow">Built for developers</span>
          <h2 className="pg-h2">From a site to a scenario you can act on.</h2>
          <div className="pg-rows">
            {WITH_WITHOUT.map(r => (
              <div className="pg-row" key={r.t}>
                <b>{r.t}</b>
                <div className="w"><small>WITH MANOP</small><p>{r.w}</p></div>
                <div className="o"><small>WITHOUT IT</small><p>{r.o}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TYPOLOGIES */}
      <section className="pg-sec pg-alt">
        <div className="hm-wrap">
          <span className="hm-eyebrow">Development types</span>
          <h2 className="pg-h2">Starting with multifamily residential.</h2>
          <p className="hm-lead">Multifamily has the most developed starter layout today: its own massing and unit-mix logic, generated as real, editable buildings. Four other categories have simpler starter presets. The rest are planned, in the order development activity in Nigeria calls for them.</p>
          <div className="pg-typ">
            {([
              { kind: 'multifamily_residential', label: 'Multifamily', s: 'Developed starter layout' },
              { kind: 'mixed_use', label: 'Mixed use', s: 'Simple starter preset' },
              { kind: 'townhouse', label: 'Townhouse', s: 'Simple starter preset' },
              { kind: 'single_family_residential', label: 'Single family', s: 'Simple starter preset' },
              { kind: 'commercial', label: 'Commercial', s: 'Simple starter preset' },
            ] as const).map(t => (
              <div key={t.kind}>
                <TypologyIcon kind={t.kind} size={64} />
                <b>{t.label}</b><em>{t.s}</em>
              </div>
            ))}
            {['Hospitality', 'Industrial', 'Retail'].map(l => (
              <div className="p" key={l}>
                <TypologyIcon kind="commercial" size={64} />
                <b>{l}</b><em>Planned</em>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AVAILABLE / NOT YET */}
      <section className="pg-sec">
        <div className="hm-wrap">
          <span className="hm-eyebrow">Where it stands</span>
          <h2 className="pg-h2">What works today, and what does not yet.</h2>
          <div className="pg-split">
            <div className="pg-box yes"><h3>Available today</h3><ul>{AVAILABLE.map(a => <li key={a}>{a}</li>)}</ul></div>
            <div className="pg-box no"><h3>Not available yet</h3><ul>{NOT_YET.map(a => <li key={a}>{a}</li>)}</ul></div>
          </div>
        </div>
      </section>

      {/* CLOSE */}
      <section className="pg-alt">
        <div className="hm-wrap pg-close">
          <h2>Ready to explore a site?</h2>
          <div className="pg-cta" style={{ justifyContent: 'center' }}>
            <Link href="/site-intelligence/sandbox" className="hm-btn p">Open Site Studio <ArrowRight size={16} /></Link>
            <Link href="/finance" className="hm-btn g">See Finance Intelligence</Link>
          </div>
          <p className="pg-fine" style={{ margin: '24px auto 0' }}>Scenarios are indicative explorations built on your assumptions. They are not designs, engineering, planning approval or investment advice.</p>
        </div>
      </section>
    </div>
  )
}