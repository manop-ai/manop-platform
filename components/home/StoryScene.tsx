'use client'
// components/home/StoryScene.tsx — "From the ground up": a scroll-linked architectural story of how MANOP's capabilities connect.
//
// The 3D scene (storyScene3d.ts) is a CONCEPTUAL explanation, not a real site, design, approval, finance offer or recommendation, and the page says so.
// Each stage names its real status, taken from what the codebase actually implements today:
//   Site Intelligence ........ live (/site-intelligence; Quick Review, published profiles)
//   Site Studio .............. live (/site-intelligence/studio); zoning, roads and planning map layers are not available yet
//   Development Intelligence . live for selected, reviewed developments (/developments)
//   Construction Appraisal ... live (residual land value, sensitivity). Quantity take-offs and cost plans are NOT part of it
//   Market Intelligence ...... live; depth varies by location (/markets)
//   Finance Intelligence ..... partly live: affordability, payment plans, investment analysis. Lender/NHF/diaspora matching in development (/finance)
//   Decision Intelligence .... taking shape; not a separate product
//
// Progressive enhancement: the full text of every stage is in the page as a plain list (also read by screen readers and search engines). Reduced motion
// shows the finished scene as a still picture with the stages listed beneath it; no WebGL, or any error, shows the stage list only.
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import './story.css'

type Kind = 'live' | 'partial' | 'dev' | 'vision'
const KIND_LABEL: Record<Kind, string> = { live: 'Available today', partial: 'Partly available', dev: 'In development', vision: 'Taking shape' }

interface Stage {
  id: string; name: string; kind: Kind; head: string; body: string; tags: string[]; note?: string
  href?: string; cta?: string
}

const STAGES: Stage[] = [
  { id: 's1', name: 'Site Intelligence', kind: 'live', head: 'Start with the land.',
    body: 'Location, access, infrastructure and planning context for a plot, with every finding marked by how well it is evidenced.',
    tags: ['Location', 'Roads and infrastructure', 'Planning context'],
    note: 'Quick Review and published site profiles are live.', href: '/site-intelligence', cta: 'Explore Site Intelligence' },
  { id: 's2', name: 'Site Studio', kind: 'live', head: 'Explore the site spatially.',
    body: 'A spatial workspace to view a site boundary and its surroundings, and to test indicative building scenarios on the plot.',
    tags: ['Boundary and map', '2D and 3D view', 'Indicative scenarios'],
    note: 'Zoning, roads and planning map layers are not available yet.', href: '/site-intelligence/studio', cta: 'See Site Studio' },
  { id: 's3', name: 'Development Intelligence', kind: 'live', head: 'Understand what is being built.',
    body: 'A structured dossier for a development: what the developer states, the evidence behind it, the unit schedule, documents and progress, with MANOP’s review.',
    tags: ['Claims and evidence', 'Units and pricing', 'Documents and progress'],
    note: 'Available for selected developments. Review depth varies.', href: '/developments', cta: 'Browse reviewed developments' },
  { id: 's4', name: 'Construction Appraisal', kind: 'live', head: 'Examine the economics of building it.',
    body: 'From your own assumptions: build cost, other costs, contingency, finance cost and required profit, leading to an indicative residual land value with sensitivity.',
    tags: ['Build and other costs', 'Residual land value', 'Sensitivity'],
    note: 'Quantity take-offs and detailed cost plans are not part of it yet.', href: '/site-intelligence/studio', cta: 'Start in Site Studio' },
  { id: 's5', name: 'Market Intelligence', kind: 'live', head: 'See the market around it.',
    body: 'What MANOP knows about a location: evidence, development activity and market research, shown only where it exists.',
    tags: ['Location context', 'Development activity', 'Research and notes'],
    note: 'Coverage varies by location and grows as evidence is added.', href: '/markets', cta: 'Explore markets' },
  { id: 's6', name: 'Finance Intelligence', kind: 'partial', head: 'Understand the financial possibilities.',
    body: 'Two sides around one development. Buyers: affordability and the cashflow of a developer’s payment plan. Investors and developers: investment analysis and development economics.',
    tags: ['Affordability', 'Payment plans', 'Investment analysis'],
    note: 'Matching to lender, NHF and diaspora products is in development. MANOP is not a lender and does not arrange or approve finance.', href: '/finance', cta: 'See Finance Intelligence' },
  { id: 's7', name: 'Decision Intelligence', kind: 'vision', head: 'Bring it together.',
    body: 'Not a separate product. It is what emerges when site evidence, development information, market context and financial analysis are read side by side, with risks and open questions kept visible.',
    tags: ['Evidence', 'Analysis', 'Open questions'],
    note: 'Early steps today: development dossiers, saved analyses and buyer packs. Information for your own decision, not a recommendation.', href: '/developments', cta: 'See it in a reviewed development' },
]

const LABELS: { k: string; stage: number; text: string }[] = [
  { k: 'f_pay', stage: 5, text: 'Payment plan and affordability' },
  { k: 'f_path', stage: 5, text: 'Financing pathways (information only)' },
  { k: 'l_site', stage: 6, text: 'Site evidence' },
  { k: 'l_dev', stage: 6, text: 'Development information' },
  { k: 'l_market', stage: 6, text: 'Market context' },
  { k: 'l_fin', stage: 6, text: 'Financial analysis' },
  { k: 'l_risk', stage: 6, text: 'Risks and opportunities' },
]

type Mode = 'pending' | '3d' | 'still' | 'list'

export default function StoryScene() {
  const trackRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasWrap = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lineRef = useRef<SVGLineElement>(null)
  const dotRef = useRef<SVGCircleElement>(null)
  const panelRefs = useRef<(HTMLElement | null)[]>([])
  const labelRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const api = useRef<any>(null)
  const raf = useRef(0)
  const activeRef = useRef(0)
  const [active, setActive] = useState(0)
  const [mode, setMode] = useState<Mode>('pending')
  const [ready, setReady] = useState(false)

  const overlay = useCallback(() => {
    const a = api.current, st = stageRef.current, cw = canvasWrap.current
    if (!a || !st || !cw) return
    const sr = st.getBoundingClientRect(), cr = cw.getBoundingClientRect()
    const ox = cr.left - sr.left, oy = cr.top - sr.top
    const i = activeRef.current
    const pt = a.project(STAGES[i].id)
    const panel = panelRefs.current[i]
    const line = lineRef.current, dot = dotRef.current
    if (line && dot && panel && pt.visible) {
      const pr = panel.getBoundingClientRect()
      const wide = sr.width >= 900
      const x1 = ox + pt.x, y1 = oy + pt.y
      const x2 = wide ? pr.left - sr.left : pr.left - sr.left + pr.width / 2
      const y2 = wide ? pr.top - sr.top + 44 : pr.top - sr.top
      line.setAttribute('x1', String(x1)); line.setAttribute('y1', String(y1)); line.setAttribute('x2', String(x2)); line.setAttribute('y2', String(y2))
      dot.setAttribute('cx', String(x1)); dot.setAttribute('cy', String(y1))
      line.style.opacity = '1'; dot.style.opacity = '1'
    } else if (line && dot) { line.style.opacity = '0'; dot.style.opacity = '0' }
    for (const l of LABELS) {
      const el = labelRefs.current[l.k]; if (!el) continue
      const q = a.project(l.k)
      el.style.transform = `translate(${ox + q.x}px, ${oy + q.y}px) translate(-50%, -140%)`
    }
  }, [])

  // Decide how to present: reduced motion → still picture; no WebGL → list.
  useEffect(() => {
    let cancelled = false
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const mobile = window.matchMedia('(max-width: 899px)').matches
    let io: IntersectionObserver | null = null
    let ro: ResizeObserver | null = null
    let onScroll: (() => void) | null = null
    let onResize: (() => void) | null = null

    const hasGL = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false } })()
    if (!hasGL) { setMode('list'); return }
    setMode(reduced ? 'still' : '3d')

    const start = async () => {
      try {
        const mod = await import('./storyScene3d')
        if (cancelled || !canvasRef.current || !canvasWrap.current) return
        const scene = mod.createScene(canvasRef.current, { mobile })
        if (cancelled) { scene.dispose(); return }
        api.current = scene
        const size = () => { const el = canvasWrap.current; if (cancelled || !el) return; const r = el.getBoundingClientRect(); scene.resize(r.width, r.height) }
        size()
        ro = new ResizeObserver(() => { if (cancelled || !canvasWrap.current) return; size(); scene.jump(reduced ? 1 : progress()); overlay() }); ro.observe(canvasWrap.current)

        if (reduced) { scene.jump(1); setReady(true); return }

        const progress = () => {
          const t = trackRef.current, s = stageRef.current
          if (!t || !s) return 0
          const r = t.getBoundingClientRect()
          return Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - s.clientHeight)))
        }
        let last = performance.now(), running = false
        const tick = (now: number) => {
          const dt = Math.min(0.05, (now - last) / 1000); last = now
          const more = scene.frame(dt); overlay()
          if (more) raf.current = requestAnimationFrame(tick); else running = false
        }
        const kick = () => { if (!running) { running = true; last = performance.now(); raf.current = requestAnimationFrame(tick) } }
        let near = true
        onScroll = () => {
          if (cancelled || !near || !trackRef.current || !stageRef.current) return
          const p = progress()
          scene.setProgress(p)
          const idx = Math.min(STAGES.length - 1, Math.floor(p * STAGES.length))
          if (idx !== activeRef.current) { activeRef.current = idx; setActive(idx) }
          kick()
        }
        onResize = () => { if (cancelled || !trackRef.current) return; onScroll?.(); scene.jump(progress()); overlay() }
        scene.jump(progress())
        window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onResize)
        io = new IntersectionObserver(es => { near = es[0].isIntersecting; if (near) onScroll?.() }, { rootMargin: '300px 0px' })
        io.observe(trackRef.current!)
        onScroll(); setReady(true)
        requestAnimationFrame(overlay)
      } catch (e) {
        console.warn('Story scene unavailable, showing the list instead.', e)
        if (!cancelled) setMode('list')
      }
    }

    // Load the 3D code only when the section is about to be seen.
    const watcher = new IntersectionObserver(es => { if (es[0].isIntersecting) { watcher.disconnect(); start() } }, { rootMargin: '900px 0px' })
    watcher.observe(trackRef.current!)

    return () => {
      cancelled = true; watcher.disconnect(); io?.disconnect(); ro?.disconnect()
      if (onScroll) window.removeEventListener('scroll', onScroll)
      if (onResize) window.removeEventListener('resize', onResize)
      cancelAnimationFrame(raf.current); api.current?.dispose?.(); api.current = null
    }
  }, [overlay])

  // Keep the connector line on the right place when the stage changes.
  useEffect(() => { const id = requestAnimationFrame(() => overlay()); return () => cancelAnimationFrame(id) }, [active, overlay, ready])

  const goTo = (i: number) => {
    const t = trackRef.current, s = stageRef.current; if (!t || !s) return
    const top = t.getBoundingClientRect().top + window.scrollY
    const span = t.offsetHeight - s.clientHeight
    window.scrollTo({ top: top + ((i + 0.5) / STAGES.length) * span, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }

  const interactive = mode === '3d'
  return (
    <div className={`hm3 hm3-${mode === "list" ? "list-mode" : mode}`}>
      <div className="hm3-head">
        <span className="hm-eyebrow">From the ground up</span>
        <h2 className="hm-h2" style={{ color: '#fff' }}>One development, seen from every side.</h2>
        <p className="hm-lead" style={{ color: '#94A3B8' }}>Real estate is more than a building. It starts with understanding the land, then what can be built, what it may cost, the market around it and the finance behind it. Scroll to watch how MANOP’s capabilities connect, and which of them are available today.</p>
      </div>

      <div ref={trackRef} className="hm3-track" style={{ ['--n' as any]: STAGES.length }}>
        <div ref={stageRef} className="hm3-stage">
          <div ref={canvasWrap} className={`hm3-canvas${ready ? ' ready' : ''}`} role="img"
            aria-label="Conceptual 3D illustration: a plot of land, then a building rising on it, surrounded by roads, neighbouring developments, finance layers and connected information layers. The seven stages are described in the list that follows.">
            <canvas ref={canvasRef} />
            <div className="hm3-cap">Conceptual illustration of how MANOP’s capabilities connect. Not a real site, design, approval, finance offer or recommendation.</div>
          </div>

          <svg className="hm3-svg" aria-hidden="true">
            <line ref={lineRef} x1="0" y1="0" x2="0" y2="0" />
            <circle ref={dotRef} r="5" cx="0" cy="0" />
          </svg>
          {interactive && LABELS.map(l => (
            <div key={l.k} ref={el => { labelRefs.current[l.k] = el }} className={`hm3-label${active === l.stage ? ' on' : ''}`} aria-hidden="true">{l.text}</div>
          ))}

          <ol className="hm3-rail" aria-label="Stages">
            {STAGES.map((s, i) => (
              <li key={s.id}>
                <button type="button" onClick={() => goTo(i)} aria-label={`Go to stage ${i + 1}: ${s.name}`} aria-current={i === active ? 'step' : undefined} className={i === active ? 'on' : i < active ? 'done' : ''}>
                  <i />
                </button>
              </li>
            ))}
            <li className="hm3-railname" aria-hidden="true">{active + 1} / {STAGES.length} · {STAGES[active].name}</li>
          </ol>

          <div className="hm3-panels">
            {STAGES.map((s, i) => (
              <aside key={s.id} ref={el => { panelRefs.current[i] = el }} className={`hm3-panel${i === active ? ' on' : ''}`} aria-hidden={interactive && i !== active ? true : undefined}>
                <div className="hm3-k"><span>{i + 1} of {STAGES.length}</span><b>{s.name}</b><em className={`st ${s.kind}`}>{KIND_LABEL[s.kind]}</em></div>
                <h3>{s.head}</h3>
                <p>{s.body}</p>
                <ul>{s.tags.map(t => <li key={t}>{t}</li>)}</ul>
                {s.note && <p className="note">{s.note}</p>}
                {s.href && <Link href={s.href} className="hm3-link" tabIndex={interactive && i !== active ? -1 : undefined}>{s.cta} <ArrowRight size={14} /></Link>}
              </aside>
            ))}
          </div>
        </div>
      </div>

      <div className="hm3-out">
        <p className="hm3-close">From site to development. From market understanding to financial possibilities. One connected intelligence layer for better-informed real estate decisions.</p>
        <div className="hm3-aud">
          <div><b>Developers</b><span>Bring structure, evidence and intelligence to a development, from the site to the market.</span></div>
          <div><b>Investors</b><span>See how an opportunity connects to market context and financial analysis.</span></div>
          <div><b>Buyers</b><span>Understand the development, what it costs and how payment plans affect affordability.</span></div>
          <div><b>Agencies and landowners</b><span>Bring authorised opportunities into a structured, evidence-based environment.</span></div>
        </div>
        <p className="hm3-fine">These are connected capabilities, not seven separate products, and they are at different stages of depth. MANOP provides information and analysis for your own decision. It is not a lender and does not approve or arrange finance.</p>
      </div>

      {/* Plain-text version of every stage: read by screen readers and search engines, and the whole experience when 3D is unavailable. */}
      <section className="hm3-list" aria-label="The seven stages, in text">
        <h3 className="hm3-sr">How MANOP’s capabilities connect, stage by stage</h3>
        <ol>
          {STAGES.map(s => (
            <li key={s.id}>
              <b>{s.name}</b> <em className={`st ${s.kind}`}>{KIND_LABEL[s.kind]}</em>
              <p>{s.head} {s.body} {s.note}</p>
              {s.href && <Link href={s.href}>{s.cta}</Link>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}