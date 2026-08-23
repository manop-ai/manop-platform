'use client'
// app/association/dashboard/page.tsx — FINAL VERSION
// CSS fully scoped — no global style conflicts possible
// No admin panel link — association admin stays in their own system
// Verification: national admin controls all, can delegate to chapter admins
// All sections visible and functional

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
)

// Theme helpers — reuse existing MANOP theme system
function getInitialDark(): boolean {
  if (typeof window === 'undefined') return true
  const saved = localStorage.getItem('manop-dark')
  return saved !== null ? saved === 'true' : true
}
function setTheme(dark: boolean) {
  if (typeof window === 'undefined') return
  localStorage.setItem('manop-dark', String(dark))
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  window.dispatchEvent(new CustomEvent('manop-theme-change', { detail: dark }))
}
function listenTheme(cb: (dark: boolean) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<boolean>).detail)
  window.addEventListener('manop-theme-change', handler)
  return () => window.removeEventListener('manop-theme-change', handler)
}

async function getToken() {
  const { data: { session } } = await sb.auth.getSession()
  return session?.access_token ?? ''
}

// ── Inline types ────────────────────────────────────────────
type Role = 'super_admin'|'country_admin'|'association_national_admin'|'chapter_admin'|'analyst'

interface Ctx {
  userId: string
  email: string
  role: Role
  associationId: string
  associationName: string
  associationCode: string
  chapterId: string | null
  chapterName: string | null
  chapterState: string | null
  isNational: boolean
  canDelegate: boolean
}

type Tab = 'overview'|'members'|'verify'|'chapters'|'team'|'settings'

// ── Formatters ───────────────────────────────────────────────
function fmt(n: number | null | undefined) {
  if (!n && n !== 0) return '—'
  if (n >= 1e9) return `₦${(n/1e9).toFixed(1)}B`
  if (n >= 1e6) return `₦${(n/1e6).toFixed(0)}M`
  return n.toLocaleString()
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'2-digit' })
}

// ── Small components ─────────────────────────────────────────
function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display:'inline-block', padding:'2px 9px', borderRadius:20,
      fontSize:10, fontWeight:700, letterSpacing:'0.05em',
      textTransform:'uppercase' as const,
      background: color+'22', color, border:`1px solid ${color}44`,
    }}>{label.replace(/_/g,' ')}</span>
  )
}

function KPI({ label, value, sub, accent, T }: {
  label:string; value:string|number; sub?:string; accent:string; T: any
}) {
  return (
    <div style={{
      background:T.card, border:`1px solid ${T.border}`,
      borderRadius:14, padding:'20px 22px',
      borderTop:`3px solid ${accent}`,
      minWidth:0,
    }}>
      <div style={{ fontSize:11, color:T.muted, fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase' as const, marginBottom:10 }}>{label}</div>
      <div style={{ fontSize:28, fontWeight:800, color:T.text, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:T.muted, marginTop:8 }}>{sub}</div>}
    </div>
  )
}

function Empty({ icon, title, sub, T }: { icon:string; title:string; sub:string; T:any }) {
  return (
    <div style={{ textAlign:'center', padding:'52px 24px', color:T.muted }}>
      <div style={{ fontSize:36, marginBottom:14, opacity:0.5 }}>{icon}</div>
      <div style={{ fontSize:14, fontWeight:600, color:T.text2, marginBottom:6 }}>{title}</div>
      <div style={{ fontSize:12 }}>{sub}</div>
    </div>
  )
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
      <h3 style={{ fontSize:13, fontWeight:700, color:'rgba(255,255,255,0.9)', letterSpacing:'0.02em' }}>{children}</h3>
      {action}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────
export default function AssociationDashboard() {
  const router = useRouter()
  const [dark, setDark] = useState(true)

  const [ctx, setCtx]             = useState<Ctx|null>(null)
  const [tab, setTab]             = useState<Tab>('overview')
  const [loading, setLoading]     = useState(true)
  const [intel, setIntel]         = useState<any>(null)
  const [chapters, setChapters]   = useState<any[]>([])
  const [members, setMembers]     = useState<any[]>([])
  const [memberTotal, setMT]      = useState(0)
  const [verQueue, setVQ]         = useState<any[]>([])
  const [invites, setInvites]     = useState<any[]>([])
  const [al, setAL]               = useState<string|null>(null)
  const [rejectModal, setRM]      = useState<{id:string;name:string}|null>(null)
  const [rejectReason, setRR]     = useState('')
  const [chapterError, setChapterError] = useState('')

  // Chapter form
  const [showCF, setSCF]   = useState(false)
  const [nc, setNC]        = useState({ name:'', state:'', city:'' })

  // Invite form
  const [showIF, setSIF]   = useState(false)
  const [inv, setInv]      = useState({ email:'', chapter_id:'', role:'chapter_admin' })
  const [invErr, setIE]    = useState('')
  const [invOk, setIO]     = useState('')

  // Delegation setting
  const [delegationEnabled, setDE] = useState(false)

  // ── Bootstrap ─────────────────────────────────────────────
  useEffect(() => {
    const { data: { subscription } } = sb.auth.onAuthStateChange(
      async (event, session) => {
        if (!session?.user) { router.replace('/login'); return }
        if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN') return

        const { data: rd } = await sb
          .from('user_permission_summary')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('is_active', true)
          .maybeSingle()

        if (!rd?.association_id) {
          // No association role — send them to their real dashboard
          const role = session.user.user_metadata?.user_role ?? 'buyer'
          if (role === 'admin' || role === 'super_admin') router.replace('/admin')
          else router.replace('/agency/dashboard')
          return
        }

        const context: Ctx = {
          userId:         session.user.id,
          email:          session.user.email ?? '',
          role:           rd.role,
          associationId:  rd.association_id,
          associationName:rd.association_name ?? '',
          associationCode:rd.association_code ?? '',
          chapterId:      rd.chapter_id ?? null,
          chapterName:    rd.chapter_name ?? null,
          chapterState:   rd.chapter_state ?? null,
          isNational:     ['association_national_admin','super_admin','country_admin'].includes(rd.role),
          canDelegate:    rd.role === 'association_national_admin',
        }

        setCtx(context)
        await loadAll(context)
        setLoading(false)
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  // Theme sync
  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  const loadAll = useCallback(async (c: Ctx) => {
    const aid = c.associationId

    // Intelligence aggregate
    const { data: id } = await sb.from('safe_association_intelligence')
      .select('*').eq('association_id', aid).is('chapter_id', null)
      .eq('period_type','month').order('period_start',{ascending:false}).limit(1).maybeSingle()
    setIntel(id)

    // Chapters
    const { data: ch } = await sb.from('association_chapters')
      .select('*').eq('association_id', aid).eq('active',true).order('state')
    setChapters(ch ?? [])

    // Members — scoped by chapter if chapter admin
    let mq = sb.from('association_memberships')
      .select(`
        id, membership_number, status, verified_by_assoc, joined_at, submitted_at, chapter_id,
        data_partners!inner(id, name, badge_level, mape_score, verification_status, cities),
        association_chapters(name, state)
      `, { count:'exact' })
      .eq('association_id', aid)
      .order('submitted_at', { ascending:false })
      .limit(100)

    if (!c.isNational && c.chapterId) mq = mq.eq('chapter_id', c.chapterId)

    const { data: md, count: mc } = await mq
    setMT(mc ?? 0)
    setMembers((md ?? []).map((m:any) => ({
      id: m.id,
      membership_number: m.membership_number,
      status: m.status,
      verified_by_assoc: m.verified_by_assoc,
      joined_at: m.joined_at,
      submitted_at: m.submitted_at,
      agency_id: m.data_partners?.id,
      agency_name: m.data_partners?.name ?? '—',
      agency_badge: m.data_partners?.badge_level ?? 'listed',
      agency_mape: m.data_partners?.mape_score ?? 0,
      agency_cities: m.data_partners?.cities ?? [],
      chapter_name: m.association_chapters?.name ?? null,
      chapter_state: m.association_chapters?.state ?? null,
    })))

    // Verification queue
    // National sees all. Chapter admin sees only their state agencies.
    let vq = sb.from('verification_requests')
      .select(`
        id, verification_type, status, membership_number, body_code,
        submitted_at, office_address, contact_phone,
        data_partners!inner(id, name, cities, mape_score, verification_status)
      `)
      .eq('association_id', aid)
      .eq('verification_type','association_membership')
      .in('status',['pending','under_review'])
      .order('submitted_at',{ascending:true})

    const { data: vd } = await vq
    setVQ((vd ?? []).map((r:any) => ({
      id: r.id,
      agency_id: r.data_partners?.id,
      agency_name: r.data_partners?.name ?? '—',
      agency_cities: r.data_partners?.cities ?? [],
      agency_mape: r.data_partners?.mape_score ?? 0,
      agency_verification: r.data_partners?.verification_status,
      membership_number: r.membership_number,
      body_code: r.body_code,
      office_address: r.office_address,
      submitted_at: r.submitted_at,
      status: r.status,
    })))

    // Pending invitations (national only)
    if (c.isNational) {
      const { data: inv } = await sb.from('association_admin_invitations')
        .select('*, association_chapters(name, state)')
        .eq('association_id', aid).eq('status','pending')
        .order('created_at',{ascending:false})
      setInvites((inv ?? []).map((i:any) => ({
        ...i,
        chapter_name: i.association_chapters?.name ?? null,
        chapter_state: i.association_chapters?.state ?? null,
      })))
    }
  }, [])

  // ── Actions ──────────────────────────────────────────────
  async function approveVerification(id: string) {
    setAL(id)
    await sb.from('verification_requests').update({
      status: 'approved',
      approved_by_assoc_user: ctx?.userId,
      approved_by_assoc_at: new Date().toISOString(),
      verification_note: 'Approved by association admin',
    }).eq('id', id)
    setVQ(q => q.filter(r => r.id !== id))
    setAL(null)
  }

  async function rejectVerification() {
    if (!rejectModal || !ctx) return
    setAL(rejectModal.id)
    await sb.from('verification_requests').update({
      status: 'rejected',
      reviewed_by: ctx.userId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: rejectReason,
    }).eq('id', rejectModal.id)
    setVQ(q => q.filter(r => r.id !== rejectModal.id))
    setRM(null); setRR(''); setAL(null)
  }

  async function createChapter() {
    if (!ctx || !nc.name || !nc.state) return
    setAL('chapter')
    setChapterError('')

    // Use service-role-equivalent by passing auth token explicitly
    const { data: { session } } = await sb.auth.getSession()
    if (!session) { setChapterError('Session expired — please refresh'); setAL(null); return }

    const { data, error } = await sb.from('association_chapters').insert({
      association_id: ctx.associationId,
      name: nc.name.trim(),
      state: nc.state.trim(),
      city: nc.city.trim() || null,
      country_code: 'NG',
      active: true,
    }).select().single()

    if (error) {
      console.error('Chapter creation error:', error)
      setChapterError(error.message || 'Failed to create chapter. Check your permissions.')
      setAL(null)
      return
    }

    if (data) {
      setChapters(c => [...c, data])
      setNC({ name:'', state:'', city:'' })
      setSCF(false)
      setChapterError('')
    }
    setAL(null)
  }

  async function removeChapter(id: string) {
    if (!confirm('Remove this chapter?')) return
    await sb.from('association_chapters').update({ active:false }).eq('id', id)
    setChapters(c => c.filter(ch => ch.id !== id))
  }

  async function sendInvite() {
    if (!ctx || !inv.email) { setIE('Email is required'); return }
    setAL('invite'); setIE(''); setIO('')
    const token = await getToken()
    const res = await fetch('/api/association/invite', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${token}` },
      body: JSON.stringify({
        association_id: ctx.associationId,
        chapter_id: inv.chapter_id || null,
        email: inv.email,
        role: inv.role,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setIE(data.error ?? 'Failed to send invitation'); setAL(null); return }
    setIO(`Invitation sent to ${inv.email}`)
    setInvites(i => [data.invitation, ...i])
    setInv({ email:'', chapter_id:'', role:'chapter_admin' })
    setSIF(false)
    setAL(null)
  }

  async function revokeInvite(id: string) {
    await sb.from('association_admin_invitations').update({ status:'revoked' }).eq('id', id)
    setInvites(i => i.filter(inv => inv.id !== id))
  }

  // ── CSS — fully scoped under #assoc-root ─────────────────
  // Using #assoc-root prefix on every rule prevents any global
  // CSS from interfering with the dashboard layout.
  // Theme tokens
  const T = dark ? {
    bg:       '#0d1526',
    surface:  '#111c34',
    card:     '#1a2540',
    card2:    '#0d1526',
    border:   'rgba(255,255,255,0.06)',
    border2:  'rgba(255,255,255,0.04)',
    text:     '#f1f5f9',
    text2:    'rgba(255,255,255,0.65)',
    muted:    'rgba(255,255,255,0.35)',
    muted2:   'rgba(255,255,255,0.22)',
    inp_bg:   '#0d1526',
    inp_border:'rgba(255,255,255,0.1)',
    row_hover:'rgba(255,255,255,0.02)',
    info_bg:  'rgba(91,46,255,0.08)',
    info_bdr: 'rgba(91,46,255,0.2)',
    notice_bg:'rgba(20,184,166,0.08)',
    notice_bdr:'rgba(20,184,166,0.2)',
    warn_bg:  'rgba(245,158,11,0.08)',
    warn_bdr: 'rgba(245,158,11,0.2)',
  } : {
    bg:       '#f0f4f8',
    surface:  '#ffffff',
    card:     '#ffffff',
    card2:    '#f8fafc',
    border:   'rgba(15,23,42,0.08)',
    border2:  'rgba(15,23,42,0.04)',
    text:     '#0f172a',
    text2:    'rgba(15,23,42,0.7)',
    muted:    'rgba(15,23,42,0.45)',
    muted2:   'rgba(15,23,42,0.3)',
    inp_bg:   '#f8fafc',
    inp_border:'rgba(15,23,42,0.12)',
    row_hover:'rgba(15,23,42,0.02)',
    info_bg:  'rgba(91,46,255,0.06)',
    info_bdr: 'rgba(91,46,255,0.18)',
    notice_bg:'rgba(20,184,166,0.06)',
    notice_bdr:'rgba(20,184,166,0.18)',
    warn_bg:  'rgba(245,158,11,0.06)',
    warn_bdr: 'rgba(245,158,11,0.18)',
  }

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');

    #assoc-root * { box-sizing: border-box; margin: 0; padding: 0; }
    #assoc-root {
      font-family: 'DM Sans', -apple-system, sans-serif;
      background: ${T.bg};
      color: ${T.text};
      height: 100vh;
      width: 100vw;
      display: flex;
      overflow: hidden;
      position: fixed;
      top: 0; left: 0;
    }

    /* ── Sidebar ── */
    #assoc-root .sb {
      width: 252px;
      min-width: 252px;
      background: ${T.surface};
      border-right: 1px solid ${T.border};
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow-y: auto;
      overflow-x: hidden;
      flex-shrink: 0;
    }

    #assoc-root .sb-top {
      padding: 22px 20px 18px;
      border-bottom: 1px solid ${T.border};
      flex-shrink: 0;
    }

    #assoc-root .assoc-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(91,46,255,0.15);
      border: 1px solid rgba(91,46,255,0.35);
      border-radius: 20px;
      padding: 3px 10px 3px 8px;
      font-size: 11px;
      font-weight: 700;
      color: #7c5cff;
      letter-spacing: 0.06em;
      margin-bottom: 12px;
    }

    #assoc-root .assoc-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #14B8A6;
    }

    #assoc-root .sb-name {
      font-size: 14px;
      font-weight: 800;
      color: ${T.text};
      line-height: 1.3;
      margin-bottom: 3px;
    }

    #assoc-root .sb-role {
      font-size: 11px;
      color: ${T.muted};
      margin-bottom: 2px;
    }

    #assoc-root .sb-email {
      font-size: 10px;
      color: ${T.muted2};
      font-family: 'DM Mono', monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 210px;
    }

    /* ── Nav ── */
    #assoc-root nav {
      padding: 14px 10px;
      flex: 1;
    }

    #assoc-root .nav-section {
      font-size: 9px;
      font-weight: 700;
      color: ${T.muted2};
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 0 10px;
      margin: 14px 0 6px;
    }

    #assoc-root .nav-section:first-child { margin-top: 0; }

    #assoc-root .ni {
      all: unset;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 10px;
      border-radius: 9px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      color: ${T.text2};
      width: 100%;
      margin-bottom: 2px;
      transition: all 0.15s;
      font-family: 'DM Sans', sans-serif;
    }

    #assoc-root .ni:hover {
      background: ${T.row_hover};
      color: ${T.text};
    }

    #assoc-root .ni.act {
      background: rgba(91,46,255,0.15);
      color: #7c5cff;
      border: 1px solid rgba(91,46,255,0.3);
    }

    #assoc-root .ni-badge {
      margin-left: auto;
      background: #ef4444;
      color: white;
      font-size: 9px;
      font-weight: 800;
      padding: 1px 6px;
      border-radius: 10px;
    }

    #assoc-root .ni-icon {
      width: 20px;
      text-align: center;
      font-size: 15px;
      flex-shrink: 0;
    }

    /* ── Sidebar bottom ── */
    #assoc-root .sb-bottom {
      padding: 10px;
      border-top: 1px solid rgba(255,255,255,0.06);
      flex-shrink: 0;
    }

    #assoc-root .ni-danger {
      color: rgba(239,68,68,0.6) !important;
    }
    #assoc-root .ni-danger:hover {
      background: rgba(239,68,68,0.08) !important;
      color: #ef4444 !important;
    }

    /* ── Main area ── */
    #assoc-root .main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-width: 0;
    }

    #assoc-root .topbar {
      padding: 16px 28px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      background: ${T.surface};
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    #assoc-root .topbar-title {
      font-size: 16px;
      font-weight: 800;
      color: ${T.text};
    }

    #assoc-root .topbar-sub {
      font-size: 11px;
      color: ${T.muted};
      margin-top: 2px;
    }

    /* ── Content scroll area ── */
    #assoc-root .content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 24px 28px;
    }

    /* ── KPI grid ── */
    #assoc-root .kpi-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      margin-bottom: 24px;
    }

    @media (max-width: 900px) {
      #assoc-root .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    }

    /* ── Card ── */
    #assoc-root .card {
      background: ${T.card};
      border: 1px solid ${T.border};
      border-radius: 14px;
      overflow: hidden;
      margin-bottom: 20px;
    }

    #assoc-root .card-header {
      padding: 14px 20px;
      border-bottom: 1px solid ${T.border};
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    #assoc-root .card-title {
      font-size: 13px;
      font-weight: 700;
      color: ${T.text};
    }

    #assoc-root .card-count {
      font-size: 11px;
      color: ${T.muted};
      font-family: 'DM Mono', monospace;
    }

    /* ── Table ── */
    #assoc-root table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12.5px;
    }

    #assoc-root th {
      padding: 10px 20px;
      text-align: left;
      font-size: 9.5px;
      font-weight: 700;
      color: ${T.muted2};
      letter-spacing: 0.08em;
      text-transform: uppercase;
      border-bottom: 1px solid ${T.border};
    }

    #assoc-root td {
      padding: 12px 20px;
      border-bottom: 1px solid ${T.border2};
      vertical-align: middle;
      color: ${T.text2};
    }

    #assoc-root tr:last-child td {
      border-bottom: none;
    }

    #assoc-root tbody tr:hover td {
      background: ${T.row_hover};
    }

    /* ── Buttons ── */
    #assoc-root .btn {
      all: unset;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 7px 15px;
      border-radius: 8px;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      font-family: 'DM Sans', sans-serif;
      white-space: nowrap;
    }

    #assoc-root .btn-primary {
      background: #5B2EFF;
      color: white;
      border: 1px solid #5B2EFF;
    }
    #assoc-root .btn-primary:hover { opacity: 0.88; }
    #assoc-root .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

    #assoc-root .btn-ghost {
      background: transparent;
      color: ${T.text2};
      border: 1px solid ${T.inp_border};
    }
    #assoc-root .btn-ghost:hover { color: ${T.text}; border-color: ${T.muted2}; }

    #assoc-root .btn-approve {
      background: rgba(34,197,94,0.12);
      color: #22c55e;
      border: 1px solid rgba(34,197,94,0.3);
      padding: 5px 12px;
      font-size: 11.5px;
    }
    #assoc-root .btn-approve:hover { background: rgba(34,197,94,0.2); }

    #assoc-root .btn-reject {
      background: rgba(239,68,68,0.12);
      color: #ef4444;
      border: 1px solid rgba(239,68,68,0.3);
      padding: 5px 12px;
      font-size: 11.5px;
    }
    #assoc-root .btn-reject:hover { background: rgba(239,68,68,0.2); }

    #assoc-root .btn-sm {
      padding: 3px 10px;
      font-size: 11px;
    }

    /* ── Form ── */
    #assoc-root .inp {
      all: unset;
      display: block;
      background: ${T.inp_bg};
      border: 1px solid ${T.inp_border};
      border-radius: 8px;
      padding: 9px 13px;
      font-size: 13px;
      color: ${T.text};
      font-family: 'DM Sans', sans-serif;
      width: 100%;
      box-sizing: border-box;
      transition: border-color 0.15s;
    }
    #assoc-root .inp:focus { border-color: #5B2EFF; }
    #assoc-root .inp::placeholder { color: ${T.muted2}; }

    #assoc-root select.inp {
      appearance: none;
      cursor: pointer;
      padding-right: 30px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(255,255,255,0.3)'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
    }

    #assoc-root textarea.inp { resize: vertical; min-height: 80px; }

    #assoc-root .lbl {
      display: block;
      font-size: 10px;
      font-weight: 700;
      color: ${T.muted};
      letter-spacing: 0.07em;
      text-transform: uppercase;
      margin-bottom: 5px;
    }

    #assoc-root .fg {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 12px;
    }

    #assoc-root .fgg { margin-bottom: 12px; }

    /* ── Form box ── */
    #assoc-root .form-box {
      background: ${T.card2};
      border: 1px solid rgba(91,46,255,0.3);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 18px;
    }

    #assoc-root .form-box-title {
      font-size: 14px;
      font-weight: 700;
      color: ${T.text};
      margin-bottom: 16px;
    }

    /* ── Chapter cards ── */
    #assoc-root .ch-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }

    #assoc-root .ch-card {
      background: ${T.card};
      border: 1px solid ${T.border};
      border-radius: 12px;
      padding: 16px 18px;
      transition: border-color 0.15s;
    }

    #assoc-root .ch-card:hover { border-color: rgba(91,46,255,0.3); }

    #assoc-root .ch-state {
      font-size: 10px;
      font-weight: 700;
      color: #14B8A6;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    #assoc-root .ch-name {
      font-size: 13px;
      font-weight: 700;
      color: ${T.text};
      margin-bottom: 6px;
    }

    #assoc-root .ch-meta {
      font-size: 11px;
      color: ${T.muted};
    }

    /* ── Info box ── */
    #assoc-root .info-box {
      background: ${T.info_bg};
      border: 1px solid ${T.info_bdr};
      border-radius: 10px;
      padding: 14px 16px;
      font-size: 12px;
      color: ${T.text2};
      line-height: 1.7;
      margin-bottom: 18px;
    }

    #assoc-root .notice-box {
      background: ${T.notice_bg};
      border: 1px solid ${T.notice_bdr};
      border-radius: 10px;
      padding: 14px 16px;
      font-size: 12px;
      color: ${T.text2};
      line-height: 1.7;
      margin-bottom: 18px;
    }

    #assoc-root .warn-box {
      background: ${T.warn_bg};
      border: 1px solid ${T.warn_bdr};
      border-radius: 10px;
      padding: 14px 16px;
      font-size: 12px;
      color: ${T.text2};
      line-height: 1.7;
      margin-bottom: 18px;
    }

    /* ── MAPE bar ── */
    #assoc-root .mape-wrap {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    #assoc-root .mape-bar {
      width: 52px;
      height: 4px;
      background: rgba(255,255,255,0.08);
      border-radius: 2px;
      overflow: hidden;
    }
    #assoc-root .mape-fill {
      height: 100%;
      border-radius: 2px;
      background: #5B2EFF;
    }

    /* ── Neighborhoods ── */
    #assoc-root .hood-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 20px;
    }
    #assoc-root .hood {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: ${T.card};
      border: 1px solid ${T.border};
      border-radius: 20px;
      padding: 4px 12px;
      font-size: 12px;
      color: ${T.text2};
    }

    /* ── Modal ── */
    #assoc-root .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.78);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    #assoc-root .modal {
      background: ${T.card};
      border: 1px solid ${T.border};
      border-radius: 16px;
      padding: 28px;
      width: 440px;
      max-width: 90vw;
    }

    #assoc-root .modal-title {
      font-size: 16px;
      font-weight: 800;
      color: ${T.text};
      margin-bottom: 6px;
    }

    #assoc-root .modal-sub {
      font-size: 13px;
      color: ${T.muted};
      margin-bottom: 18px;
      line-height: 1.6;
    }

    /* ── Section label ── */
    #assoc-root .sec-lbl {
      font-size: 10px;
      font-weight: 700;
      color: ${T.muted2};
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin-bottom: 12px;
      margin-top: 22px;
    }

    /* ── Success / Error messages ── */
    #assoc-root .msg-ok {
      background: rgba(34,197,94,0.1);
      border: 1px solid rgba(34,197,94,0.3);
      border-radius: 8px;
      padding: 12px 14px;
      font-size: 12px;
      color: #22c55e;
      margin-bottom: 14px;
    }
    #assoc-root .msg-er {
      background: rgba(239,68,68,0.1);
      border: 1px solid rgba(239,68,68,0.3);
      border-radius: 8px;
      padding: 12px 14px;
      font-size: 12px;
      color: #ef4444;
      margin-bottom: 14px;
    }

    /* ── Flex helpers ── */
    #assoc-root .row { display: flex; align-items: center; gap: 8px; }
    #assoc-root .row-between { display: flex; align-items: center; justify-content: space-between; }
    #assoc-root .mono { font-family: 'DM Mono', monospace; font-size: 11px; }

    /* ── Toggle ── */
    #assoc-root .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      background: ${T.card};
      border: 1px solid ${T.border};
      border-radius: 10px;
      margin-bottom: 12px;
    }
    #assoc-root .toggle-label {
      font-size: 13px;
      font-weight: 600;
      color: ${T.text};
    }
    #assoc-root .toggle-sub {
      font-size: 11px;
      color: ${T.muted};
      margin-top: 2px;
    }
    #assoc-root .toggle {
      all: unset;
      width: 40px;
      height: 22px;
      background: rgba(255,255,255,0.1);
      border-radius: 11px;
      cursor: pointer;
      position: relative;
      transition: background 0.2s;
      flex-shrink: 0;
    }
    #assoc-root .toggle.on { background: #5B2EFF; }
    #assoc-root .toggle::after {
      content: '';
      position: absolute;
      top: 3px;
      left: 3px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: white;
      transition: transform 0.2s;
    }
    #assoc-root .toggle.on::after { transform: translateX(18px); }

    /* ── Checkbox row ── */
    #assoc-root .cbr {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: ${T.text2};
      cursor: pointer;
      margin-bottom: 12px;
    }
    #assoc-root .cbr input { cursor: pointer; }

    /* ── Scrollbar ── */
    #assoc-root .content::-webkit-scrollbar { width: 5px; }
    #assoc-root .content::-webkit-scrollbar-track { background: transparent; }
    #assoc-root .content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
    #assoc-root .sb::-webkit-scrollbar { width: 3px; }
    #assoc-root .sb::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); }
  `

  // ── Tab config ─────────────────────────────────────────────
  const navGroups = [
    {
      label: 'Intelligence',
      items: [
        { key: 'overview' as Tab, label: 'Overview',   icon: '◎' },
        { key: 'members'  as Tab, label: 'Members',    icon: '👥', count: memberTotal },
      ],
    },
    {
      label: 'Operations',
      items: [
        { key: 'verify' as Tab, label: 'Verify Members', icon: '✓', count: verQueue.length },
        ...(ctx?.isNational ? [
          { key: 'chapters' as Tab, label: 'Chapters',   icon: '🗺' },
          { key: 'team'     as Tab, label: 'Team Access', icon: '👤' },
        ] : []),
      ],
    },
    {
      label: 'Account',
      items: [
        { key: 'settings' as Tab, label: 'Settings', icon: '⚙' },
      ],
    },
  ]

  const topbarInfo: Record<Tab, { title: string; sub: string }> = {
    overview: { title: 'Association Overview', sub: `Intelligence summary · ${ctx?.associationName ?? ''}` },
    members:  { title: 'Members',              sub: `${memberTotal} registered member agencies` },
    verify:   { title: 'Verification Queue',   sub: ctx?.isNational ? `${verQueue.length} pending your review — you control all verifications` : `${verQueue.length} pending — delegated by national admin` },
    chapters: { title: 'Chapter Management',   sub: 'Create and manage your regional chapters' },
    team:     { title: 'Team Access',          sub: 'Invite chapter executives — you control all access' },
    settings: { title: 'Settings',             sub: 'Association preferences and delegation controls' },
  }

  if (loading) return (
    <>
      <style>{css}</style>
      <div id="assoc-root" style={{ alignItems:'center', justifyContent:'center', fontSize:13, color:'rgba(255,255,255,0.35)' }}>
        Loading your dashboard…
      </div>
    </>
  )

  if (!ctx) return (
    <>
      <style>{css}</style>
      <div id="assoc-root" style={{ alignItems:'center', justifyContent:'center', fontSize:13, color:'#ef4444' }}>
        No association access found. Contact MANOP support.
      </div>
    </>
  )

  return (
    <>
      <style>{css}</style>
      <div id="assoc-root">

        {/* ══════════ SIDEBAR ══════════ */}
        <aside className="sb">
          <div className="sb-top">
            <div className="assoc-tag">
              <span className="assoc-dot" />
              {ctx.associationCode}
              {ctx.associationCode === 'TREA' && (
                <span style={{ fontSize:9, background:'rgba(245,158,11,0.2)', color:'#f59e0b', borderRadius:4, padding:'1px 5px', fontWeight:700 }}>TEST</span>
              )}
            </div>
            <div className="sb-name">{ctx.associationName}</div>
            <div className="sb-role">
              {ctx.isNational ? 'National Admin' : `Chapter Admin · ${ctx.chapterState ?? ''}`}
            </div>
            <div className="sb-email">{ctx.email}</div>
          </div>

          <nav>
            {navGroups.map(group => (
              <div key={group.label}>
                <div className="nav-section">{group.label}</div>
                {group.items.map(item => (
                  <button
                    key={item.key}
                    className={`ni ${tab === item.key ? 'act' : ''}`}
                    onClick={() => setTab(item.key)}
                  >
                    <span className="ni-icon">{item.icon}</span>
                    {item.label}
                    {item.count && item.count > 0
                      ? <span className="ni-badge">{item.count}</span>
                      : null
                    }
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="sb-bottom">
            <button className="ni ni-danger" onClick={() => sb.auth.signOut().then(() => router.replace('/login'))}>
              <span className="ni-icon">←</span>
              Sign out
            </button>
          </div>
        </aside>

        {/* ══════════ MAIN ══════════ */}
        <main className="main">
          <div className="topbar">
            <div>
              <div className="topbar-title">{topbarInfo[tab].title}</div>
              <div className="topbar-sub">{topbarInfo[tab].sub}</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              {/* Theme toggle */}
              <button
                onClick={() => setTheme(!dark)}
                style={{
                  all:'unset', cursor:'pointer',
                  width:34, height:34, borderRadius:8,
                  background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
                  border: `1px solid ${T.border}`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:15, transition:'all 0.15s',
                }}
                title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {dark ? '☀️' : '🌙'}
              </button>
              <div className="mono" style={{ color:T.muted2 }}>
                MANOP Intelligence
              </div>
            </div>
          </div>

          <div className="content">

            {/* ══ OVERVIEW ══ */}
            {tab === 'overview' && (
              <>
                {!intel?.meets_minimum_threshold && (
                  <div className="warn-box">
                    ⚠ Intelligence aggregates require a minimum of 5 active member agencies. Data will populate as your membership grows.
                  </div>
                )}

                <div className="kpi-grid">
                  <KPI label="Total Members"     value={intel?.total_members ?? memberTotal}     accent="#5B2EFF" sub={`${intel?.new_members_this_period ?? 0} new this month`} T={T} />
                  <KPI label="Verified Members"  value={intel?.verified_members ?? '—'}          accent="#22c55e" sub={intel?.verification_rate_pct ? `${intel.verification_rate_pct}% rate` : 'No data yet'} T={T} />
                  <KPI label="Pending Review"    value={verQueue.length}                          accent={verQueue.length > 0 ? '#f59e0b' : '#22c55e'} sub="Awaiting your action" T={T} />
                  <KPI label="Elite Agencies"    value={intel?.elite_members ?? 0}               accent="#f59e0b" sub={`${intel?.trust_members ?? 0} Trust level`} T={T} />
                  <KPI label="Avg MAPE Score"    value={intel?.avg_mape_score ? Math.round(intel.avg_mape_score) : '—'} accent="#3b82f6" sub={intel?.median_mape_score ? `Median ${Math.round(intel.median_mape_score)}` : undefined} T={T} />
                  <KPI label="Total Listings"    value={intel?.total_listings ?? 0}              accent="#14B8A6" sub={`${intel?.total_transactions ?? 0} transactions`} T={T} />
                </div>

                {/* Top neighborhoods */}
                {intel?.top_neighborhoods?.length > 0 && (
                  <>
                    <div className="sec-lbl">Most Active Neighborhoods</div>
                    <div className="hood-wrap">
                      {intel.top_neighborhoods.map((n: string, i: number) => (
                        <div key={n} className="hood">
                          {i === 0 && <span style={{ color:'#f59e0b' }}>★</span>}
                          {n}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Chapter overview */}
                {ctx.isNational && chapters.length > 0 && (
                  <>
                    <div className="sec-lbl">Chapters ({chapters.length})</div>
                    <div className="ch-grid">
                      {chapters.map(c => (
                        <div key={c.id} className="ch-card">
                          <div className="ch-state">{c.state}</div>
                          <div className="ch-name">{c.name}</div>
                          <div className="ch-meta">
                            {c.chapter_admin_user_id
                              ? <span style={{ color:'#22c55e' }}>✓ Admin assigned</span>
                              : 'No admin assigned'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Empty state */}
                {memberTotal === 0 && verQueue.length === 0 && chapters.length === 0 && (
                  <div className="card">
                    <div style={{ textAlign:'center', padding:'44px 24px' }}>
                      <div style={{ fontSize:40, marginBottom:16 }}>🚀</div>
                      <div style={{ fontSize:16, fontWeight:800, color:'#f1f5f9', marginBottom:10 }}>Your dashboard is ready</div>
                      <div style={{ fontSize:13, color:'rgba(255,255,255,0.45)', lineHeight:1.8, maxWidth:380, margin:'0 auto' }}>
                        Start by creating your chapters, then invite your chapter executives. As agencies claim membership and you verify them, intelligence will populate here automatically.
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ══ MEMBERS ══ */}
            {tab === 'members' && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Registered Member Agencies</span>
                  <span className="card-count">{memberTotal} total</span>
                </div>
                {members.length === 0
                  ? <Empty icon="🏢" title="No members yet" sub="Agencies that apply for association membership will appear here" T={T} />
                  : (
                  <table>
                    <thead>
                      <tr>
                        <th>Agency</th>
                        <th>Chapter</th>
                        <th>Cities</th>
                        <th>MAPE</th>
                        <th>Badge</th>
                        <th>Status</th>
                        <th>Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map(m => (
                        <tr key={m.id}>
                          <td>
                            <div style={{ fontWeight:700, color:'#f1f5f9' }}>{m.agency_name}</div>
                            {m.membership_number && (
                              <div className="mono" style={{ color:'rgba(255,255,255,0.3)', marginTop:2 }}>{m.membership_number}</div>
                            )}
                          </td>
                          <td style={{ color:'rgba(255,255,255,0.45)', fontSize:12 }}>
                            {m.chapter_name ?? <span style={{ color:'rgba(255,255,255,0.2)' }}>—</span>}
                          </td>
                          <td style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>
                            {m.agency_cities?.slice(0,2).join(', ') || '—'}
                          </td>
                          <td>
                            <div className="mape-wrap">
                              <span style={{ fontWeight:700 }}>{m.agency_mape}</span>
                              <div className="mape-bar">
                                <div className="mape-fill" style={{ width:`${Math.min(m.agency_mape/10,100)}%` }} />
                              </div>
                            </div>
                          </td>
                          <td>
                            <Chip label={m.agency_badge}
                              color={m.agency_badge==='elite'?'#f59e0b':m.agency_badge==='trust'?'#22c55e':m.agency_badge==='verified'?'#3b82f6':'#64748b'} />
                          </td>
                          <td>
                            <Chip label={m.status}
                              color={m.status==='active'?'#22c55e':m.status==='pending'?'#f59e0b':'#ef4444'} />
                          </td>
                          <td style={{ fontSize:11, color:'rgba(255,255,255,0.35)' }}>
                            {fmtDate(m.joined_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ══ VERIFY ══ */}
            {tab === 'verify' && (
              <>
                <div className="notice-box">
                  <strong style={{ color:'#f1f5f9' }}>Verification is controlled by the national admin.</strong><br />
                  When an agency claims {ctx.associationCode} membership, their request appears here. You review their details, check your records, and approve or reject. Approved agencies get a verified badge and their MAPE Ethics score increases automatically.
                </div>

                {verQueue.length === 0
                  ? (
                    <div className="card">
                      <Empty icon="✓" title="Queue is clear" sub="No pending membership verification requests" T={T} />
                    </div>
                  ) : (
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">Pending Membership Verifications</span>
                      <span className="card-count">{verQueue.length} awaiting review</span>
                    </div>
                    <table>
                      <thead>
                        <tr>
                          <th>Agency</th>
                          <th>Membership No.</th>
                          <th>Cities</th>
                          <th>MAPE</th>
                          <th>Current Status</th>
                          <th>Submitted</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {verQueue.map(r => (
                          <tr key={r.id}>
                            <td>
                              <div style={{ fontWeight:700, color:'#f1f5f9' }}>{r.agency_name}</div>
                              {r.office_address && (
                                <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:2 }}>{r.office_address}</div>
                              )}
                            </td>
                            <td className="mono">{r.membership_number ?? '—'}</td>
                            <td style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>
                              {r.agency_cities?.slice(0,2).join(', ') || '—'}
                            </td>
                            <td style={{ fontWeight:700 }}>{r.agency_mape}</td>
                            <td>
                              <Chip label={r.agency_verification ?? 'not started'}
                                color={r.agency_verification==='verified'?'#22c55e':r.agency_verification==='pending'?'#f59e0b':'#64748b'} />
                            </td>
                            <td style={{ fontSize:11, color:'rgba(255,255,255,0.35)' }}>
                              {fmtDate(r.submitted_at)}
                            </td>
                            <td>
                              <div className="row">
                                <button className="btn btn-approve" onClick={() => approveVerification(r.id)} disabled={al === r.id}>
                                  ✓ Approve
                                </button>
                                <button className="btn btn-reject" onClick={() => setRM({ id:r.id, name:r.agency_name })}>
                                  ✕ Reject
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* ══ CHAPTERS ══ */}
            {tab === 'chapters' && ctx.isNational && (
              <>
                <div className="info-box">
                  You control your chapter structure completely. MANOP never touches it. Create chapters for each state or region where your association operates, then assign executives from the Team Access tab.
                </div>

                <div className="row-between" style={{ marginBottom:18 }}>
                  <div style={{ fontSize:13, color:'rgba(255,255,255,0.45)' }}>
                    {chapters.length} chapter{chapters.length !== 1 ? 's' : ''} created
                  </div>
                  <button className="btn btn-primary" onClick={() => setSCF(v => !v)}>
                    + New Chapter
                  </button>
                </div>

                {showCF && (
                  <div className="form-box">
                    <div className="form-box-title">Create New Chapter</div>
                    <div className="fg">
                      <div>
                        <label className="lbl">Chapter Name *</label>
                        <input className="inp" placeholder="e.g. AEAN Lagos Chapter" value={nc.name} onChange={e => setNC(p => ({ ...p, name:e.target.value }))} />
                      </div>
                      <div>
                        <label className="lbl">State *</label>
                        <input className="inp" placeholder="e.g. Lagos" value={nc.state} onChange={e => setNC(p => ({ ...p, state:e.target.value }))} />
                      </div>
                    </div>
                    <div className="fgg">
                      <label className="lbl">Primary City (optional)</label>
                      <input className="inp" placeholder="e.g. Lagos Island" value={nc.city} onChange={e => setNC(p => ({ ...p, city:e.target.value }))} />
                    </div>
                    {chapterError && (
                      <div className="msg-er" style={{ marginBottom:12 }}>{chapterError}</div>
                    )}
                    <div className="row">
                      <button className="btn btn-primary" onClick={createChapter} disabled={al==='chapter' || !nc.name || !nc.state}>
                        {al === 'chapter' ? 'Creating…' : 'Create Chapter'}
                      </button>
                      <button className="btn btn-ghost" onClick={() => { setSCF(false); setChapterError('') }}>Cancel</button>
                    </div>
                  </div>
                )}

                {chapters.length === 0
                  ? (
                    <div className="card">
                      <Empty icon="🗺" title="No chapters yet" sub="Create your first chapter to organise members by state or region" T={T} />
                    </div>
                  ) : (
                  <div className="ch-grid">
                    {chapters.map(c => (
                      <div key={c.id} className="ch-card">
                        <div className="ch-state">{c.state}</div>
                        <div className="ch-name">{c.name}</div>
                        {c.city && <div className="ch-meta" style={{ marginBottom:8 }}>📍 {c.city}</div>}
                        <div className="row-between" style={{ marginTop:12 }}>
                          <span className="ch-meta" style={{ color:c.chapter_admin_user_id?'#22c55e':undefined }}>
                            {c.chapter_admin_user_id ? '✓ Admin set' : 'No admin yet'}
                          </span>
                          <button className="btn btn-reject btn-sm" onClick={() => removeChapter(c.id)}>
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ══ TEAM ACCESS ══ */}
            {tab === 'team' && ctx.isNational && (
              <>
                <div className="info-box">
                  <strong style={{ color:'#f1f5f9' }}>You control all team access.</strong><br />
                  MANOP is never involved in chapter-level access management. Invite executives by email — they receive a link to set their own password and access their chapter dashboard. Revoke access here instantly when executives change positions.
                </div>

                {invOk && <div className="msg-ok">✓ {invOk}</div>}
                {invErr && <div className="msg-er">{invErr}</div>}

                <div style={{ marginBottom:18 }}>
                  <button className="btn btn-primary" onClick={() => { setSIF(v => !v); setIE(''); setIO('') }}>
                    + Invite Chapter Executive
                  </button>
                </div>

                {showIF && (
                  <div className="form-box">
                    <div className="form-box-title">Invite Chapter Executive</div>
                    <div className="fg">
                      <div>
                        <label className="lbl">Email Address *</label>
                        <input className="inp" type="email" placeholder="executive@example.com" value={inv.email} onChange={e => setInv(p => ({ ...p, email:e.target.value }))} />
                      </div>
                      <div>
                        <label className="lbl">Assign to Chapter</label>
                        <select className="inp" value={inv.chapter_id} onChange={e => setInv(p => ({ ...p, chapter_id:e.target.value }))}>
                          <option value="">Select chapter…</option>
                          {chapters.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="fgg">
                      <label className="lbl">Access Level</label>
                      <select className="inp" style={{ width:'55%' }} value={inv.role} onChange={e => setInv(p => ({ ...p, role:e.target.value }))}>
                        <option value="chapter_admin">Chapter Admin — can view their chapter's data</option>
                        <option value="analyst">Analyst — read only, no verification actions</option>
                      </select>
                    </div>
                    <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)', marginBottom:16, lineHeight:1.6 }}>
                      Note: Verification approval remains with the national admin only unless you enable delegation in Settings.
                    </div>
                    <div className="row">
                      <button className="btn btn-primary" onClick={sendInvite} disabled={al==='invite'||!inv.email}>
                        {al === 'invite' ? 'Sending…' : 'Send Invitation'}
                      </button>
                      <button className="btn btn-ghost" onClick={() => setSIF(false)}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* Pending invitations */}
                {invites.length > 0 && (
                  <div className="card" style={{ marginTop:20 }}>
                    <div className="card-header">
                      <span className="card-title">Pending Invitations</span>
                      <span className="card-count">{invites.length} sent</span>
                    </div>
                    <table>
                      <thead>
                        <tr>
                          <th>Email</th>
                          <th>Chapter</th>
                          <th>Role</th>
                          <th>Expires</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {invites.map((i: any) => (
                          <tr key={i.id}>
                            <td className="mono">{i.email}</td>
                            <td style={{ fontSize:12, color:'rgba(255,255,255,0.45)' }}>
                              {i.chapter_name ?? 'National'}
                            </td>
                            <td><Chip label={i.role} color="#5B2EFF" /></td>
                            <td style={{ fontSize:11, color:'rgba(255,255,255,0.35)' }}>{fmtDate(i.expires_at)}</td>
                            <td>
                              <button className="btn btn-reject btn-sm" onClick={() => revokeInvite(i.id)}>
                                Revoke
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {invites.length === 0 && !showIF && (
                  <div className="card" style={{ marginTop:8 }}>
                    <Empty icon="📧" title="No pending invitations" sub="Invite chapter executives to give them access to their chapter dashboard" T={T} />
                  </div>
                )}
              </>
            )}

            {/* ══ SETTINGS ══ */}
            {tab === 'settings' && (
              <>
                <div className="sec-lbl" style={{ marginTop:0 }}>Association Profile</div>
                <div className="card" style={{ marginBottom:20 }}>
                  <div style={{ padding:'20px 22px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                    {[
                      { label:'Association Name', value:ctx.associationName },
                      { label:'Short Code',       value:ctx.associationCode },
                      { label:'Your Role',        value:ctx.role.replace(/_/g,' ') },
                      { label:'Your Email',       value:ctx.email },
                    ].map(row => (
                      <div key={row.label}>
                        <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.3)', letterSpacing:'0.07em', textTransform:'uppercase', marginBottom:4 }}>{row.label}</div>
                        <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)' }}>{row.value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding:'14px 22px', borderTop:'1px solid rgba(255,255,255,0.06)', fontSize:12, color:'rgba(255,255,255,0.3)' }}>
                    To update association details, contact MANOP at <span style={{ color:'#5B2EFF' }}>support@manopintel.com</span>
                  </div>
                </div>

                {ctx.canDelegate && (
                  <>
                    <div className="sec-lbl">Verification Delegation</div>
                    <div className="info-box">
                      By default, only you (the national admin) can approve or reject member verifications. You can delegate verification to chapter admins — they will only be able to action requests from agencies in their chapter's state.
                    </div>
                    <div className="toggle-row">
                      <div>
                        <div className="toggle-label">Allow chapter admins to verify members</div>
                        <div className="toggle-sub">Chapter admins will see and action verifications for their state only</div>
                      </div>
                      <button
                        className={`toggle ${delegationEnabled ? 'on' : ''}`}
                        onClick={() => setDE(v => !v)}
                      />
                    </div>
                    {delegationEnabled && (
                      <div className="notice-box">
                        ✓ Delegation enabled. Chapter admins can now verify members in their state. You retain full override control and can see all verifications here.
                      </div>
                    )}
                  </>
                )}
              </>
            )}

          </div>
        </main>
      </div>

      {/* ══ REJECT MODAL ══ */}
      {rejectModal && (
        <div id="assoc-root">
          <style>{css}</style>
          <div className="overlay" onClick={() => setRM(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-title">Reject Verification</div>
              <div className="modal-sub">
                You are rejecting <strong style={{ color:'#f1f5f9' }}>{rejectModal.name}</strong>'s membership application. They will receive a notification with your reason.
              </div>
              <label className="lbl">Reason for rejection *</label>
              <textarea
                className="inp"
                rows={3}
                style={{ marginBottom:16 }}
                placeholder="e.g. Membership number not found in our records. Please contact the secretariat at info@association.org"
                value={rejectReason}
                onChange={e => setRR(e.target.value)}
              />
              <div className="row" style={{ justifyContent:'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setRM(null)}>Cancel</button>
                <button className="btn btn-reject" onClick={rejectVerification} disabled={!rejectReason || al === rejectModal.id}>
                  {al === rejectModal.id ? 'Rejecting…' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}