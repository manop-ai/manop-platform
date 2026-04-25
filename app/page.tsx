'use client'
// app/page.tsx — Manop Homepage
// City/neighborhood cards use real Unsplash photos (free, no key needed)
// All CTAs connected: search, agency onboard, neighborhood pages
// Light/dark mode throughout

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getInitialDark, listenTheme } from '../lib/theme'

// ─── City/neighborhood images from Unsplash (free, no signup) ─
// Each has a real photo of the city/area
const MARKETS = [
  {
    name: 'Lekki Phase 1', city: 'Lagos', country: 'Nigeria', flag: '🇳🇬',
    slug: 'lekki-phase-1', live: true,
    img: 'https://images.unsplash.com/photo-1577948000111-9c970dfe3743?w=600&q=80',
    desc: 'Premium residential corridor',
    stat: '₦285M median 2-bed',
  },
  {
    name: 'Ikoyi', city: 'Lagos', country: 'Nigeria', flag: '🇳🇬',
    slug: 'ikoyi', live: true,
    img: 'https://images.unsplash.com/photo-1569336415962-a4bd9f69c5b7?w=600&q=80',
    desc: 'Lagos prime — ultra HNW enclave',
    stat: '₦400M+ median',
  },
  {
    name: 'Victoria Island', city: 'Lagos', country: 'Nigeria', flag: '🇳🇬',
    slug: 'victoria-island', live: true,
    img: 'https://images.unsplash.com/photo-1580746738099-b543b97b36f7?w=600&q=80',
    desc: 'Commercial and diplomatic hub',
    stat: '₦220M+ median',
  },
  {
    name: 'Ajah', city: 'Lagos', country: 'Nigeria', flag: '🇳🇬',
    slug: 'ajah', live: true,
    img: 'https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=600&q=80',
    desc: 'Fastest growing corridor',
    stat: '9.3% annual appreciation',
  },
  {
    name: 'East Legon', city: 'Accra', country: 'Ghana', flag: '🇬🇭',
    slug: 'east-legon', live: false,
    img: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80',
    desc: 'Accra — premium residential',
    stat: 'Coming soon',
  },
  {
    name: 'Westlands', city: 'Nairobi', country: 'Kenya', flag: '🇰🇪',
    slug: 'westlands', live: false,
    img: 'https://images.unsplash.com/photo-1611348586804-61bf6c080437?w=600&q=80',
    desc: 'Nairobi business district',
    stat: 'Coming soon',
  },
]

const INTELLIGENCE_METRICS = [
  { icon: '◈', label: 'Traditional yield',   desc: 'Real annual rent ÷ sale price. From verified CW data.' },
  { icon: '◉', label: 'Short-let yield',      desc: 'Airbnb/STR return at local occupancy. Free on all property pages.' },
  { icon: '⬡', label: 'Cap rate',             desc: 'Net operating income ÷ price. Beta unlocked.' },
  { icon: '◇', label: 'Cash-on-cash',         desc: 'Return on equity after Nigerian mortgage. Free on all property pages.' },
  { icon: '△', label: 'USD return model',     desc: '10-year income + value chart in USD. Free on all property pages.' },
  { icon: '○', label: 'vs Market median',     desc: 'Is this listing above or below the real bedroom median?' },
]

function resolveSlug(q: string) {
  const m: Record<string, string> = {
    'lekki phase 1':'lekki-phase-1','lekki':'lekki','ikoyi':'ikoyi',
    'victoria island':'victoria-island','vi':'victoria-island',
    'ajah':'ajah','east legon':'east-legon','westlands':'westlands',
    'karen':'karen','kilimani':'kilimani','maitama':'maitama',
  }
  const s = q.toLowerCase().trim()
  for (const [k,v] of Object.entries(m)) { if (s.includes(k)) return v }
  return s.replace(/[^a-z0-9]+/g,'-')
}

export default function Home() {
  const [dark,    setDark]    = useState(true)
  const [query,   setQuery]   = useState('')
  const [focused, setFocused] = useState(false)
  const [ph,      setPh]      = useState('Search any city or neighborhood…')
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  // Animated placeholder
  useEffect(() => {
    const ex = ['Lekki Phase 1, Lagos','East Legon, Accra','Westlands, Nairobi','Ikoyi, Lagos','Karen, Nairobi']
    let i=0,ci=0,dir=1,paused=false
    const tick = () => {
      const word = 'Search ' + ex[i] + '…'
      if (paused) { paused=false; return }
      if (dir===1) { setPh(word.slice(0,ci+1)); ci++; if (ci>=word.length){dir=-1;paused=true} }
      else { setPh(word.slice(0,ci-1)); ci--; if (ci<=7){dir=1;i=(i+1)%ex.length} }
    }
    const id = setInterval(tick, 70)
    return () => clearInterval(id)
  }, [])

  const go = (val?: string) => {
    const q = val || query
    if (!q.trim()) { router.push('/search'); return }
    router.push(`/neighborhood/${resolveSlug(q)}`)
  }

  const v = (d: string, l: string) => dark ? d : l
  const bg      = v('#0F172A','#F8FAFC')
  const bg2     = v('#1E293B','#F1F5F9')
  const bg3     = v('#162032','#FFFFFF')
  const text    = v('#F8FAFC','#0F172A')
  const text2   = v('rgba(248,250,252,0.65)','rgba(15,23,42,0.65)')
  const text3   = v('rgba(248,250,252,0.35)','rgba(15,23,42,0.35)')
  const border  = v('rgba(248,250,252,0.07)','rgba(15,23,42,0.08)')

  return (
    <div style={{ background:bg, minHeight:'100vh', color:text, transition:'background 0.3s, color 0.3s' }}>

      {/* ── HERO ── */}
      <section style={{ position:'relative', overflow:'hidden', padding:'clamp(5rem,11vw,9rem) 2rem clamp(4rem,8vw,7rem)' }}>
        <div style={{ position:'absolute', top:-200, left:'25%', width:700, height:700, borderRadius:'50%', background:dark?'radial-gradient(circle,rgba(91,46,255,0.16) 0%,transparent 70%)':'radial-gradient(circle,rgba(91,46,255,0.06) 0%,transparent 70%)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:-200, right:'5%', width:500, height:500, borderRadius:'50%', background:dark?'radial-gradient(circle,rgba(20,184,166,0.1) 0%,transparent 70%)':'radial-gradient(circle,rgba(20,184,166,0.04) 0%,transparent 70%)', pointerEvents:'none' }} />

        <div style={{ maxWidth:760, margin:'0 auto', textAlign:'center', position:'relative', zIndex:1 }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:'0.5rem', background:dark?'rgba(20,184,166,0.1)':'rgba(20,184,166,0.07)', border:'1px solid rgba(20,184,166,0.25)', borderRadius:100, padding:'0.3rem 0.875rem', fontSize:'0.72rem', fontWeight:600, color:'#14B8A6', letterSpacing:'0.04em', marginBottom:'2rem' }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'#14B8A6', display:'inline-block', animation:'pulse 2s infinite' }} />
            Nigeria · Ghana · Kenya · South Africa — and beyond
          </div>

          <h1 style={{ fontSize:'clamp(2.4rem,6vw,4.8rem)', fontWeight:800, lineHeight:1.02, letterSpacing:'-0.05em', color:text, marginBottom:'1.25rem' }}>
            Invest in African real estate{' '}
            <span style={{ background:'linear-gradient(135deg,#5B2EFF 0%,#14B8A6 100%)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
              with real data.
            </span>
          </h1>

          <p style={{ fontSize:'clamp(1rem,2vw,1.15rem)', color:text2, lineHeight:1.7, maxWidth:520, margin:'0 auto 2.5rem', fontWeight:300 }}>
            Search any city or neighborhood across Africa. See verified yield analysis, real market benchmarks, and currency-adjusted intelligence — before you invest.
          </p>

          {/* Search bar */}
          <div style={{ position:'relative', maxWidth:600, margin:'0 auto' }}>
            <div style={{ display:'flex', background:bg3, border:`1.5px solid ${focused?'#5B2EFF':border}`, borderRadius:14, boxShadow:focused?'0 0 0 4px rgba(91,46,255,0.12), 0 8px 32px rgba(0,0,0,0.12)':dark?'0 4px 24px rgba(0,0,0,0.2)':'0 4px 24px rgba(0,0,0,0.07)', transition:'all 0.2s', overflow:'visible' }}>
              <div style={{ padding:'0 0.875rem 0 1.25rem', display:'flex', alignItems:'center', color:focused?'#5B2EFF':text3, fontSize:'1.1rem', flexShrink:0, transition:'color 0.2s' }}>⌕</div>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={e => e.key === 'Enter' && go()}
                placeholder={ph}
                style={{ flex:1, padding:'1rem 0.5rem', background:'transparent', border:'none', outline:'none', fontSize:'0.95rem', color:text, minWidth:0 }}
              />
              <button onClick={() => go()} style={{ background:'#5B2EFF', color:'#fff', border:'none', padding:'0 1.5rem', fontSize:'0.875rem', fontWeight:600, cursor:'pointer', borderRadius:'0 12px 12px 0', whiteSpace:'nowrap', flexShrink:0, transition:'background 0.15s' }}
                onMouseEnter={e=>(e.currentTarget.style.background='#7C5FFF')}
                onMouseLeave={e=>(e.currentTarget.style.background='#5B2EFF')}>
                Analyze →
              </button>
            </div>
          </div>

          {/* Quick chips */}
          <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', justifyContent:'center', marginTop:'1.25rem' }}>
            <span style={{ fontSize:'0.72rem', color:text3, alignSelf:'center' }}>Try:</span>
            {['Lekki Phase 1, Lagos','Ikoyi, Lagos','East Legon, Accra','Westlands, Nairobi'].map(q => (
              <button key={q} onClick={() => { setQuery(q); go(q) }} style={{ padding:'0.28rem 0.75rem', background:dark?'rgba(91,46,255,0.1)':'rgba(91,46,255,0.06)', border:'1px solid rgba(91,46,255,0.2)', borderRadius:100, cursor:'pointer', fontSize:'0.75rem', fontWeight:500, color:'#7C5FFF', transition:'all 0.15s' }}
                onMouseEnter={e=>{e.currentTarget.style.background='rgba(91,46,255,0.2)';e.currentTarget.style.color='#fff'}}
                onMouseLeave={e=>{e.currentTarget.style.background=dark?'rgba(91,46,255,0.1)':'rgba(91,46,255,0.06)';e.currentTarget.style.color='#7C5FFF'}}>
                {q}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <div style={{ borderTop:`1px solid ${border}`, borderBottom:`1px solid ${border}`, background:dark?'rgba(30,41,59,0.5)':bg2 }}>
        <div style={{ maxWidth:900, margin:'0 auto', padding:'1.5rem 2rem', display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:0 }}>
          {[{val:'51',label:'Live listings'},{val:'4',label:'Countries'},{val:'6',label:'Intel metrics'},{val:'Real',label:'Market data'}].map((s,i) => (
            <div key={s.label} style={{ textAlign:'center', borderRight:i<3?`1px solid ${border}`:'none', padding:'0 1rem' }}>
              <div style={{ fontSize:'clamp(1.3rem,2.5vw,1.8rem)', fontWeight:800, color:text, letterSpacing:'-0.04em', lineHeight:1 }}>{s.val}</div>
              <div style={{ fontSize:'0.68rem', fontWeight:600, color:text3, textTransform:'uppercase', letterSpacing:'0.1em', marginTop:'0.35rem' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── MARKETS WITH PHOTOS ── */}
      <section style={{ maxWidth:1200, margin:'0 auto', padding:'5rem 2rem' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:'2.5rem', flexWrap:'wrap', gap:'1rem' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', fontSize:'0.7rem', fontWeight:700, color:'#14B8A6', textTransform:'uppercase', letterSpacing:'0.15em', marginBottom:'0.5rem' }}>
              <span style={{ width:16, height:2, background:'#14B8A6', display:'inline-block' }} />
              Markets
            </div>
            <h2 style={{ fontSize:'clamp(1.6rem,3vw,2.2rem)', fontWeight:800, color:text, letterSpacing:'-0.04em' }}>
              Africa. Market by market.
            </h2>
          </div>
          <Link href="/search" style={{ fontSize:'0.85rem', color:'#14B8A6', textDecoration:'none', fontWeight:600 }}>View all properties →</Link>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:'1rem' }}>
          {MARKETS.map(m => (
            <div key={m.slug}
              onClick={() => m.live && router.push(`/neighborhood/${m.slug}`)}
              style={{ borderRadius:16, overflow:'hidden', cursor:m.live?'pointer':'default', opacity:m.live?1:0.65, position:'relative', border:`1px solid ${border}`, transition:'transform 0.2s, border-color 0.2s', height:240 }}
              onMouseEnter={e => { if(m.live){e.currentTarget.style.transform='translateY(-3px)';e.currentTarget.style.borderColor='rgba(91,46,255,0.4)'} }}
              onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.borderColor=border }}>

              {/* Photo */}
              <img src={m.img} alt={m.name} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
                onError={e => { (e.target as HTMLImageElement).style.background=bg2; (e.target as HTMLImageElement).style.display='none' }} />

              {/* Overlay */}
              <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.1) 60%, transparent 100%)' }} />

              {/* Live badge */}
              <div style={{ position:'absolute', top:12, right:12 }}>
                {m.live ? (
                  <span style={{ display:'inline-flex', alignItems:'center', gap:'0.3rem', background:'rgba(20,184,166,0.9)', color:'#fff', borderRadius:100, padding:'0.15rem 0.55rem', fontSize:'0.62rem', fontWeight:700, backdropFilter:'blur(4px)' }}>
                    <span style={{ width:4, height:4, borderRadius:'50%', background:'#fff', display:'inline-block' }} />
                    LIVE
                  </span>
                ) : (
                  <span style={{ background:'rgba(0,0,0,0.5)', color:'rgba(255,255,255,0.6)', borderRadius:100, padding:'0.15rem 0.55rem', fontSize:'0.62rem', fontWeight:600, backdropFilter:'blur(4px)' }}>
                    Soon
                  </span>
                )}
              </div>

              {/* Flag */}
              <div style={{ position:'absolute', top:12, left:12, fontSize:'1.3rem' }}>{m.flag}</div>

              {/* Info at bottom */}
              <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'1rem' }}>
                <div style={{ fontWeight:700, fontSize:'1rem', color:'#fff', marginBottom:'0.2rem' }}>{m.name}</div>
                <div style={{ fontSize:'0.72rem', color:'rgba(255,255,255,0.75)', marginBottom:'0.3rem' }}>{m.city}, {m.country}</div>
                <div style={{ fontSize:'0.68rem', color:'rgba(255,255,255,0.55)' }}>{m.stat}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── INTELLIGENCE SECTION ── */}
      <section style={{ background:dark?bg2:bg2, borderTop:`1px solid ${border}`, borderBottom:`1px solid ${border}` }}>
        <div style={{ maxWidth:1100, margin:'0 auto', padding:'5rem 2rem' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4rem', alignItems:'center' }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', fontSize:'0.7rem', fontWeight:700, color:'#14B8A6', textTransform:'uppercase', letterSpacing:'0.15em', marginBottom:'0.875rem' }}>
                <span style={{ width:16, height:2, background:'#14B8A6', display:'inline-block' }} />
                What Manop computes
              </div>
              <h2 style={{ fontSize:'clamp(1.8rem,3.5vw,2.6rem)', fontWeight:800, color:text, letterSpacing:'-0.04em', lineHeight:1.08, marginBottom:'1rem' }}>
                Not listings.<br />Intelligence.
              </h2>
              <p style={{ color:text2, lineHeight:1.7, marginBottom:'2rem', fontWeight:300, fontSize:'1rem' }}>
                Every search returns real financial metrics computed from verified market data. Real rent data. Real sale prices. Real exchange rates. Math on real inputs — so you invest with confidence.
              </p>
              <div style={{ display:'flex', gap:'0.75rem', flexWrap:'wrap' }}>
                <button onClick={() => inputRef.current?.focus()} style={{ background:'#5B2EFF', color:'#fff', border:'none', borderRadius:10, padding:'0.875rem 1.75rem', fontSize:'0.9rem', fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}
                  onMouseEnter={e=>{e.currentTarget.style.background='#7C5FFF';e.currentTarget.style.transform='translateY(-1px)'}}
                  onMouseLeave={e=>{e.currentTarget.style.background='#5B2EFF';e.currentTarget.style.transform='translateY(0)'}}>
                  Start analyzing →
                </button>
                <Link href="/search" style={{ background:'transparent', color:text2, border:`1px solid ${border}`, borderRadius:10, padding:'0.875rem 1.75rem', fontSize:'0.9rem', fontWeight:600, textDecoration:'none' }}>
                  Browse properties
                </Link>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
              {INTELLIGENCE_METRICS.map(m => (
                <div key={m.label} style={{ background:bg3, border:`1px solid ${border}`, borderRadius:12, padding:'1.1rem', transition:'border-color 0.2s' }}
                  onMouseEnter={e=>(e.currentTarget.style.borderColor='rgba(91,46,255,0.35)')}
                  onMouseLeave={e=>(e.currentTarget.style.borderColor=border)}>
                  <div style={{ fontSize:'1.2rem', color:'#14B8A6', marginBottom:'0.5rem' }}>{m.icon}</div>
                  <div style={{ fontWeight:700, fontSize:'0.85rem', color:text, marginBottom:'0.3rem' }}>{m.label}</div>
                  <div style={{ fontSize:'0.72rem', color:text2, lineHeight:1.5, fontWeight:300 }}>{m.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── AGENCY CTA ── */}
      <section style={{ maxWidth:960, margin:'0 auto', padding:'5rem 2rem' }}>
        <div style={{ background:dark?'linear-gradient(135deg,rgba(91,46,255,0.13) 0%,rgba(20,184,166,0.07) 100%)':'linear-gradient(135deg,rgba(91,46,255,0.05) 0%,rgba(20,184,166,0.03) 100%)', border:'1px solid rgba(91,46,255,0.22)', borderRadius:24, padding:'clamp(2rem,4vw,3.5rem)', display:'flex', justifyContent:'space-between', alignItems:'center', gap:'2rem', flexWrap:'wrap', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:-80, right:-60, width:280, height:280, borderRadius:'50%', background:'radial-gradient(circle,rgba(91,46,255,0.1) 0%,transparent 70%)', pointerEvents:'none' }} />
          <div style={{ position:'relative', zIndex:1, maxWidth:460 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', fontSize:'0.68rem', fontWeight:700, color:'#14B8A6', textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:'0.875rem' }}>
              <span style={{ width:14, height:2, background:'#14B8A6', display:'inline-block' }} />
              Founding agency partners
            </div>
            <h3 style={{ fontSize:'clamp(1.4rem,2.5vw,1.9rem)', fontWeight:800, color:text, letterSpacing:'-0.03em', lineHeight:1.15, marginBottom:'0.875rem' }}>
              Your listings get intelligence.<br />Free. Forever.
            </h3>
            <p style={{ fontSize:'0.9rem', color:text2, lineHeight:1.7, fontWeight:300 }}>
              Founding agency partners receive free yield analysis and cap rate reports on every listing they upload — across Nigeria, Ghana, Kenya, or wherever you operate. Your data. Our intelligence. Source credit on every property we publish.
            </p>
          </div>
          <Link href="/agency/onboard" style={{ background:'#5B2EFF', color:'#fff', padding:'0.875rem 1.75rem', borderRadius:12, fontSize:'0.9rem', fontWeight:600, textDecoration:'none', whiteSpace:'nowrap', position:'relative', zIndex:1, display:'inline-block', transition:'background 0.15s' }}
            onMouseEnter={e=>(e.currentTarget.style.background='#7C5FFF')}
            onMouseLeave={e=>(e.currentTarget.style.background='#5B2EFF')}>
            Become a founding partner →
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background:dark?bg2:bg2, borderTop:`1px solid ${border}`, padding:'2.5rem 2rem' }}>
        <div style={{ maxWidth:1100, margin:'0 auto', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'1rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.6rem' }}>
            <div style={{ width:28, height:28, borderRadius:8, background:'#5B2EFF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.85rem', fontWeight:800, color:'#fff' }}>Z</div>
            <div>
              <div style={{ fontSize:'0.9rem', fontWeight:700, color:text }}>Manop</div>
              <div style={{ fontSize:'0.65rem', color:text3 }}>Nigeria · Ghana · Kenya · South Africa</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:'1.5rem', fontSize:'0.8rem', color:text2, flexWrap:'wrap' }}>
            <Link href="/search"          style={{ color:text2, textDecoration:'none' }}>Properties</Link>
            <Link href="/neighborhood/lekki-phase-1" style={{ color:text2, textDecoration:'none' }}>Markets</Link>
            <Link href="/agency/onboard"  style={{ color:text2, textDecoration:'none' }}>Agency partners</Link>
            <Link href="/agency/dashboard" style={{ color:text2, textDecoration:'none' }}>Agency login</Link>
          </div>
          <div style={{ fontSize:'0.68rem', color:text3, letterSpacing:'0.04em' }}>Making Africa real estate investable</div>
        </div>
      </footer>

      <style>{`
        @keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(20,184,166,0.4)}50%{opacity:0.6;box-shadow:0 0 0 4px rgba(20,184,166,0)}}
        *{box-sizing:border-box;margin:0;padding:0}
        a{color:inherit;text-decoration:none}
        input::placeholder{color:rgba(148,163,184,0.5)}
        @media(max-width:768px){section[style*="grid-template-columns: 1fr 1fr"]{display:block!important}section[style*="grid-template-columns: 1fr 1fr"]>div:last-child{margin-top:2rem}}
      `}</style>
    </div>
  )
}
