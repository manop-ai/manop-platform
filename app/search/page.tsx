'use client'
// app/search/page.tsx
// Manop Search — Day 5 rebuild
// Magazine-style grid (not straight lines)
// Listing type tabs at the top so user picks what they want first
// Source URL opens as embedded preview inside Manop — agent gets lead, user stays

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { getInitialDark, listenTheme } from '../../lib/theme'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

async function signal(type: string, meta: Record<string, unknown> = {}) {
  try {
    fetch('/api/signals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signal_type: type, ...meta }),
    })
  } catch { /* never block UI */ }
}

interface Property {
  id:            string
  neighborhood:  string | null
  city:          string | null
  property_type: string | null
  listing_type:  string | null
  bedrooms:      number | null
  bathrooms:     number | null
  price_local:   number | null
  price_usd:     number | null
  currency_code: string | null
  confidence:    number | null
  created_at:    string | null
  raw_data:      Record<string, unknown> | null
}

const NEIGHBORHOODS = [
  'Lekki Phase 1','Lekki Phase 2','Lekki','Ikoyi','Victoria Island',
  'Eko Atlantic','Banana Island','Ikota','Chevron','Ajah','Sangotedo',
  'Osapa London','Gbagada','Yaba','Ikeja','Ikeja GRA','Surulere','Magodo',
  'Maitama','Asokoro','Wuse 2','East Legon','Cantonments','Westlands','Karen','Kilimani',
]

const REAL_MEDIANS: Record<string, Record<number, number>> = {
  'lekki phase 1': { 1: 175e6, 2: 285e6, 3: 400e6, 4: 725e6, 5: 860e6 },
}
const REAL_YIELDS: Record<string, Record<number, number>> = {
  'lekki phase 1': { 1: 5.1, 2: 7.4, 3: 5.0, 4: 4.5, 5: 5.2 },
}

function fmt(n: number | null, currency = 'NGN') {
  if (!n) return 'POA'
  const s = currency === 'USD' ? '$' : '₦'
  if (n >= 1e9) return `${s}${(n/1e9).toFixed(1)}B`
  if (n >= 1e6) return `${s}${(n/1e6).toFixed(0)}M`
  return `${s}${Math.round(n/1e3)}K`
}
function fmtUSD(n: number | null) {
  if (!n) return null
  if (n >= 1e6) return `$${(n/1e6).toFixed(2)}M`
  return `$${Math.round(n/1e3)}K`
}

// ─── Embedded source viewer ───────────────────────────────────
// Shows the original listing URL inside Manop in an iframe overlay
// User never leaves. Agent gets a lead signal.
function SourceViewer({ url, title, onClose, dark }: {
  url: string; title: string; onClose: () => void; dark: boolean
}) {
  const bg3 = dark ? '#162032' : '#FFFFFF'
  const border = dark ? 'rgba(248,250,252,0.1)' : 'rgba(15,23,42,0.1)'
  const text = dark ? '#F8FAFC' : '#0F172A'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 900, height: '88vh', background: bg3, borderRadius: '16px 16px 0 0', border: `1px solid ${border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E' }} />
          <div style={{ fontSize: '0.78rem', color: text, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          <div style={{ fontSize: '0.65rem', color: '#14B8A6', background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.2)', borderRadius: 20, padding: '0.15rem 0.5rem', fontWeight: 700, flexShrink: 0 }}>
            Manop Intel Applied
          </div>
          <a href={url} target="_blank" rel="noopener" style={{ fontSize: '0.72rem', color: dark?'rgba(248,250,252,0.5)':'rgba(15,23,42,0.5)', textDecoration: 'none', flexShrink: 0 }}>Open ↗</a>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: dark?'rgba(248,250,252,0.5)':'rgba(15,23,42,0.5)', fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1, padding: '0 0.25rem' }}>×</button>
        </div>
        {/* Iframe */}
        <iframe
          src={url}
          style={{ flex: 1, border: 'none', width: '100%' }}
          title={title}
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
      </div>
    </div>
  )
}

// ─── Property card ────────────────────────────────────────────
function PropCard({ p, dark, onSourceOpen }: {
  p: Property
  dark: boolean
  onSourceOpen: (url: string, title: string) => void
}) {
  const bg3   = dark ? '#162032' : '#FFFFFF'
  const bg2   = dark ? '#1E293B' : '#F1F5F9'
  const text  = dark ? '#F8FAFC' : '#0F172A'
  const text2 = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3 = dark ? 'rgba(248,250,252,0.32)' : 'rgba(15,23,42,0.32)'
  const border = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.07)'

  const raw      = (p.raw_data || {}) as Record<string, unknown>
  const images   = Array.isArray(raw['images']) ? raw['images'] as string[] : []
  const srcUrl   = raw['source_url'] as string | undefined
  const agency   = raw['source_agency'] as string | undefined
  const isRent   = p.listing_type === 'for-rent'
  const isSTR    = p.listing_type === 'short-let'

  const hood = (p.neighborhood || '').toLowerCase()
  const vm = (p.price_local && p.bedrooms && REAL_MEDIANS[hood]?.[p.bedrooms])
    ? Math.round(((p.price_local - REAL_MEDIANS[hood][p.bedrooms]) / REAL_MEDIANS[hood][p.bedrooms]) * 100)
    : null
  const yEst = (!isRent && !isSTR && p.bedrooms && REAL_YIELDS[hood]?.[p.bedrooms])
    ? REAL_YIELDS[hood][p.bedrooms] : null

  const typeColor = isSTR ? '#F59E0B' : isRent ? '#14B8A6' : '#5B2EFF'

  return (
    <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'border-color 0.15s, transform 0.15s', breakInside: 'avoid', marginBottom: '1rem' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(91,46,255,0.38)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = border; e.currentTarget.style.transform = 'translateY(0)' }}>

      {/* Image */}
      <div style={{ height: 190, background: bg2, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        {images[0] ? (
          <img src={images[0]} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
            onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
        ) : (
          <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', opacity:0.2 }}>
            <div style={{ fontSize:'2rem' }}>🏠</div>
            <div style={{ fontSize:'0.62rem', color:text3, marginTop:'0.35rem' }}>No image</div>
          </div>
        )}
        <div style={{ position:'absolute', top:9, left:9, background:`${typeColor}ee`, color:'#fff', borderRadius:5, padding:'0.15rem 0.45rem', fontSize:'0.6rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>
          {p.listing_type?.replace(/-/g,' ') || 'For Sale'}
        </div>
        {vm !== null && (
          <div style={{ position:'absolute', top:9, right:9, background: vm<=0?'rgba(34,197,94,0.9)':'rgba(239,68,68,0.9)', color:'#fff', borderRadius:5, padding:'0.15rem 0.45rem', fontSize:'0.6rem', fontWeight:700 }}>
            {vm>0?'+':''}{vm}% vs median
          </div>
        )}
        {agency && (
          <div style={{ position:'absolute', bottom:9, right:9, background:'rgba(0,0,0,0.65)', color:'#fff', borderRadius:5, padding:'0.12rem 0.4rem', fontSize:'0.58rem', fontWeight:600 }}>
            {agency}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '0.9rem 1rem 1rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontWeight:700, fontSize:'0.92rem', color:text, marginBottom:'0.2rem', lineHeight:1.25 }}>
          {p.bedrooms ? `${p.bedrooms}-Bed ` : ''}{p.property_type || 'Property'}
        </div>
        <div style={{ fontSize:'0.7rem', color:text2, marginBottom:'0.6rem', display:'flex', alignItems:'center', gap:'0.25rem' }}>
          📍 {p.neighborhood}{p.city ? `, ${p.city}` : ''}
        </div>

        {/* Price */}
        <div style={{ marginBottom:'0.65rem' }}>
          <div style={{ fontSize:'1.2rem', fontWeight:800, color:'#7C5FFF', letterSpacing:'-0.03em', lineHeight:1 }}>
            {fmt(p.price_local, p.currency_code || 'NGN')}
            {isRent && <span style={{ fontSize:'0.65rem', fontWeight:400, color:text2 }}>/yr</span>}
            {isSTR  && <span style={{ fontSize:'0.65rem', fontWeight:400, color:text2 }}>/night</span>}
          </div>
          {p.price_usd && <div style={{ fontSize:'0.68rem', color:text3, fontFamily:'monospace', marginTop:2 }}>≈ {fmtUSD(p.price_usd)} · live rate</div>}
        </div>

        {/* Specs row */}
        <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap', marginBottom:'0.65rem' }}>
          {p.bedrooms && <span style={{ fontSize:'0.68rem', color:text2, background:dark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)', padding:'0.15rem 0.4rem', borderRadius:5 }}>{p.bedrooms} bed</span>}
          {p.bathrooms && <span style={{ fontSize:'0.68rem', color:text2, background:dark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)', padding:'0.15rem 0.4rem', borderRadius:5 }}>{p.bathrooms} bath</span>}
          {yEst && <span style={{ fontSize:'0.68rem', fontWeight:700, color: yEst>=6?'#22C55E':yEst>=4?'#F59E0B':'#EF4444' }}>{yEst}% yield β</span>}
        </div>

        {/* Actions */}
        <div style={{ display:'flex', gap:'0.45rem', marginTop:'auto' }}>
          <Link href={`/property/${p.id}`}
            onClick={() => signal('property_view', { property_id: p.id, neighborhood: p.neighborhood||'', city: p.city||'' })}
            style={{ flex:1, background:'#5B2EFF', color:'#fff', padding:'0.55rem', borderRadius:7, textDecoration:'none', fontSize:'0.75rem', fontWeight:600, textAlign:'center', display:'block', transition:'background 0.15s' }}
            onMouseEnter={e=>(e.currentTarget.style.background='#7C5FFF')}
            onMouseLeave={e=>(e.currentTarget.style.background='#5B2EFF')}>
            Full intel →
          </Link>
          {srcUrl && (
            <button
              onClick={() => {
                signal('contact_click', { property_id: p.id, neighborhood: p.neighborhood||'', partner: agency })
                onSourceOpen(srcUrl, `${p.bedrooms||''}bed ${p.property_type||'property'} — ${p.neighborhood}`)
              }}
              title="View on source platform — stays inside Manop"
              style={{ background:dark?'rgba(20,184,166,0.12)':'rgba(20,184,166,0.08)', border:'1px solid rgba(20,184,166,0.25)', color:'#14B8A6', padding:'0.55rem 0.75rem', borderRadius:7, cursor:'pointer', fontSize:'0.75rem', fontWeight:600, whiteSpace:'nowrap' }}>
              View ↗
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────
export default function SearchPage() {
  const [dark, setDark]             = useState(true)
  const [activeType, setActiveType] = useState('all')
  const [neighborhood, setNeigh]    = useState('')
  const [bedrooms, setBedrooms]     = useState('any')
  const [minPrice, setMinPrice]     = useState('')
  const [maxPrice, setMaxPrice]     = useState('')
  const [results, setResults]       = useState<Property[]>([])
  const [total, setTotal]           = useState(0)
  const [loading, setLoading]       = useState(false)
  const [viewer, setViewer]         = useState<{ url: string; title: string } | null>(null)

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  useEffect(() => { run() }, [activeType, neighborhood, bedrooms, minPrice, maxPrice])

  async function run() {
    setLoading(true)
    try {
      let q = sb.from('properties')
        .select('id,neighborhood,city,property_type,listing_type,bedrooms,bathrooms,price_local,price_usd,currency_code,confidence,created_at,raw_data', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(60)

      if (activeType !== 'all') q = q.eq('listing_type', activeType)
      if (neighborhood) {
        q = q.ilike('neighborhood', `%${neighborhood}%`)
        signal('search_location', { neighborhood, listing_type: activeType })
      }
      if (bedrooms !== 'any') q = q.eq('bedrooms', parseInt(bedrooms))
      if (minPrice) {
        const mn = parseFloat(minPrice.replace(/[₦,Mm]/g,''))
        if (!isNaN(mn)) q = q.gte('price_local', mn < 10_000 ? mn * 1e6 : mn)
      }
      if (maxPrice) {
        const mx = parseFloat(maxPrice.replace(/[₦,Mm]/g,''))
        if (!isNaN(mx)) q = q.lte('price_local', mx < 10_000 ? mx * 1e6 : mx)
      }

      const { data, count } = await q
      setResults((data as Property[]) || [])
      setTotal(count || 0)
    } catch { setResults([]) }
    finally { setLoading(false) }
  }

  const bg    = dark ? '#0F172A' : '#F8FAFC'
  const bg2   = dark ? '#1E293B' : '#F1F5F9'
  const bg3   = dark ? '#162032' : '#FFFFFF'
  const text  = dark ? '#F8FAFC' : '#0F172A'
  const text2 = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3 = dark ? 'rgba(248,250,252,0.32)' : 'rgba(15,23,42,0.32)'
  const border = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.07)'

  const inp = { background:dark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)', border:`1px solid ${border}`, borderRadius:8, color:text, fontSize:'0.82rem', outline:'none', padding:'0.55rem 0.875rem', width:'100%', fontFamily:'inherit' }

  const typeTab = (val: string, label: string, color: string) => (
    <button onClick={() => setActiveType(val)} style={{ padding:'0.45rem 1.1rem', borderRadius:20, border:`1px solid ${activeType===val?color:border}`, background:activeType===val?`${color}20`:'transparent', color:activeType===val?color:text3, fontSize:'0.8rem', fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}>
      {label}
    </button>
  )

  return (
    <div style={{ background:bg, minHeight:'100vh', color:text }}>

      {/* Source viewer overlay */}
      {viewer && <SourceViewer url={viewer.url} title={viewer.title} onClose={() => setViewer(null)} dark={dark} />}

      {/* Top filter bar */}
      <div style={{ background:bg2, borderBottom:`1px solid ${border}`, padding:'1.25rem 2rem', position:'sticky', top:64, zIndex:100 }}>
        <div style={{ maxWidth:1200, margin:'0 auto' }}>

          {/* Listing type tabs — FIRST so user picks what they want */}
          <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1rem', alignItems:'center' }}>
            <span style={{ fontSize:'0.65rem', color:text3, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', marginRight:'0.25rem' }}>I'm looking for</span>
            {typeTab('all',       'Everything',  '#5B2EFF')}
            {typeTab('for-sale',  'For sale',    '#5B2EFF')}
            {typeTab('for-rent',  'For rent',    '#14B8A6')}
            {typeTab('short-let', 'Short let',   '#F59E0B')}
            {typeTab('off-plan',  'Off plan',    '#84CC16')}
          </div>

          {/* Secondary filters */}
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr', gap:'0.6rem' }}>
            <select style={{ ...inp, cursor:'pointer' }} value={neighborhood} onChange={e => setNeigh(e.target.value)}>
              <option value="">All neighborhoods</option>
              {NEIGHBORHOODS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <select style={{ ...inp, cursor:'pointer' }} value={bedrooms} onChange={e => setBedrooms(e.target.value)}>
              <option value="any">Any bedrooms</option>
              {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} bed</option>)}
            </select>
            <input style={inp} placeholder="Min price (e.g. 100M)" value={minPrice} onChange={e => setMinPrice(e.target.value)} />
            <input style={inp} placeholder="Max price (e.g. 500M)" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} />
            <button onClick={() => { setActiveType('all'); setNeigh(''); setBedrooms('any'); setMinPrice(''); setMaxPrice('') }}
              style={{ background:'transparent', border:`1px solid ${border}`, color:text3, borderRadius:8, fontSize:'0.78rem', cursor:'pointer' }}>
              Clear
            </button>
          </div>

          {/* Results count */}
          <div style={{ marginTop:'0.75rem', fontSize:'0.72rem', color:text3 }}>
            {loading ? 'Searching…' : `${total} properties${neighborhood ? ` in ${neighborhood}` : ''}`}
          </div>
        </div>
      </div>

      {/* Magazine-style masonry grid */}
      <div style={{ maxWidth:1200, margin:'0 auto', padding:'1.5rem 2rem' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:'5rem', color:text3 }}>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{ width:24, height:24, border:'2px solid rgba(91,46,255,0.3)', borderTopColor:'#5B2EFF', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 1rem' }} />
            Loading listings…
          </div>
        ) : results.length === 0 ? (
          <div style={{ textAlign:'center', padding:'5rem', background:bg3, borderRadius:14, border:`1px solid ${border}` }}>
            <div style={{ fontSize:'2rem', opacity:0.3, marginBottom:'1rem' }}>🔍</div>
            <div style={{ fontWeight:700, color:text, marginBottom:'0.5rem' }}>No results</div>
            <div style={{ fontSize:'0.82rem', color:text2 }}>Try a different filter or clear all.</div>
          </div>
        ) : (
          /* Masonry: 3 columns, cards flow naturally, different heights look intentional */
          <div style={{ columns: 3, columnGap: '1rem' }}>
            {results.map(p => (
              <PropCard key={p.id} p={p} dark={dark} onSourceOpen={(url, title) => {
                setViewer({ url, title })
                signal('contact_click', { property_id: p.id, neighborhood: p.neighborhood||'' })
              }} />
            ))}
          </div>
        )}

        {/* Agency CTA */}
        <div style={{ marginTop:'2rem', background:dark?'rgba(91,46,255,0.07)':'rgba(91,46,255,0.04)', border:'1px solid rgba(91,46,255,0.15)', borderRadius:14, padding:'1.25rem 1.5rem', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'1rem' }}>
          <div>
            <div style={{ fontWeight:700, color:text, fontSize:'0.9rem', marginBottom:'0.25rem' }}>Agency in Lagos, Abuja, Accra or Nairobi?</div>
            <div style={{ fontSize:'0.78rem', color:text2 }}>List free. Buyers see your properties with real-time yield intelligence. You see who's interested.</div>
          </div>
          <Link href="/agency/onboard" style={{ background:'#5B2EFF', color:'#fff', padding:'0.6rem 1.25rem', borderRadius:8, textDecoration:'none', fontSize:'0.82rem', fontWeight:600, whiteSpace:'nowrap' }}>
            Become a partner →
          </Link>
        </div>
      </div>
    </div>
  )
}
