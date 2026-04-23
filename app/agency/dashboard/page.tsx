'use client'
// app/agency/dashboard/page.tsx
// Manop Agency Dashboard — working login
// Login by email or partner ID (both work)
// Shows real listings from Supabase, edit inline

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { getInitialDark, listenTheme } from '../../../lib/theme'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

interface Partner {
  id:           string
  name:         string
  partner_type: string
  trust_level:  string
  cities:       string[]
  contact_email: string | null
}

interface Listing {
  id:            string
  neighborhood:  string | null
  city:          string | null
  property_type: string | null
  listing_type:  string | null
  bedrooms:      number | null
  price_local:   number | null
  price_usd:     number | null
  currency_code: string | null
  confidence:    number | null
  created_at:    string | null
  raw_data:      Record<string, unknown> | null
}

function fmt(n: number | null) {
  if (!n) return '—'
  if (n >= 1e9) return `₦${(n/1e9).toFixed(1)}B`
  if (n >= 1e6) return `₦${(n/1e6).toFixed(0)}M`
  return `₦${Math.round(n/1e3)}K`
}

export default function AgencyDashboard() {
  const [dark, setDark]           = useState(true)
  const [loginVal, setLoginVal]   = useState('')
  const [loginErr, setLoginErr]   = useState('')
  const [logging, setLogging]     = useState(false)
  const [partner, setPartner]     = useState<Partner | null>(null)
  const [listings, setListings]   = useState<Listing[]>([])
  const [loading, setLoading]     = useState(false)
  const [editId, setEditId]       = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [editType, setEditType]   = useState('')
  const [saving, setSaving]       = useState(false)
  const [saveMsg, setSaveMsg]     = useState('')
  const [filterType, setFilterType] = useState('all')

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  const bg    = dark ? '#0F172A' : '#F8FAFC'
  const bg2   = dark ? '#1E293B' : '#F1F5F9'
  const bg3   = dark ? '#162032' : '#FFFFFF'
  const text  = dark ? '#F8FAFC' : '#0F172A'
  const text2 = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3 = dark ? 'rgba(248,250,252,0.32)' : 'rgba(15,23,42,0.32)'
  const border = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.07)'

  const inp = { background:dark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)', border:`1px solid ${border}`, borderRadius:8, color:text, fontSize:'0.85rem', outline:'none', padding:'0.65rem 0.875rem', fontFamily:'inherit', width:'100%' }

  // ── Login ───────────────────────────────────────────────────
  async function handleLogin() {
    if (!loginVal.trim()) { setLoginErr('Enter your email or partner ID'); return }
    setLogging(true)
    setLoginErr('')

    try {
      // Try by email first
      let { data } = await sb
        .from('data_partners')
        .select('id, name, partner_type, trust_level, cities, contact_email')
        .eq('contact_email', loginVal.trim().toLowerCase())
        .eq('active', true)
        .single()

      // If not found by email, try by UUID (partner ID)
      if (!data && loginVal.includes('-') && loginVal.length > 30) {
        const res = await sb
          .from('data_partners')
          .select('id, name, partner_type, trust_level, cities, contact_email')
          .eq('id', loginVal.trim())
          .eq('active', true)
          .single()
        data = res.data
      }

      // If still not found, try by name (partial match for ease)
      if (!data) {
        const res = await sb
          .from('data_partners')
          .select('id, name, partner_type, trust_level, cities, contact_email')
          .ilike('name', `%${loginVal.trim()}%`)
          .eq('active', true)
          .limit(1)
          .single()
        data = res.data
      }

      if (!data) {
        setLoginErr('No agency found with that email or ID. Check spelling or register first.')
        setLogging(false)
        return
      }

      setPartner(data as Partner)
      loadListings(data.id)
    } catch (e: unknown) {
      setLoginErr('Login failed. Please try again or contact support.')
    } finally {
      setLogging(false)
    }
  }

  async function loadListings(partnerId: string) {
    setLoading(true)
    const { data } = await sb
      .from('properties')
      .select('id,neighborhood,city,property_type,listing_type,bedrooms,price_local,price_usd,currency_code,confidence,created_at,raw_data')
      .eq('data_partner_id', partnerId)
      .order('created_at', { ascending: false })
    setListings((data as Listing[]) || [])
    setLoading(false)
  }

  async function saveEdit(id: string) {
    if (!editPrice && !editType) { setEditId(null); return }
    setSaving(true)
    setSaveMsg('')

    const updates: Record<string, unknown> = {}
    if (editType) updates.listing_type = editType

    if (editPrice) {
      const s = editPrice.toLowerCase().replace(/[₦,\s]/g,'')
      const m = s.match(/([\d.]+)(m|b|k)?/)
      if (m) {
        let n = parseFloat(m[1])
        if (m[2]==='b') n*=1e9; else if (m[2]==='m') n*=1e6; else if (m[2]==='k') n*=1e3
        if (n<10_000) n*=1e6
        updates.price_local = Math.round(n)
        // Fetch live FX for USD update
        try {
          const r = await fetch('https://open.er-api.com/v6/latest/USD')
          const d = await r.json()
          const rate = d?.rates?.NGN || 1570
          updates.price_usd = Math.round(n / rate)
        } catch { /* use old value */ }
      }
    }

    const { error } = await sb.from('properties').update(updates).eq('id', id)
    if (error) { setSaveMsg('✗ ' + error.message) }
    else {
      setSaveMsg('✓ Saved')
      setEditId(null)
      if (partner) loadListings(partner.id)
    }
    setSaving(false)
    setTimeout(() => setSaveMsg(''), 3000)
  }

  const filtered = listings.filter(l => filterType === 'all' || l.listing_type === filterType)
  const totalVal = listings.reduce((s, l) => s + (l.price_local || 0), 0)

  // ── LOGIN SCREEN ─────────────────────────────────────────────
  if (!partner) return (
    <div style={{ background:bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color:text }}>
      <div style={{ maxWidth:420, width:'100%', padding:'2rem' }}>
        <div style={{ textAlign:'center', marginBottom:'2rem' }}>
          <div style={{ width:48, height:48, borderRadius:12, background:'#5B2EFF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.4rem', fontWeight:800, color:'#fff', margin:'0 auto 1rem' }}>Z</div>
          <div style={{ fontSize:'0.65rem', color:'#14B8A6', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:'0.4rem' }}>Manop · Agency Partner</div>
          <h1 style={{ fontSize:'1.5rem', fontWeight:800, letterSpacing:'-0.03em' }}>Dashboard login</h1>
          <p style={{ fontSize:'0.82rem', color:text2, marginTop:'0.5rem' }}>Enter your agency email, partner ID, or agency name</p>
        </div>

        <div style={{ background:bg3, border:`1px solid ${border}`, borderRadius:14, padding:'1.5rem' }}>
          <div style={{ marginBottom:'1rem' }}>
            <label style={{ fontSize:'0.65rem', fontWeight:700, color:'#14B8A6', textTransform:'uppercase', letterSpacing:'0.1em', display:'block', marginBottom:'0.4rem' }}>
              Email / Partner ID / Agency name
            </label>
            <input
              style={inp}
              placeholder="e.g. cw@cwrealestate.com or CW Real Estate"
              value={loginVal}
              onChange={e => setLoginVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              autoFocus
            />
          </div>

          {loginErr && (
            <div style={{ color:'#EF4444', fontSize:'0.78rem', marginBottom:'1rem', padding:'0.65rem 0.875rem', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8 }}>
              {loginErr}
            </div>
          )}

          <button onClick={handleLogin} disabled={logging} style={{ width:'100%', background:'#5B2EFF', color:'#fff', border:'none', borderRadius:8, padding:'0.75rem', fontSize:'0.875rem', fontWeight:700, cursor:'pointer', opacity:logging?0.7:1 }}>
            {logging ? 'Searching…' : 'Access Dashboard →'}
          </button>

          <div style={{ textAlign:'center', marginTop:'1rem', fontSize:'0.75rem', color:text3 }}>
            Not registered yet?{' '}
            <Link href="/agency/onboard" style={{ color:'#14B8A6', textDecoration:'none', fontWeight:600 }}>
              Join as agency partner →
            </Link>
          </div>

          {/* Demo hint */}
          <div style={{ marginTop:'1rem', padding:'0.75rem', background:dark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.03)', borderRadius:8, fontSize:'0.7rem', color:text3 }}>
            Demo: try typing <span style={{ fontFamily:'monospace', color:text2 }}>CW Real Estate</span>
          </div>
        </div>
      </div>
    </div>
  )

  // ── DASHBOARD ────────────────────────────────────────────────
  return (
    <div style={{ background:bg, minHeight:'100vh', color:text }}>

      {/* Header */}
      <div style={{ background:bg2, borderBottom:`1px solid ${border}`, padding:'1rem 2rem' }}>
        <div style={{ maxWidth:1100, margin:'0 auto', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'1rem' }}>
          <div>
            <div style={{ fontSize:'0.62rem', color:'#14B8A6', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:'0.2rem' }}>Manop · Agency Partner</div>
            <div style={{ fontWeight:700, fontSize:'1.1rem' }}>{partner.name}</div>
            <div style={{ fontSize:'0.72rem', color:text3 }}>{partner.partner_type} · {partner.trust_level} trust · {(partner.cities || []).join(', ')}</div>
          </div>
          <div style={{ display:'flex', gap:'0.75rem' }}>
            <Link href="/agency/onboard" style={{ background:'#14B8A6', color:'#fff', padding:'0.5rem 1rem', borderRadius:8, fontSize:'0.8rem', fontWeight:600, textDecoration:'none' }}>
              + Add listing
            </Link>
            <button onClick={() => { setPartner(null); setListings([]) }} style={{ background:'transparent', border:`1px solid ${border}`, color:text3, padding:'0.5rem 1rem', borderRadius:8, fontSize:'0.8rem', cursor:'pointer' }}>
              Log out
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:'0 auto', padding:'1.5rem 2rem' }}>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'0.75rem', marginBottom:'1.5rem' }}>
          {[
            { label:'Total listings', value:listings.length, color:text },
            { label:'For sale',       value:listings.filter(l=>l.listing_type==='for-sale').length, color:'#7C5FFF' },
            { label:'For rent / let', value:listings.filter(l=>l.listing_type==='for-rent'||l.listing_type==='short-let').length, color:'#14B8A6' },
            { label:'Portfolio value', value:fmt(totalVal), color:'#F59E0B' },
          ].map(s => (
            <div key={s.label} style={{ background:bg3, border:`1px solid ${border}`, borderRadius:10, padding:'1rem' }}>
              <div style={{ fontSize:'0.6rem', fontWeight:700, color:'#14B8A6', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'0.3rem' }}>{s.label}</div>
              <div style={{ fontSize:'1.5rem', fontWeight:800, color:s.color, letterSpacing:'-0.03em' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {saveMsg && <div style={{ color:saveMsg.startsWith('✓')?'#22C55E':'#EF4444', fontSize:'0.82rem', marginBottom:'0.75rem' }}>{saveMsg}</div>}

        {/* Filter tabs */}
        <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1rem', flexWrap:'wrap' }}>
          {['all','for-sale','for-rent','short-let'].map(t => (
            <button key={t} onClick={() => setFilterType(t)} style={{ padding:'0.3rem 0.875rem', borderRadius:20, border:`1px solid ${filterType===t?'#5B2EFF':border}`, background:filterType===t?'rgba(91,46,255,0.15)':'transparent', color:filterType===t?'#A78BFA':text3, fontSize:'0.75rem', fontWeight:600, cursor:'pointer' }}>
              {t==='all'?'All':t.replace(/-/g,' ')}
            </button>
          ))}
        </div>

        {/* Listings */}
        {loading ? (
          <div style={{ textAlign:'center', padding:'3rem', color:text3 }}>Loading your listings…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'3rem', background:bg3, borderRadius:12, border:`1px solid ${border}` }}>
            <div style={{ color:text2, marginBottom:'1rem' }}>No listings yet</div>
            <Link href="/agency/onboard" style={{ background:'#5B2EFF', color:'#fff', padding:'0.6rem 1.25rem', borderRadius:8, textDecoration:'none', fontSize:'0.85rem', fontWeight:600 }}>
              Add your first listing →
            </Link>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.6rem' }}>
            {filtered.map(l => {
              const isEditing = editId === l.id
              return (
                <div key={l.id} style={{ background:bg3, border:`1px solid ${isEditing?'rgba(91,46,255,0.4)':border}`, borderRadius:11, overflow:'hidden', transition:'border-color 0.15s' }}>
                  <div style={{ padding:'1rem 1.25rem', display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'0.75rem' }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', marginBottom:'0.3rem', flexWrap:'wrap' }}>
                        <span style={{ fontWeight:700, color:text }}>{l.bedrooms?`${l.bedrooms}-Bed `:''}{l.property_type||'Property'}</span>
                        <span style={{ fontSize:'1rem', fontWeight:800, color:'#7C5FFF' }}>{fmt(l.price_local)}</span>
                        {l.price_usd && <span style={{ fontSize:'0.68rem', color:text3, fontFamily:'monospace' }}>≈ ${Math.round(l.price_usd).toLocaleString()}</span>}
                        <span style={{ fontSize:'0.62rem', background:l.listing_type==='for-rent'?'rgba(20,184,166,0.12)':'rgba(91,46,255,0.1)', color:l.listing_type==='for-rent'?'#14B8A6':'#A78BFA', border:`1px solid ${l.listing_type==='for-rent'?'rgba(20,184,166,0.25)':'rgba(91,46,255,0.2)'}`, borderRadius:20, padding:'0.12rem 0.45rem', fontWeight:700 }}>
                          {l.listing_type?.replace(/-/g,' ')}
                        </span>
                      </div>
                      <div style={{ fontSize:'0.75rem', color:text2 }}>📍 {l.neighborhood}, {l.city}</div>
                    </div>
                    <div style={{ display:'flex', gap:'0.5rem', flexShrink:0 }}>
                      <Link href={`/property/${l.id}`} target="_blank" style={{ fontSize:'0.72rem', color:'#14B8A6', background:'rgba(20,184,166,0.08)', border:'1px solid rgba(20,184,166,0.2)', padding:'0.3rem 0.7rem', borderRadius:6, textDecoration:'none', fontWeight:600 }}>View ↗</Link>
                      <button onClick={() => { if(isEditing){setEditId(null)}else{setEditId(l.id);setEditPrice('');setEditType(l.listing_type||'')} }} style={{ fontSize:'0.72rem', color:isEditing?'#F59E0B':text3, background:isEditing?'rgba(245,158,11,0.08)':'transparent', border:`1px solid ${isEditing?'rgba(245,158,11,0.25)':border}`, padding:'0.3rem 0.7rem', borderRadius:6, cursor:'pointer', fontWeight:600 }}>
                        {isEditing?'Cancel':'Edit'}
                      </button>
                    </div>
                  </div>

                  {isEditing && (
                    <div style={{ borderTop:`1px solid ${border}`, padding:'1rem 1.25rem', background:dark?'rgba(91,46,255,0.04)':'rgba(91,46,255,0.02)' }}>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem', marginBottom:'0.875rem' }}>
                        <div>
                          <label style={{ fontSize:'0.62rem', color:text3, display:'block', marginBottom:'0.25rem' }}>New price (e.g. 135M)</label>
                          <input style={inp} placeholder="Leave blank to keep current" value={editPrice} onChange={e => setEditPrice(e.target.value)} />
                        </div>
                        <div>
                          <label style={{ fontSize:'0.62rem', color:text3, display:'block', marginBottom:'0.25rem' }}>Listing type</label>
                          <select style={{ ...inp, cursor:'pointer' }} value={editType} onChange={e => setEditType(e.target.value)}>
                            <option value="for-sale">For Sale</option>
                            <option value="for-rent">For Rent</option>
                            <option value="short-let">Short Let</option>
                            <option value="off-plan">Off Plan</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
                        <button onClick={() => saveEdit(l.id)} disabled={saving} style={{ background:'#22C55E', color:'#fff', border:'none', borderRadius:7, padding:'0.5rem 1.25rem', fontSize:'0.8rem', fontWeight:700, cursor:'pointer', opacity:saving?0.7:1 }}>
                          {saving?'Saving…':'Save changes'}
                        </button>
                        <span style={{ fontSize:'0.7rem', color:text3 }}>USD price updates at live rate automatically</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
