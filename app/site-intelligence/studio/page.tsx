'use client'
// app/site-intelligence/studio/page.tsx
//
// Public introduction to MANOP Site Studio. A STATIC route at this
// exact path — Next.js resolves it before the dynamic
// app/site-intelligence/[id]/page.tsx for /site-intelligence/studio,
// which is what fixed the earlier "Site not found" (that URL used to
// fall through to the site-lookup route with "studio" read as an id).
//
// Kept under the normal public NavBar/Footer (DashboardShell only
// suppresses those for the actual workspace routes) — this is a
// marketing/introduction page, not the workspace itself.
//
// Client component so it actually FOLLOWS the global light/dark
// toggle live (getInitialDark + listenTheme — the same pattern the
// Studio workspace itself uses), rather than only reading the
// preference once per server render.
//
// The hero panel is a real, accurate mockup of Site Studio's actual
// UI and visual language (the same toolbar layout, the same purple
// facade-textured massing, the same green open-space objects) — not
// a stock architectural render implying capability that doesn't
// exist. Once real product screenshots are worth capturing, this is
// the panel to replace with one.

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getInitialDark, listenTheme, getDesignColors, designTokens } from '../../../lib/theme'
import ManopLogo from '../../../components/ManopLogo'
import TypologyIcon from '../../../components/TypologyIcon'
import { ArrowRight, Search, Sliders, Boxes, LineChart } from 'lucide-react'

export default function SiteStudioLandingPage() {
  const [dark, setDark] = useState(getInitialDark)
  useEffect(() => { return listenTheme(setDark) }, [])
  const c = getDesignColors(dark)

  return (
    <div style={{ background: c.background, color: c.textPrimary, fontFamily: designTokens.font.family }}>

      {/* ── HERO ──────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '72px 24px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <ManopLogo dark={dark} iconOnly height={26} />
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: c.intelligencePurple }}>SITE STUDIO</span>
        </div>

        <h1 style={{
          fontSize: 'clamp(40px, 6.5vw, 76px)', fontWeight: 800, lineHeight: 0.98, letterSpacing: '-0.02em',
          margin: '0 0 22px', maxWidth: 920,
        }}>
          Explore what a site<br />could become.
        </h1>
        <p style={{ fontSize: 17, color: c.textMuted, lineHeight: 1.6, marginBottom: 8, maxWidth: 520 }}>
          MANOP Site Studio turns site evidence, planning context, and development assumptions into a real
          spatial workspace — scenarios you can see, move, and reshape in 2D and 3D, backed by a deterministic
          engine and every value marked as fact, assumption, or unknown.
        </p>
        <p style={{ fontSize: 13, color: c.textFaint, marginBottom: 32, maxWidth: 520 }}>
          Built first for developers working across Nigeria and the wider African market — planners, architects,
          and other professional workflows follow once this foundation is proven.
        </p>
        <Link
          href="/site-intelligence/sandbox"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700,
            padding: '15px 26px', borderRadius: designTokens.radius.sm, background: c.intelligencePurple,
            color: '#fff', textDecoration: 'none',
          }}
        >
          Explore Site Studio <ArrowRight size={17} />
        </Link>

        {/* Product mockup panel — Studio's real toolbar layout and
            real visual language, not a stock render. */}
        <div style={{ marginTop: 56 }}>
          <StudioMockupPanel c={c} dark={dark} />
        </div>
      </div>

      {/* ── BUILT FOR DEVELOPERS — With / Without MANOP ────────── */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '56px 24px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: c.intelligencePurple, marginBottom: 10 }}>BUILT FOR DEVELOPERS</div>
        <h2 style={{ fontSize: 'clamp(26px, 3.4vw, 38px)', fontWeight: 800, marginBottom: 36, maxWidth: 700, lineHeight: 1.1 }}>
          From a site to a scenario you can act on — without waiting on the next call.
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[
            {
              title: 'Site Intake',
              withText: "Open a site and see its context immediately — location, area, planning evidence, and what's still unconfirmed. No blank canvas.",
              withoutText: 'Days waiting on a feasibility study just to know whether a parcel is worth pursuing further.',
            },
            {
              title: 'Deal Scenarios',
              withText: 'Generate a starter layout from a development preset, then test alternatives side by side — storeys, coverage, unit mix — and compare them directly.',
              withoutText: 'Each new configuration means another round with an architect before you can compare it to the last one.',
            },
            {
              title: 'Deal Economics',
              withText: "A scenario's unit counts and build area carry straight into Construction Appraisal — no re-typing numbers into a separate spreadsheet.",
              withoutText: 'The site plan lives in one place, the numbers in another. Every geometry change means rebuilding the model by hand.',
            },
            {
              title: 'Stakeholder Presentation',
              withText: 'Share a live, read-only link to a scenario — no MANOP account required on the other end — for a partner, investor, or professional to review.',
              withoutText: "A question comes up mid-meeting that the site plan on the wall can't answer, and momentum stalls until the next one.",
            },
          ].map((row, i) => (
            <div key={row.title} style={{
              display: 'grid', gridTemplateColumns: '200px 1fr 1fr', gap: 24, padding: '26px 0',
              borderTop: i === 0 ? `1px solid ${c.border}` : 'none', borderBottom: `1px solid ${c.border}`,
            }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{row.title}</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: c.verificationTeal, marginBottom: 6 }}>WITH MANOP</div>
                <div style={{ fontSize: 13.5, color: c.textMuted, lineHeight: 1.55 }}>{row.withText}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: c.textFaint, marginBottom: 6 }}>WITHOUT IT</div>
                <div style={{ fontSize: 13.5, color: c.textFaint, lineHeight: 1.55 }}>{row.withoutText}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── TYPOLOGY STRIP ───────────────────────────────────── */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '56px 24px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: c.intelligencePurple, marginBottom: 10 }}>BUILT FOR YOUR DEVELOPMENTS</div>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Starting with Multifamily Residential</h2>
        <p style={{ fontSize: 13.5, color: c.textMuted, marginBottom: 32, maxWidth: 560 }}>
          Multifamily is Site Studio's first fully-supported typology today — its own starter massing, its own
          unit-mix logic, generated as real, editable buildings. The others below are on the roadmap, in the
          order development activity in Nigeria calls for them.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
          {([
            { kind: 'multifamily_residential', label: 'Multi-Family', status: 'Live in Site Studio' },
            { kind: 'mixed_use', label: 'Mixed Use', status: 'Live in Site Studio' },
            { kind: 'townhouse', label: 'Townhouse', status: 'Live in Site Studio' },
            { kind: 'single_family_residential', label: 'Single Family', status: 'Live in Site Studio' },
            { kind: 'commercial', label: 'Commercial', status: 'Live in Site Studio' },
          ] as const).map(t => (
            <div key={t.kind} style={{ border: `1px solid ${c.border}`, borderRadius: designTokens.radius.sm, padding: '18px 14px', textAlign: 'center', background: c.surfaceCard }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                <TypologyIcon kind={t.kind} size={64} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{t.label}</div>
              <div style={{ fontSize: 10.5, color: c.verificationTeal, marginTop: 4 }}>{t.status}</div>
            </div>
          ))}
          {['Hospitality', 'Industrial', 'Retail'].map(label => (
            <div key={label} style={{ border: `1px dashed ${c.border}`, borderRadius: designTokens.radius.sm, padding: '18px 14px', textAlign: 'center', opacity: 0.55 }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                <TypologyIcon kind="commercial" size={64} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
              <div style={{ fontSize: 10.5, color: c.textFaint, marginTop: 4 }}>Planned</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── WHAT IT DOES ─────────────────────────────────────── */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '56px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 22 }}>
          <FeatureCard c={c} icon={<Search size={19} />} title="Explore" body="Start with a site and its available evidence — location, planning context, constraints — and see what's known before assuming anything." />
          <FeatureCard c={c} icon={<Sliders size={19} />} title="Configure" body="Adjust development assumptions — storeys, coverage, unit mix, parking — starting from a category-specific starter layout or your own." />
          <FeatureCard c={c} icon={<Boxes size={19} />} title="Visualize" body="See the resulting scenario directly on the site, in 2D and 3D massing — draw, move, resize, and rotate buildings by hand." />
          <FeatureCard c={c} icon={<LineChart size={19} />} title="Evaluate" body="Carry a scenario's quantities straight into Construction Appraisal to understand indicative development economics." />
        </div>
      </div>

      {/* ── FROM SITE TO SCENARIO ───────────────────────────────── */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 24px 90px' }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 28, textAlign: 'center' }}>From site to scenario</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
          {['Site Intelligence', 'Site Context', 'Development Scenario', '2D / 3D Massing', 'Scenario Readings', 'Construction Appraisal'].map((step, i, arr) => (
            <div key={step} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{
                padding: '11px 18px', border: `1px solid ${c.border}`, borderRadius: designTokens.radius.sm,
                background: c.surfaceCard, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
              }}>{step}</div>
              {i < arr.length - 1 && <ArrowRight size={16} color={c.textFaint} style={{ margin: '0 10px', flexShrink: 0 }} />}
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', fontSize: 13, color: c.textFaint, marginTop: 22, maxWidth: 580, marginLeft: 'auto', marginRight: 'auto' }}>
          Every scenario reading is marked as a fact, an assumption, a derived value, or unknown — Site Studio
          never presents an assumption as if it were planning approval.
        </p>
      </div>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${c.border}`, padding: '56px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 18 }}>Ready to explore a site?</div>
        <Link
          href="/site-intelligence/sandbox"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700,
            padding: '15px 26px', borderRadius: designTokens.radius.sm, background: c.intelligencePurple,
            color: '#fff', textDecoration: 'none',
          }}
        >
          Explore Site Studio <ArrowRight size={17} />
        </Link>
        <div style={{ fontSize: 12, color: c.textFaint, marginTop: 12 }}>
          Opens MANOP's controlled test environment while Site Studio is in active development.
        </div>
      </div>
    </div>
  )
}

function FeatureCard({ c, icon, title, body }: { c: ReturnType<typeof getDesignColors>; icon: React.ReactNode; title: string; body: string }) {
  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: designTokens.radius.sm, padding: 22, background: c.surfaceCard }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(109,40,217,0.12)', color: c.intelligencePurple, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        {icon}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 7 }}>{title}</div>
      <div style={{ fontSize: 13.5, color: c.textMuted, lineHeight: 1.6 }}>{body}</div>
    </div>
  )
}

/**
 * A real mockup of Studio's own UI — same toolbar row shape, same
 * left/centre/right layout, same purple facade-textured massing and
 * green open space the actual workspace renders. Built with plain
 * divs/SVG, not a screenshot — accurate to what the product does,
 * not aspirational.
 */
function StudioMockupPanel({ c, dark }: { c: ReturnType<typeof getDesignColors>; dark: boolean }) {
  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 10, overflow: 'hidden', boxShadow: dark ? '0 30px 80px rgba(0,0,0,0.45)' : '0 30px 80px rgba(15,23,42,0.12)' }}>
      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: `1px solid ${c.border}`, background: c.surfaceCard }}>
        <ManopLogo dark={dark} iconOnly height={16} />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: c.textMuted }}>Site Studio</span>
        <div style={{ width: 1, height: 14, background: c.border }} />
        <span style={{ fontSize: 11.5, fontWeight: 600 }}>SITE-000231</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', border: `1px solid ${c.border}`, borderRadius: 4, overflow: 'hidden' }}>
          <span style={{ padding: '3px 9px', fontSize: 10.5, fontWeight: 700, background: c.intelligencePurple, color: '#fff' }}>2D</span>
          <span style={{ padding: '3px 9px', fontSize: 10.5, fontWeight: 700, color: c.textMuted }}>3D</span>
        </div>
      </div>
      {/* body */}
      <div style={{ display: 'flex', height: 340 }}>
        <div style={{ width: 130, borderRight: `1px solid ${c.border}`, background: c.surfaceCard, padding: 12 }}>
          {['Site Area', 'Coverage', 'Storeys', 'Open Space'].map(l => (
            <div key={l} style={{ fontSize: 9.5, color: c.textFaint, marginBottom: 12 }}>{l}<div style={{ height: 4, marginTop: 4, borderRadius: 2, background: c.border, width: '80%' }} /></div>
          ))}
        </div>
        <div style={{ flex: 1, position: 'relative', background: dark ? '#0B1220' : '#EEF2F7' }}>
          <svg viewBox="0 0 500 340" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
            <polygon points="90,60 420,40 460,290 60,300" fill="none" stroke="#0D9488" strokeWidth="2" />
            {[
              { x: 140, y: 120, w: 90, h: 130, fill: '#4C1D95' },
              { x: 260, y: 150, w: 70, h: 100, fill: '#4C1D95' },
              { x: 340, y: 190, w: 60, h: 60, fill: '#22C55E', opacity: 0.35 },
            ].map((r, i) => (
              <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} opacity={r.opacity ?? 1} rx={3} />
            ))}
          </svg>
        </div>
        <div style={{ width: 150, borderLeft: `1px solid ${c.border}`, background: c.surfaceCard, padding: 12 }}>
          <div style={{ fontSize: 9.5, color: c.textMuted, fontWeight: 700, marginBottom: 10 }}>SCENARIO READINGS</div>
          {[['GFA', '3,862 sqm'], ['Units', '32'], ['Parking', '40']].map(([l, v]) => (
            <div key={l} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: c.textFaint }}>{l}</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}