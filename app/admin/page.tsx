'use client'
// app/admin/page.tsx — MANOP Intelligence Command Center
// Complete admin panel with Signal Intelligence dashboard
// Replaces previous admin-FINAL.tsx
// Role: admin | super_admin only

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  LayoutDashboard, Radio, CheckCircle2, Banknote, Building2, Globe,
  BarChart3, Construction, LogOut, Sun, Moon, Home, ClipboardCheck,
  Clock, Plus, Star,
} from 'lucide-react'
import { getInitialDark, setTheme, listenTheme } from '../../lib/theme'
import { sb } from '../../lib/supabase/client'

async function getToken() {
  const { data: { session } } = await sb.auth.getSession()
  return session?.access_token ?? ''
}

// ── Types ────────────────────────────────────────────────────
type Tab = 'command'|'signals'|'verify'|'agencies'|'associations'|'financing'|'onboard'

interface PlatformIntel {
  total_signals_7d: number
  demand_signals_7d: number
  supply_signals_7d: number
  trust_signals_7d: number
  financing_signals_30d: number
  transaction_signals_30d: number
  total_agencies: number
  active_agencies_30d: number
  verified_agencies: number
  total_listings: number
  total_verified_transactions: number
  top_neighborhoods: string[]
  financing_requests_30d: number
  total_financing_demand_ngn: number
  total_associations: number
  total_association_members: number
  pending_verifications: number
  pct_listings_with_price: number
  pct_listings_with_images: number
  avg_mape_score: number
  computed_at: string
}

// ── Sub-components ───────────────────────────────────────────
function KPI({ label, value, sub, accent, icon }: {
  label: string; value: string|number; sub?: string; accent: string; icon?: ReactNode
}) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '18px 20px',
      borderTop: `3px solid ${accent}`,
    }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <span style={{ fontSize:10, color:'var(--muted)', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase' as const }}>{label}</span>
        {icon && <span style={{ display:'flex', color: accent }}>{icon}</span>}
      </div>
      <div style={{ fontSize:26, fontWeight:800, color:'var(--text)', lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--muted)', marginTop:7 }}>{sub}</div>}
    </div>
  )
}

function Pill({ v, map }: { v: string; map: Record<string,string> }) {
  const c = map[v] ?? '#64748b'
  return (
    <span style={{
      display:'inline-block', padding:'2px 9px', borderRadius:20,
      fontSize:10, fontWeight:700, letterSpacing:'0.05em',
      textTransform:'uppercase' as const,
      background: c+'22', color: c, border:`1px solid ${c}44`,
    }}>{v.replace(/_/g,' ')}</span>
  )
}

const STATUS_COLORS: Record<string,string> = {
  verified:'#22c55e', active:'#22c55e', approved:'#22c55e', closed:'#22c55e',
  pending:'#f59e0b', under_review:'#8b5cf6', submitted:'#f59e0b', reviewing:'#3b82f6',
  sent_to_partner:'#14B8A6', partner_contacted:'#14B8A6', in_progress:'#3b82f6',
  rejected:'#ef4444', suspended:'#ef4444', inactive:'#ef4444', not_started:'#64748b',
  listed:'#64748b', elite:'#f59e0b', trust:'#22c55e',
  mortgage:'#5B2EFF', nhf:'#14B8A6', diaspora_remittance:'#f59e0b', developer_plan:'#3b82f6',
  demand:'#5B2EFF', supply:'#22c55e', financing:'#f59e0b',
  trust_signal:'#14B8A6', transaction:'#3b82f6', participation:'#8b5cf6',
}

function SignalBar({ label, value, total, color }: { label:string; value:number; total:number; color:string }) {
  const pct = total > 0 ? Math.round((value/total)*100) : 0
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
        <span style={{ fontSize:12, color:'var(--text2)', fontWeight:600 }}>{label}</span>
        <span style={{ fontSize:12, color:'var(--muted)', fontFamily:'DM Mono, monospace' }}>{value.toLocaleString()} ({pct}%)</span>
      </div>
      <div style={{ height:6, background:'var(--border)', borderRadius:3, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:3, transition:'width 0.4s ease' }}/>
      </div>
    </div>
  )
}

export default function AdminCommandCenter() {
  const router = useRouter()
  const [dark, setDark]         = useState(true)
  const [tab, setTab]           = useState<Tab>('command')
  const [loading, setLoading]   = useState(true)

  // Data
  const [intel, setIntel]               = useState<PlatformIntel|null>(null)
  const [hoodIntel, setHoodIntel]       = useState<any[]>([])
  const [verQueue, setVerQueue]         = useState<any[]>([])
  const [agencies, setAgencies]         = useState<any[]>([])
  const [assocs, setAssocs]             = useState<any[]>([])
  const [financing, setFinancing]       = useState<any[]>([])
  const [finPartners, setFinPartners]   = useState<any[]>([])
  const [search, setSearch]             = useState('')
  const [agFilter, setAGF]              = useState<'all'|'verified'|'pending'|'active'>('all')

  // Actions
  const [al, setAL]             = useState<string|null>(null)
  const [rm, setRM]             = useState<{id:string;name:string}|null>(null)
  const [rr, setRR]             = useState('')
  const [am, setAM]             = useState<any|null>(null)
  const [an, setAN]             = useState('')
  const [ap, setAP]             = useState('')

  // Onboard form
  const [ob, setOB] = useState({
    name:'', short_code:'', country_code:'NG', contact_name:'',
    contact_email:'', contact_phone:'', website:'', description:'',
    is_pilot:false, national_admin_email:'',
  })
  const [obStatus, setOS] = useState<'idle'|'loading'|'success'|'error'>('idle')
  const [obMsg, setOM]    = useState('')

  // ── Theme ──────────────────────────────────────────────────
  useEffect(() => {
    return listenTheme(d => setDark(d))
  }, [])

  // ── Auth guard ─────────────────────────────────────────────
  useEffect(() => {
    const { data: { subscription } } = sb.auth.onAuthStateChange(
      async (event, session) => {
        if (!session?.user) { router.replace('/login'); return }
        if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN') return
        const role = session.user.user_metadata?.user_role
        if (role !== 'admin' && role !== 'super_admin') { router.replace('/search'); return }
        await loadAll()
        setLoading(false)
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  const loadAll = useCallback(async () => {
    const [
      { data: pi },
      { data: hi },
      { data: vq },
      { data: ag },
      { data: as_ },
      { data: fr },
      { data: fp },
    ] = await Promise.all([
      // Platform intelligence snapshot
      sb.from('platform_intelligence')
        .select('*').order('computed_at',{ascending:false}).limit(1).maybeSingle(),
      // Top neighborhoods by area score
      sb.from('neighborhood_intelligence')
        .select('neighborhood,city,demand_score_7d,area_score,demand_trend,supply_gap_score,active_listings,verified_transactions,data_quality,financing_requests_30d')
        .eq('meets_display_threshold',true)
        .order('area_score',{ascending:false}).limit(20),
      // Verification queue
      sb.from('verification_requests')
        .select('*, data_partners(name,cities,mape_score), associations(name)')
        .in('status',['pending','under_review'])
        .order('submitted_at',{ascending:true}).limit(100),
      // Agencies
      sb.from('data_partners')
        .select('id,name,contact_email,cities,verification_status,badge_level,mape_score,active,created_at,association_id')
        .eq('partner_type','agency')
        .order('mape_score',{ascending:false}).limit(300),
      // Associations
      sb.from('associations')
        .select('*').order('onboarded_at',{ascending:false}),
      // Financing requests
      sb.from('financing_requests')
        .select('*').order('submitted_at',{ascending:false}).limit(100),
      // Financing partners
      sb.from('financing_partners')
        .select('id,name,partner_type,cities_covered').eq('active',true),
    ])

    setIntel(pi as PlatformIntel)
    setHoodIntel(hi ?? [])
    setVerQueue((vq ?? []).map((r:any) => ({
      ...r,
      agency_name: r.data_partners?.name ?? '—',
      agency_cities: r.data_partners?.cities ?? [],
      agency_mape: r.data_partners?.mape_score ?? 0,
      assoc_name: r.associations?.name ?? null,
    })))
    setAgencies(ag ?? [])
    setAssocs(as_ ?? [])
    setFinancing(fr ?? [])
    setFinPartners(fp ?? [])
  }, [])

  // ── Actions ─────────────────────────────────────────────────
  async function approveVerification(id: string) {
    setAL(id)
    const { data: { session } } = await sb.auth.getSession()
    await sb.from('verification_requests').update({
      status:'approved', reviewed_by:session?.user?.id,
      reviewed_at:new Date().toISOString(),
      verification_note:'Approved by MANOP admin',
    }).eq('id',id)
    setVerQueue(q => q.filter(r => r.id !== id))
    setAL(null)
  }

  async function rejectVerification() {
    if (!rm) return
    setAL(rm.id)
    const { data: { session } } = await sb.auth.getSession()
    await sb.from('verification_requests').update({
      status:'rejected', reviewed_by:session?.user?.id,
      reviewed_at:new Date().toISOString(), rejection_reason:rr,
    }).eq('id',rm.id)
    setVerQueue(q => q.filter(r => r.id !== rm.id))
    setRM(null); setRR(''); setAL(null)
  }

  async function updateFinancingStatus(id:string, status:string, note?:string, partnerId?:string) {
    const updates: any = { status, updated_at:new Date().toISOString() }
    if (note) updates.notes = note
    if (partnerId) { updates.assigned_partner_id = partnerId; updates.assigned_at = new Date().toISOString() }
    await sb.from('financing_requests').update(updates).eq('id',id)
    setFinancing(f => f.map(r => r.id === id ? { ...r, ...updates } : r))
    setAM(null); setAN(''); setAP('')
  }

  async function toggleAgencyActive(id:string, cur:boolean) {
    await sb.from('data_partners').update({active:!cur}).eq('id',id)
    setAgencies(a => a.map((ag:any) => ag.id === id ? {...ag,active:!cur} : ag))
  }

  async function onboard() {
    if (!ob.name||!ob.short_code||!ob.contact_email||!ob.national_admin_email) {
      setOS('error'); setOM('Name, short code, contact email, and national admin email required.'); return
    }
    setOS('loading'); setOM('')
    const token = await getToken()
    const res = await fetch('/api/association/onboard', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
      body:JSON.stringify(ob),
    })
    const data = await res.json()
    if (!res.ok||!data.success) { setOS('error'); setOM(data.error??'Something went wrong'); return }
    setOS('success'); setOM(data.message)
    setOB({ name:'',short_code:'',country_code:'NG',contact_name:'',contact_email:'',contact_phone:'',website:'',description:'',is_pilot:false,national_admin_email:'' })
    await loadAll()
  }

  // ── Filtered agencies ───────────────────────────────────────
  const filteredAgencies = agencies.filter((a:any) => {
    const ms = !search || a.name?.toLowerCase().includes(search.toLowerCase()) || a.contact_email?.toLowerCase().includes(search.toLowerCase())
    const mf = agFilter==='all'?true : agFilter==='verified'?a.verification_status==='verified' : agFilter==='pending'?a.verification_status==='pending' : agFilter==='active'?a.active : true
    return ms && mf
  })

  // ── CSS ─────────────────────────────────────────────────────
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    #admin-root {
      --bg:      ${dark?'#0f172a':'#f0f4f8'};
      --surface: ${dark?'#162032':'#ffffff'};
      --card:    ${dark?'#1e293b':'#ffffff'};
      --border:  ${dark?'rgba(248,250,252,0.07)':'rgba(15,23,42,0.08)'};
      --border2: ${dark?'rgba(248,250,252,0.04)':'rgba(15,23,42,0.04)'};
      --text:    ${dark?'#f8fafc':'#0f172a'};
      --text2:   ${dark?'rgba(248,250,252,0.65)':'rgba(15,23,42,0.65)'};
      --muted:   ${dark?'rgba(248,250,252,0.38)':'rgba(15,23,42,0.4)'};
      --muted2:  ${dark?'rgba(248,250,252,0.22)':'rgba(15,23,42,0.25)'};
      --accent:  #5B2EFF;
      --teal:    #14B8A6;
      --green:   #22C55E;
      --amber:   #F59E0B;
      --red:     #EF4444;
      --inp-bg:  ${dark?'#0f172a':'#f8fafc'};
      --inp-bdr: ${dark?'rgba(248,250,252,0.1)':'rgba(15,23,42,0.12)'};
    }
    #admin-root * { font-family: 'DM Sans', sans-serif; }
    #admin-root {
      display: flex; height: 100vh; overflow: hidden;
      background: var(--bg); color: var(--text);
      position: fixed; top: 0; left: 0; width: 100vw;
    }

    /* Sidebar */
    #admin-root .sb { width:220px;min-width:220px;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;height:100vh;overflow-y:auto; }
    #admin-root .sb-hd { padding:20px 18px 16px;border-bottom:1px solid var(--border); }
    #admin-root .sb-brand { font-size:12px;font-weight:800;color:var(--accent);letter-spacing:.14em;text-transform:uppercase; }
    #admin-root .sb-sub { font-size:10px;color:var(--teal);font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-top:2px; }
    #admin-root .sb-nav { padding:12px 10px;flex:1; }
    #admin-root .sb-section { font-size:9px;font-weight:700;color:var(--muted2);letter-spacing:.12em;text-transform:uppercase;padding:0 8px;margin:14px 0 5px; }
    #admin-root .sb-section:first-child { margin-top:0; }
    #admin-root .ni { all:unset;display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;color:var(--text2);transition:all .15s;width:100%;margin-bottom:1px; }
    #admin-root .ni:hover { background:var(--card);color:var(--text); }
    #admin-root .ni.act { background:rgba(91,46,255,.12);color:var(--accent);border:1px solid rgba(91,46,255,.28); }
    #admin-root .ni-badge { margin-left:auto;background:var(--red);color:white;font-size:9px;font-weight:800;padding:1px 5px;border-radius:9px; }
    #admin-root .sb-bot { padding:10px;border-top:1px solid var(--border); }
    #admin-root .ni-out { color:rgba(239,68,68,.6)!important; }
    #admin-root .ni-out:hover { background:rgba(239,68,68,.08)!important;color:var(--red)!important; }

    /* Main */
    #admin-root .main { flex:1;display:flex;flex-direction:column;overflow:hidden;height:100vh;min-width:0; }
    #admin-root .topbar { padding:15px 26px;border-bottom:1px solid var(--border);background:var(--surface);display:flex;align-items:center;justify-content:space-between;flex-shrink:0; }
    #admin-root .tb-title { font-size:15px;font-weight:800;color:var(--text); }
    #admin-root .tb-sub { font-size:11px;color:var(--muted);margin-top:2px; }
    #admin-root .content { flex:1;overflow-y:auto;overflow-x:hidden;padding:22px 26px; }
    #admin-root .content::-webkit-scrollbar { width:5px; }
    #admin-root .content::-webkit-scrollbar-thumb { background:var(--border);border-radius:3px; }

    /* Grids */
    #admin-root .kpi-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px; }
    #admin-root .kpi-grid-3 { display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px; }
    #admin-root .two-col { display:grid;grid-template-columns:1fr 1fr;gap:16px; }
    #admin-root .three-col { display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px; }

    /* Table */
    #admin-root .tbl { background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:18px; }
    #admin-root .tbl-hd { padding:12px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between; }
    #admin-root .tbl-title { font-size:13px;font-weight:700;color:var(--text); }
    #admin-root .tbl-count { font-size:11px;color:var(--muted);font-family:'DM Mono',monospace; }
    #admin-root table { width:100%;border-collapse:collapse;font-size:12px; }
    #admin-root th { padding:9px 16px;text-align:left;font-size:9.5px;font-weight:700;color:var(--muted2);letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid var(--border); }
    #admin-root td { padding:11px 16px;border-bottom:1px solid var(--border2);vertical-align:middle;color:var(--text2); }
    #admin-root tr:last-child td { border-bottom:none; }
    #admin-root tbody tr:hover td { background:var(--border2); }

    /* Buttons */
    #admin-root .btn { all:unset;display:inline-flex;align-items:center;gap:4px;padding:6px 13px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap; }
    #admin-root .btn-p { background:var(--accent);color:white;border:1px solid var(--accent); }
    #admin-root .btn-p:hover { opacity:.88; }
    #admin-root .btn-p:disabled { opacity:.4;cursor:not-allowed; }
    #admin-root .btn-g { background:transparent;color:var(--text2);border:1px solid var(--border); }
    #admin-root .btn-g:hover { color:var(--text);border-color:var(--text2); }
    #admin-root .btn-ok { background:rgba(34,197,94,.12);color:#22c55e;border:1px solid rgba(34,197,94,.3);padding:4px 10px;font-size:11px; }
    #admin-root .btn-ok:hover { background:rgba(34,197,94,.22); }
    #admin-root .btn-er { background:rgba(239,68,68,.12);color:#ef4444;border:1px solid rgba(239,68,68,.3);padding:4px 10px;font-size:11px; }
    #admin-root .btn-er:hover { background:rgba(239,68,68,.22); }
    #admin-root .btn-sm { padding:3px 9px;font-size:11px; }

    /* Form */
    #admin-root .inp { all:unset;display:block;background:var(--inp-bg);border:1px solid var(--inp-bdr);border-radius:7px;padding:8px 12px;font-size:13px;color:var(--text);width:100%;box-sizing:border-box;transition:border-color .15s; }
    #admin-root .inp:focus { border-color:var(--accent); }
    #admin-root .inp::placeholder { color:var(--muted2); }
    #admin-root select.inp { appearance:none;cursor:pointer; }
    #admin-root textarea.inp { resize:vertical;min-height:70px; }
    #admin-root .lbl { display:block;font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:5px; }
    #admin-root .fg { display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px; }
    #admin-root .fgg { margin-bottom:12px; }

    /* Cards */
    #admin-root .card { background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px 20px;margin-bottom:16px; }
    #admin-root .card-title { font-size:13px;font-weight:700;color:var(--text);margin-bottom:14px; }

    /* Messages */
    #admin-root .msg-ok { background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);border-radius:9px;padding:12px 14px;font-size:12px;color:#22c55e;margin-bottom:14px;line-height:1.6; }
    #admin-root .msg-er { background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:9px;padding:12px 14px;font-size:12px;color:#ef4444;margin-bottom:14px; }
    #admin-root .info-box { background:rgba(91,46,255,.08);border:1px solid rgba(91,46,255,.2);border-radius:9px;padding:12px 14px;font-size:12px;color:var(--text2);line-height:1.7;margin-bottom:14px; }

    /* Toolbar */
    #admin-root .toolbar { display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap; }
    #admin-root .search { all:unset;background:var(--surface);border:1px solid var(--border);border-radius:7px;padding:7px 12px;font-size:12px;color:var(--text);width:200px; }
    #admin-root .search:focus { border-color:var(--accent); }
    #admin-root .filter { all:unset;padding:5px 11px;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--text2);transition:all .15s; }
    #admin-root .filter.on { background:rgba(91,46,255,.12);color:var(--accent);border-color:rgba(91,46,255,.3); }

    /* Modal */
    #admin-root .overlay { position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:200; }
    #admin-root .modal { background:var(--card);border:1px solid var(--border);border-radius:14px;padding:26px;width:440px;max-width:90vw; }
    #admin-root .modal-title { font-size:15px;font-weight:800;color:var(--text);margin-bottom:6px; }
    #admin-root .modal-sub { font-size:12px;color:var(--muted);margin-bottom:16px;line-height:1.6; }

    /* Misc */
    #admin-root .mono { font-family:'DM Mono',monospace;font-size:11px; }
    #admin-root .empty { text-align:center;padding:44px;color:var(--muted);font-size:13px; }
    #admin-root .row { display:flex;align-items:center;gap:8px; }
    #admin-root .row-between { display:flex;align-items:center;justify-content:space-between; }
    #admin-root .theme-btn { all:unset;width:32px;height:32px;border-radius:7px;background:var(--card);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer;transition:all .15s; }
    #admin-root .theme-btn:hover { border-color:var(--accent); }
    #admin-root .cbr { display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text2);cursor:pointer;margin-bottom:10px; }
    #admin-root .highlight-field { background:rgba(91,46,255,.07);border:1px solid rgba(91,46,255,.2);border-radius:9px;padding:14px 16px;margin-bottom:12px; }
    #admin-root .sec-lbl { font-size:10px;font-weight:700;color:var(--muted2);letter-spacing:.1em;text-transform:uppercase;margin:18px 0 10px; }
    #admin-root .sec-lbl:first-child { margin-top:0; }
    #admin-root .trend-up { color:#22c55e;font-size:11px;font-weight:700; }
    #admin-root .trend-dn { color:#ef4444;font-size:11px;font-weight:700; }
    #admin-root .trend-st { color:var(--muted);font-size:11px; }
  `

  const navGroups = [
    { label:'Intelligence', items:[
      { k:'command',      l:'Command Center', i:<LayoutDashboard size={14} /> },
      { k:'signals',      l:'Signal Monitor', i:<Radio size={14} /> },
    ]},
    { label:'Operations', items:[
      { k:'verify',       l:'Verify Queue',   i:<CheckCircle2 size={14} />,  n: verQueue.length },
      { k:'financing',    l:'Financing',       i:<Banknote size={14} />, n: financing.filter((f:any)=>f.status==='submitted').length },
      { k:'agencies',     l:'Agencies',        i:<Building2 size={14} /> },
      { k:'associations', l:'Associations',    i:<Globe size={14} /> },
      { k:'onboard',      l:'Onboard Assoc.', i:<Plus size={14} /> },
    ]},
    { label:'Reviewed Developments', items:[
      { k:'developments', l:'Developers & Projects', i:<Construction size={14} />, external: '/admin/developments' },
      { k:'comparables', l:'Comparables', i:<BarChart3 size={14} />, external: '/admin/comparables' },
    ]},
    { label:'Site Intelligence', items:[
      { k:'site-queue', l:'Site Review Queue', i:<Home size={14} />, external: '/admin/sites' },
    ]},
  ]
  const topbarText: Record<Tab, { title:string; sub:string }> = {
    command:      { title:'Intelligence Command Center',  sub:'Platform-wide signal intelligence snapshot' },
    signals:      { title:'Signal Monitor',               sub:'Real-time signal volume and neighborhood intelligence' },
    verify:       { title:'Verification Queue',           sub:`${verQueue.length} pending review` },
    agencies:     { title:'Agency Management',            sub:`${agencies.length} agencies on platform` },
    associations: { title:'Associations',                 sub:`${assocs.length} partners` },
    onboard:      { title:'Onboard New Association',      sub:'Full setup — no SQL required' },
    financing:    { title:'Financing Requests',           sub:`${financing.filter((f:any)=>f.status==='submitted').length} new, unreviewed` },
  }

  if (loading) return (
    <><style>{css}</style>
    <div id="admin-root" style={{ alignItems:'center', justifyContent:'center', fontSize:13, color:'rgba(248,250,252,0.4)' }}>
      Loading Intelligence Command Center…
    </div></>
  )

  return (
    <>
      <style>{css}</style>
      <div id="admin-root">

        {/* ══ SIDEBAR ══ */}
        <aside className="sb">
          <div className="sb-hd">
            <div className="sb-brand">MANOP</div>
            <div className="sb-sub">Intelligence Platform</div>
          </div>
          <nav className="sb-nav">
            {navGroups.map(g => (
              <div key={g.label}>
                <div className="sb-section">{g.label}</div>
                {g.items.map((item:any) => (
                  <button key={item.k} className={`ni ${tab===item.k?'act':''}`}
                    onClick={()=>item.external ? router.push(item.external) : setTab(item.k as Tab)}>
                    <span style={{fontSize:14}}>{item.i}</span>
                    {item.l}
                    {item.n>0&&<span className="ni-badge">{item.n}</span>}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="sb-bot">
            <button className="ni" onClick={()=>router.push('/agency/dashboard')}>
              <Building2 size={14} /> Agency View
            </button>
            <button className="ni ni-out" onClick={()=>sb.auth.signOut().then(()=>router.replace('/login'))}>
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </aside>

        {/* ══ MAIN ══ */}
        <main className="main">
          <div className="topbar">
            <div>
              <div className="tb-title">{topbarText[tab].title}</div>
              <div className="tb-sub">{topbarText[tab].sub}</div>
            </div>
            <div className="row">
              <button className="theme-btn" onClick={()=>setTheme(!dark)} title={dark?'Light mode':'Dark mode'}>
                {dark ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <span className="mono" style={{color:'var(--muted)'}}>
                {new Date().toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}
              </span>
            </div>
          </div>

          <div className="content">

            {/* ══ COMMAND CENTER ══ */}
            {tab==='command'&&(
              <>
                {/* Platform KPIs */}
                <div className="kpi-grid">
                  <KPI label="Total Agencies"      value={intel?.total_agencies??agencies.length}           accent="#5B2EFF" icon={<Building2 size={16} />} sub={`${intel?.active_agencies_30d??0} active this month`}/>
                  <KPI label="Verified Agencies"   value={intel?.verified_agencies??0}                      accent="#22C55E" icon={<CheckCircle2 size={16} />}  sub={`${intel?.total_agencies?Math.round((intel.verified_agencies/intel.total_agencies)*100):0}% rate`}/>
                  <KPI label="Total Listings"      value={intel?.total_listings??0}                         accent="#3b82f6" icon={<Home size={16} />}/>
                  <KPI label="Verified Txns"       value={intel?.total_verified_transactions??0}            accent="#14B8A6" icon={<ClipboardCheck size={16} />} sub="Confirmed market events"/>
                  <KPI label="Associations"        value={intel?.total_associations??assocs.length}         accent="#8b5cf6" icon={<Globe size={16} />} sub={`${intel?.total_association_members??0} members`}/>
                  <KPI label="Pending Reviews"     value={intel?.pending_verifications??verQueue.length}    accent={verQueue.length>0?'#f59e0b':'#22c55e'} icon={<Clock size={16} />}/>
                </div>

                {/* Signal volume */}
                <div className="two-col">
                  <div className="card">
                    <div className="card-title">Signal Volume (7 days)</div>
                    {intel ? (
                      <>
                        <SignalBar label="Demand Signals"  value={intel.demand_signals_7d}  total={intel.total_signals_7d} color="#5B2EFF"/>
                        <SignalBar label="Supply Signals"  value={intel.supply_signals_7d}  total={intel.total_signals_7d} color="#22C55E"/>
                        <SignalBar label="Trust Signals"   value={intel.trust_signals_7d}   total={intel.total_signals_7d} color="#14B8A6"/>
                        <SignalBar label="Financing (30d)" value={intel.financing_signals_30d} total={Math.max(intel.total_signals_7d,intel.financing_signals_30d)} color="#F59E0B"/>
                        <div style={{marginTop:10,padding:'10px 0',borderTop:'1px solid var(--border)',display:'flex',justifyContent:'space-between'}}>
                          <span style={{fontSize:11,color:'var(--muted)'}}>Total signals captured</span>
                          <span className="mono" style={{fontWeight:700,color:'var(--text)'}}>{intel.total_signals_7d.toLocaleString()}</span>
                        </div>
                      </>
                    ) : (
                      <div style={{color:'var(--muted)',fontSize:12}}>
                        Run the MAPE cron once to populate signal intelligence.<br/>
                        <code style={{fontSize:11,background:'var(--border)',padding:'2px 6px',borderRadius:4}}>GET /api/cron/compute-mape</code>
                      </div>
                    )}
                  </div>

                  <div className="card">
                    <div className="card-title">Data Quality</div>
                    {intel ? (
                      <>
                        <SignalBar label="Listings with Price"  value={Math.round(intel.pct_listings_with_price??0)}  total={100} color="#22C55E"/>
                        <SignalBar label="Listings with Images" value={Math.round(intel.pct_listings_with_images??0)} total={100} color="#3b82f6"/>
                        <div style={{marginTop:12,display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                          {[
                            { label:'Avg MAPE Score', value: intel.avg_mape_score ? Math.round(intel.avg_mape_score) : 0 },
                            { label:'Financing Demand', value: intel.financing_requests_30d ?? 0 },
                          ].map(s=>(
                            <div key={s.label} style={{background:'var(--border2)',borderRadius:8,padding:'10px 12px'}}>
                              <div style={{fontSize:10,color:'var(--muted)',fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase' as const,marginBottom:4}}>{s.label}</div>
                              <div style={{fontSize:20,fontWeight:800,color:'var(--text)'}}>{s.value}</div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div style={{color:'var(--muted)',fontSize:12}}>No intelligence computed yet.</div>
                    )}
                  </div>
                </div>

                {/* Top neighborhoods */}
                <div className="tbl">
                  <div className="tbl-hd">
                    <span className="tbl-title">Top Neighborhoods by Area Score</span>
                    <span className="tbl-count">{hoodIntel.length} neighborhoods tracked</span>
                  </div>
                  {hoodIntel.length===0?(
                    <div className="empty">No neighborhood intelligence yet. Run the MAPE cron to compute area scores.</div>
                  ):(
                    <table>
                      <thead><tr><th>Neighborhood</th><th>City</th><th>Area Score</th><th>Demand 7d</th><th>Supply Gap</th><th>Listings</th><th>Verified Txns</th><th>Trend</th><th>Quality</th></tr></thead>
                      <tbody>
                        {hoodIntel.map((n:any)=>(
                          <tr key={n.neighborhood+n.city}>
                            <td style={{fontWeight:700,color:'var(--text)'}}>{n.neighborhood}</td>
                            <td style={{color:'var(--muted)'}}>{n.city}</td>
                            <td>
                              <div style={{display:'flex',alignItems:'center',gap:8}}>
                                <span style={{fontWeight:800,fontSize:14}}>{n.area_score}</span>
                                <div style={{width:40,height:4,background:'var(--border)',borderRadius:2,overflow:'hidden'}}>
                                  <div style={{width:`${n.area_score}%`,height:'100%',background:'#5B2EFF',borderRadius:2}}/>
                                </div>
                              </div>
                            </td>
                            <td style={{fontWeight:600}}>{n.demand_score_7d}</td>
                            <td>
                              <span style={{color:n.supply_gap_score>60?'#ef4444':n.supply_gap_score>30?'#f59e0b':'var(--muted)',fontWeight:600}}>
                                {n.supply_gap_score}
                              </span>
                            </td>
                            <td>{n.active_listings}</td>
                            <td>{n.verified_transactions??0}</td>
                            <td>
                              <span className={n.demand_trend==='rising'?'trend-up':n.demand_trend==='falling'?'trend-dn':'trend-st'}>
                                {n.demand_trend==='rising'?'↑ Rising':n.demand_trend==='falling'?'↓ Falling':'→ Stable'}
                              </span>
                            </td>
                            <td><Pill v={n.data_quality} map={{high:'#22c55e',medium:'#f59e0b',low:'#f59e0b',sparse:'#64748b'}}/></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Financing summary */}
                <div className="two-col">
                  <div className="card">
                    <div className="card-title">Financing Pipeline</div>
                    {[
                      { label:'New (Unreviewed)', value:financing.filter((f:any)=>f.status==='submitted').length, color:'#f59e0b' },
                      { label:'In Review',        value:financing.filter((f:any)=>f.status==='reviewing').length, color:'#3b82f6' },
                      { label:'With Partner',     value:financing.filter((f:any)=>['sent_to_partner','partner_contacted','in_progress'].includes(f.status)).length, color:'#14B8A6' },
                      { label:'Closed / Won',     value:financing.filter((f:any)=>f.status==='closed').length, color:'#22c55e' },
                    ].map(s=>(
                      <div key={s.label} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid var(--border2)'}}>
                        <span style={{fontSize:12,color:'var(--text2)'}}>{s.label}</span>
                        <span style={{fontWeight:700,fontSize:14,color:s.color}}>{s.value}</span>
                      </div>
                    ))}
                    <div style={{marginTop:12,fontSize:11,color:'var(--muted)'}}>
                      Total demand: ₦{((financing.reduce((s:number,f:any)=>s+(f.loan_amount_requested??0),0))/1e6).toFixed(0)}M in pipeline
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-title">Association Health</div>
                    {assocs.length===0?(
                      <div style={{color:'var(--muted)',fontSize:12}}>No associations onboarded yet.</div>
                    ):(
                      assocs.slice(0,5).map((a:any)=>(
                        <div key={a.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid var(--border2)'}}>
                          <div>
                            <div style={{fontSize:12,fontWeight:700,color:'var(--text)'}}>{a.name}</div>
                            <div className="mono" style={{color:'var(--muted)',marginTop:1}}>{a.short_code} · {a.country_code}</div>
                          </div>
                          <Pill v={a.status} map={STATUS_COLORS}/>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ══ SIGNAL MONITOR ══ */}
            {tab==='signals'&&(
              <>
                <div className="info-box">
                  <strong style={{color:'var(--text)'}}>Signal Intelligence is live.</strong><br/>
                  Every user action generates a weighted signal. Signals are categorised, weighted, and aggregated into neighborhood and platform intelligence. Run the MAPE cron to refresh these scores.
                </div>

                <div className="kpi-grid">
                  <KPI label="Total Signals 7d"    value={(intel?.total_signals_7d??0).toLocaleString()}     accent="#5B2EFF" icon={<Radio size={16} />}/>
                  <KPI label="Demand Signals"      value={(intel?.demand_signals_7d??0).toLocaleString()}     accent="#5B2EFF"/>
                  <KPI label="Supply Signals"      value={(intel?.supply_signals_7d??0).toLocaleString()}     accent="#22C55E"/>
                  <KPI label="Trust Signals"       value={(intel?.trust_signals_7d??0).toLocaleString()}      accent="#14B8A6"/>
                  <KPI label="Financing Signals"   value={(intel?.financing_signals_30d??0).toLocaleString()} accent="#F59E0B" sub="30 day window"/>
                  <KPI label="Transaction Signals" value={(intel?.transaction_signals_30d??0).toLocaleString()} accent="#3b82f6" sub="30 day window"/>
                </div>

                <div className="tbl">
                  <div className="tbl-hd">
                    <span className="tbl-title">Neighborhood Intelligence</span>
                    <button className="btn btn-p btn-sm" onClick={()=>sb.rpc('compute_neighborhood_intelligence').then(()=>loadAll())}>
                      Refresh Now
                    </button>
                  </div>
                  {hoodIntel.length===0?(
                    <div className="empty">No neighborhoods tracked yet. Signals are captured as users search and view properties.</div>
                  ):(
                    <table>
                      <thead><tr><th>Neighborhood</th><th>City</th><th>Area Score</th><th>Demand</th><th>Supply Gap</th><th>Financing Demand</th><th>Trust</th><th>Quality</th></tr></thead>
                      <tbody>
                        {hoodIntel.map((n:any)=>(
                          <tr key={n.neighborhood+n.city}>
                            <td style={{fontWeight:700,color:'var(--text)'}}>{n.neighborhood}</td>
                            <td style={{color:'var(--muted)'}}>{n.city}</td>
                            <td><span style={{fontWeight:800}}>{n.area_score}</span>/100</td>
                            <td><span style={{fontWeight:600}}>{n.demand_score_7d}</span></td>
                            <td><span style={{color:n.supply_gap_score>50?'#ef4444':'var(--text2)',fontWeight:n.supply_gap_score>50?700:400}}>{n.supply_gap_score}</span></td>
                            <td>{n.financing_requests_30d??0}</td>
                            <td>{n.verified_agencies??0}/{n.total_agencies??0} verified</td>
                            <td><Pill v={n.data_quality} map={{high:'#22c55e',medium:'#f59e0b',low:'#f59e0b',sparse:'#64748b'}}/></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}

            {/* ══ VERIFY QUEUE ══ */}
            {tab==='verify'&&(
              <div className="tbl">
                <div className="tbl-hd">
                  <span className="tbl-title">All Pending Verifications</span>
                  <span className="tbl-count">{verQueue.length} pending</span>
                </div>
                {verQueue.length===0?<div className="empty" style={{display:'flex',alignItems:'center',gap:6}}><CheckCircle2 size={14}/> Queue is clear</div>:(
                  <table>
                    <thead><tr><th>Agency</th><th>Type</th><th>Ref</th><th>Cities</th><th>MAPE</th><th>Submitted</th><th>Action</th></tr></thead>
                    <tbody>
                      {verQueue.map((r:any)=>(
                        <tr key={r.id}>
                          <td>
                            <div style={{fontWeight:700,color:'var(--text)'}}>{r.agency_name}</div>
                            {r.assoc_name&&<div style={{fontSize:10,color:'var(--teal)',marginTop:2}}>{r.assoc_name}</div>}
                          </td>
                          <td><Pill v={r.verification_type} map={STATUS_COLORS}/></td>
                          <td className="mono">{r.membership_number||r.cac_number||r.body_code||'—'}</td>
                          <td style={{fontSize:11,color:'var(--muted)'}}>{r.agency_cities?.slice(0,2).join(', ')||'—'}</td>
                          <td style={{fontWeight:700}}>{r.agency_mape}</td>
                          <td className="mono" style={{color:'var(--muted)'}}>{new Date(r.submitted_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</td>
                          <td>
                            <div className="row">
                              <button className="btn btn-ok" onClick={()=>approveVerification(r.id)} disabled={al===r.id}>Approve</button>
                              <button className="btn btn-er" onClick={()=>setRM({id:r.id,name:r.agency_name})}>Reject</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ══ FINANCING ══ */}
            {tab==='financing'&&(
              <>
                <div className="kpi-grid-3" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
                  <KPI label="Total Requests"  value={financing.length}                                                        accent="#5B2EFF" icon={<Banknote size={16} />}/>
                  <KPI label="Unreviewed"      value={financing.filter((f:any)=>f.status==='submitted').length}                accent="#f59e0b" icon={<Clock size={16} />}/>
                  <KPI label="In Progress"     value={financing.filter((f:any)=>['reviewing','sent_to_partner','in_progress'].includes(f.status)).length} accent="#14B8A6" icon={<BarChart3 size={16} />}/>
                  <KPI label="Closed"          value={financing.filter((f:any)=>f.status==='closed').length}                   accent="#22c55e" icon={<CheckCircle2 size={16} />}/>
                </div>

                <div className="info-box">
                  <strong style={{color:'var(--text)'}}>Manual matching mode.</strong><br/>
                  Review each request, contact the financing institution directly, then update the status below.
                  When you have signed partners, add them to the financing_partners table and assign here.
                </div>

                <div className="tbl">
                  <div className="tbl-hd">
                    <span className="tbl-title">Financing Requests</span>
                    <span className="tbl-count">{financing.length} total</span>
                  </div>
                  {financing.length===0?(
                    <div className="empty">No financing requests yet. The "Get Financed" button on property pages will send requests here.</div>
                  ):(
                    <table>
                      <thead><tr><th>Buyer</th><th>Type</th><th>Property Value</th><th>Loan</th><th>City</th><th>Employment</th><th>Status</th><th>Submitted</th><th>Action</th></tr></thead>
                      <tbody>
                        {financing.map((r:any)=>(
                          <tr key={r.id}>
                            <td>
                              <div style={{fontWeight:700,color:'var(--text)'}}>{r.buyer_name}</div>
                              <div className="mono" style={{marginTop:2}}>{r.buyer_email}</div>
                              <div style={{fontSize:10,color:'var(--muted)',marginTop:1}}>{r.buyer_phone}</div>
                            </td>
                            <td><Pill v={r.financing_type} map={STATUS_COLORS}/></td>
                            <td style={{fontWeight:700}}>₦{r.estimated_price_ngn?(r.estimated_price_ngn/1e6).toFixed(0)+'M':'—'}</td>
                            <td>{r.loan_amount_requested?`₦${(r.loan_amount_requested/1e6).toFixed(0)}M`:'—'}</td>
                            <td style={{color:'var(--muted)',fontSize:12}}>{r.buyer_city}</td>
                            <td style={{fontSize:11,color:'var(--muted)'}}>{r.employment_status?.replace(/_/g,' ')??'—'}</td>
                            <td><Pill v={r.status} map={STATUS_COLORS}/></td>
                            <td className="mono" style={{color:'var(--muted)'}}>{new Date(r.submitted_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</td>
                            <td>
                              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                                {r.status==='submitted'&&<button className="btn btn-ok btn-sm" onClick={()=>updateFinancingStatus(r.id,'reviewing')}>Review</button>}
                                {['reviewing','submitted'].includes(r.status)&&<button className="btn btn-ok btn-sm" onClick={()=>{setAM(r);setAP('');setAN('')}}>Route →</button>}
                                {['sent_to_partner','partner_contacted','in_progress'].includes(r.status)&&<button className="btn btn-ok btn-sm" onClick={()=>updateFinancingStatus(r.id,'closed')}>Close</button>}
                                {!['rejected','withdrawn','closed'].includes(r.status)&&<button className="btn btn-er btn-sm" onClick={()=>updateFinancingStatus(r.id,'rejected')}>Reject</button>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}

            {/* ══ AGENCIES ══ */}
            {tab==='agencies'&&(
              <>
                <div className="toolbar">
                  <input className="search" placeholder="Search agencies…" value={search} onChange={e=>setSearch(e.target.value)}/>
                  {(['all','verified','pending','active'] as const).map(f=>(
                    <button key={f} className={`filter ${agFilter===f?'on':''}`} onClick={()=>setAGF(f)}>
                      {f.charAt(0).toUpperCase()+f.slice(1)}
                    </button>
                  ))}
                  <span className="mono" style={{color:'var(--muted)',marginLeft:'auto'}}>{filteredAgencies.length} shown</span>
                </div>
                <div className="tbl">
                  <table>
                    <thead><tr><th>Agency</th><th>Email</th><th>Cities</th><th>MAPE</th><th>Badge</th><th>Verification</th><th>Active</th><th>Assoc</th></tr></thead>
                    <tbody>
                      {filteredAgencies.map((a:any)=>(
                        <tr key={a.id}>
                          <td style={{fontWeight:700,color:'var(--text)'}}>{a.name}</td>
                          <td className="mono">{a.contact_email||'—'}</td>
                          <td style={{fontSize:11,color:'var(--muted)'}}>{a.cities?.slice(0,2).join(', ')||'—'}</td>
                          <td style={{fontWeight:700}}>{a.mape_score??0}</td>
                          <td><Pill v={a.badge_level||'listed'} map={STATUS_COLORS}/></td>
                          <td><Pill v={a.verification_status||'not_started'} map={STATUS_COLORS}/></td>
                          <td>
                            <button className={`btn ${a.active?'btn-ok':'btn-g'} btn-sm`} onClick={()=>toggleAgencyActive(a.id,a.active)}>
                              {a.active?'Active':'Inactive'}
                            </button>
                          </td>
                          <td style={{fontSize:11,color:'var(--muted)'}}>{a.association_id?<CheckCircle2 size={13} style={{color:'#22c55e'}}/>:'—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ══ ASSOCIATIONS ══ */}
            {tab==='associations'&&(
              <div className="tbl">
                <div className="tbl-hd">
                  <span className="tbl-title">Association Partners</span>
                  <button className="btn btn-p btn-sm" onClick={()=>setTab('onboard')}>+ Onboard New</button>
                </div>
                {assocs.length===0?<div className="empty">No associations yet</div>:(
                  <table>
                    <thead><tr><th>Name</th><th>Code</th><th>Country</th><th>Contact</th><th>Status</th><th>Type</th><th>Onboarded</th></tr></thead>
                    <tbody>
                      {assocs.map((a:any)=>(
                        <tr key={a.id}>
                          <td style={{fontWeight:700,color:'var(--text)'}}>{a.name}</td>
                          <td><span className="mono">{a.short_code}</span></td>
                          <td style={{color:'var(--muted)'}}>{a.country_code}</td>
                          <td className="mono">{a.contact_email||'—'}</td>
                          <td><Pill v={a.status} map={STATUS_COLORS}/></td>
                          <td>{a.is_pilot?<span style={{color:'var(--teal)',fontWeight:700,fontSize:11,display:'inline-flex',alignItems:'center',gap:4}}><Star size={12} fill="currentColor"/> PILOT</span>:'Standard'}</td>
                          <td className="mono" style={{color:'var(--muted)'}}>{new Date(a.onboarded_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'2-digit'})}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ══ ONBOARD ══ */}
            {tab==='onboard'&&(
              <div style={{maxWidth:620}}>
                <div className="info-box" style={{marginBottom:18}}>
                  <strong style={{color:'var(--text)'}}>One click — full setup.</strong><br/>
                  Creates the association, creates their admin account, assigns the national admin role, sends activation email.
                  No SQL. No manual steps.
                </div>
                {obStatus==='success'&&<div className="msg-ok" style={{display:'flex',alignItems:'center',gap:6}}><CheckCircle2 size={14}/> {obMsg}</div>}
                {obStatus==='error'&&<div className="msg-er">{obMsg}</div>}
                <div className="fg">
                  <div className="fgg"><label className="lbl">Association Name *</label><input className="inp" placeholder="e.g. Ghana Real Estate Association" value={ob.name} onChange={e=>setOB(p=>({...p,name:e.target.value}))}/></div>
                  <div className="fgg"><label className="lbl">Short Code * (3-6 letters)</label><input className="inp" placeholder="e.g. GREA" value={ob.short_code} onChange={e=>setOB(p=>({...p,short_code:e.target.value.toUpperCase()}))} maxLength={6}/></div>
                </div>
                <div className="fg">
                  <div className="fgg">
                    <label className="lbl">Country</label>
                    <select className="inp" value={ob.country_code} onChange={e=>setOB(p=>({...p,country_code:e.target.value}))}>
                      <option value="NG">Nigeria</option><option value="GH">Ghana</option>
                      <option value="KE">Kenya</option><option value="ZA">South Africa</option>
                      <option value="RW">Rwanda</option><option value="UG">Uganda</option><option value="TZ">Tanzania</option>
                    </select>
                  </div>
                  <div className="fgg"><label className="lbl">Association Contact Email</label><input className="inp" type="email" placeholder="info@association.org" value={ob.contact_email} onChange={e=>setOB(p=>({...p,contact_email:e.target.value}))}/></div>
                </div>
                <div className="fg">
                  <div className="fgg"><label className="lbl">Contact Person</label><input className="inp" placeholder="National Secretary" value={ob.contact_name} onChange={e=>setOB(p=>({...p,contact_name:e.target.value}))}/></div>
                  <div className="fgg"><label className="lbl">Contact Phone</label><input className="inp" placeholder="+234…" value={ob.contact_phone} onChange={e=>setOB(p=>({...p,contact_phone:e.target.value}))}/></div>
                </div>
                <div className="fgg"><label className="lbl">Website</label><input className="inp" placeholder="https://association.org" value={ob.website} onChange={e=>setOB(p=>({...p,website:e.target.value}))}/></div>
                <div className="fgg"><label className="lbl">Description</label><textarea className="inp" rows={2} value={ob.description} onChange={e=>setOB(p=>({...p,description:e.target.value}))} placeholder="Brief scope description…"/></div>
                <div className="highlight-field">
                  <label className="lbl" style={{color:'var(--accent)'}}>National Admin Email * — receives dashboard access</label>
                  <input className="inp" type="email" placeholder="national.admin@association.org" value={ob.national_admin_email} onChange={e=>setOB(p=>({...p,national_admin_email:e.target.value}))}/>
                  <div style={{fontSize:11,color:'var(--muted)',marginTop:6,lineHeight:1.6}}>They set their own password. You never share credentials.</div>
                </div>
                <div className="fgg"><label className="cbr"><input type="checkbox" checked={ob.is_pilot} onChange={e=>setOB(p=>({...p,is_pilot:e.target.checked}))}/> Mark as Pilot Association</label></div>
                <div className="row" style={{marginTop:14}}>
                  <button className="btn btn-p" onClick={onboard} disabled={obStatus==='loading'}>
                    {obStatus==='loading'?'Creating…':'Create Association & Send Access'}
                  </button>
                  <button className="btn btn-g" onClick={()=>setOB({name:'',short_code:'',country_code:'NG',contact_name:'',contact_email:'',contact_phone:'',website:'',description:'',is_pilot:false,national_admin_email:''})}>Clear</button>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>

      {/* ══ FINANCING ROUTE MODAL ══ */}
      {am&&(
        <div id="admin-root"><style>{css}</style>
        <div className="overlay" onClick={()=>setAM(null)}>
          <div className="modal" onClick={(e:any)=>e.stopPropagation()}>
            <div className="modal-title">Route Financing Request</div>
            <div className="modal-sub">
              Routing <strong>{am.buyer_name}</strong> · {am.buyer_city}<br/>
              Property value: <strong>₦{am.estimated_price_ngn?(am.estimated_price_ngn/1e6).toFixed(0)+'M':'—'}</strong> · Type: {am.financing_type}
            </div>
            {finPartners.length>0&&(
              <div className="fgg">
                <label className="lbl">Assign to Partner (optional)</label>
                <select className="inp" value={ap} onChange={(e:any)=>setAP(e.target.value)}>
                  <option value="">Manual — no partner assigned yet</option>
                  {finPartners.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <div className="fgg">
              <label className="lbl">Internal Notes</label>
              <textarea className="inp" rows={3} placeholder="e.g. Contacting First Bank Lagos branch. Buyer earns ₦800k/month, good candidate." value={an} onChange={(e:any)=>setAN(e.target.value)}/>
            </div>
            <div className="row" style={{justifyContent:'flex-end'}}>
              <button className="btn btn-g" onClick={()=>setAM(null)}>Cancel</button>
              <button className="btn btn-p" onClick={()=>updateFinancingStatus(am.id,ap?'sent_to_partner':'reviewing',an,ap||undefined)}>
                {ap?'Route to Partner':'Mark as Reviewing'}
              </button>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* ══ REJECT MODAL ══ */}
      {rm&&(
        <div id="admin-root"><style>{css}</style>
        <div className="overlay" onClick={()=>setRM(null)}>
          <div className="modal" onClick={(e:any)=>e.stopPropagation()}>
            <div className="modal-title">Reject Verification</div>
            <div className="modal-sub">Rejecting <strong>{rm.name}</strong>. They will be notified.</div>
            <label className="lbl">Reason *</label>
            <textarea className="inp" rows={3} style={{marginBottom:14}} placeholder="e.g. CAC number not found. Please resubmit with correct documentation." value={rr} onChange={e=>setRR(e.target.value)}/>
            <div className="row" style={{justifyContent:'flex-end'}}>
              <button className="btn btn-g" onClick={()=>setRM(null)}>Cancel</button>
              <button className="btn btn-er" onClick={rejectVerification} disabled={!rr||al===rm.id}>
                {al===rm.id?'Rejecting…':'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
        </div>
      )}
    </>
  )
}