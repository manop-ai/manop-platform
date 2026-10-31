'use client'
// components/AdminActivityPanel.tsx
//
// Admin-only "what is actually happening" views, built ONLY from data the
// platform really records. Nothing is estimated or back-filled:
//   • counts come from head-count queries on existing tables
//   • the feed is the existing activity_log (no second activity system)
//   • a metric that errors shows "—", an empty one shows "No activity yet"
//   • a chart needs MIN_WEEKS weeks with data, otherwise "Not enough data yet"
// Rendered inside #admin-root so it uses that page's CSS variables.
//
// Signals recorded today (verified in code): development_view, enquiry_sent,
// site signals, and the development_* events written by DevelopmentUpdates and
// the review/submission flows. Per-user watchlist ACTIVITY over time is not
// recorded (only the current investor_watchlist rows exist), so only a total is shown.

import { useCallback, useEffect, useState } from 'react'
import { sb } from '../lib/supabase/client'

const MIN_WEEKS = 3
const DAY = 86400000
const iso = (ms: number) => new Date(ms).toISOString()

const LABELS: Record<string, string> = {
  development_view: 'Development viewed',
  enquiry_sent: 'Enquiry received',
  development_submitted: 'Development submitted',
  development_info_requested: 'Information requested',
  development_reviewed: 'Development reviewed',
  development_published: 'Development published',
  development_update_added: 'Construction update added',
  development_unit_price_changed: 'Unit price changed',
  development_unit_availability_changed: 'Unit availability changed',
  development_status_changed: 'Development status changed',
  development_image_added: 'Development image added',
}
const GROUPS: { key: string; label: string; match: (e: string) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'dev', label: 'Developments', match: e => e.startsWith('development_') && e !== 'development_view' },
  { key: 'demand', label: 'Views & enquiries', match: e => e === 'development_view' || e === 'enquiry_sent' },
]

const ago = (t: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (m < 1440) return `${Math.round(m / 60)}h ago`
  return `${Math.round(m / 1440)}d ago`
}

interface EventRow { id: number; event_type: string; message: string | null; city: string | null; neighborhood: string | null; metadata: Record<string, unknown> | null; created_at: string }
type N = number | null

async function count(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<N> {
  const r = await q
  return r.error ? null : (r.count ?? 0)
}
const head = { count: 'exact' as const, head: true }

function Tile({ label, value, sub }: { label: string; value: N; sub?: string }) {
  return (
    <div className="card" style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', margin: '4px 0 2px' }}>{value === null ? '—' : value.toLocaleString()}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{sub}</div>}
    </div>
  )
}

/** Key numbers for the Command Center. */
export function PlatformGlance() {
  const [m, setM] = useState<Record<string, N> | null>(null)
  useEffect(() => {
    let live = true
    ;(async () => {
      const d30 = iso(Date.now() - 30 * DAY)
      const [published, pending, updates30, leads, leads30, agencies, developers, users, watch, views30] = await Promise.all([
        count(sb.from('developer_projects').select('id', head).eq('publish_status', 'published')),
        count(sb.from('developer_projects').select('id', head).eq('publish_status', 'pending_review')),
        count(sb.from('development_updates').select('id', head).gte('posted_at', d30)),
        count(sb.from('developer_leads').select('id', head)),
        count(sb.from('developer_leads').select('id', head).gte('created_at', d30)),
        count(sb.from('data_partners').select('id', head).eq('partner_type', 'agency').eq('active', true)),
        count(sb.from('developer_accounts').select('id', head)),
        count(sb.from('user_profiles').select('id', head)),
        count(sb.from('investor_watchlist').select('id', head)),
        count(sb.from('activity_log').select('id', head).eq('event_type', 'development_view').gte('created_at', d30)),
      ])
      const { data: upd } = await sb.from('development_updates').select('project_id').gte('posted_at', d30).limit(5000)
      const updatedDevs = upd ? new Set(upd.map(u => u.project_id)).size : null
      if (live) setM({ published, pending, updates30, updatedDevs, leads, leads30, agencies, developers, users, watch, views30 })
    })()
    return () => { live = false }
  }, [])
  if (!m) return <div className="card" style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 14 }}>Loading platform numbers…</div>
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="sec-lbl">Platform at a glance</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
        <Tile label="Published developments" value={m.published} />
        <Tile label="Submissions awaiting review" value={m.pending} />
        <Tile label="Developments updated" value={m.updatedDevs} sub="last 30 days" />
        <Tile label="Development updates" value={m.updates30} sub="last 30 days" />
        <Tile label="Development views" value={m.views30} sub="last 30 days" />
        <Tile label="Enquiries" value={m.leads} sub={m.leads30 === null ? undefined : `${m.leads30} in last 30 days`} />
        <Tile label="Active agencies" value={m.agencies} />
        <Tile label="Developer accounts" value={m.developers} />
        <Tile label="Registered users" value={m.users} sub="profiles created" />
        <Tile label="Watchlist saves" value={m.watch} sub="current total" />
      </div>
    </div>
  )
}

function Weekly({ title, weeks, values }: { title: string; weeks: string[]; values: number[] }) {
  const active = values.filter(v => v > 0).length
  const max = Math.max(...values, 1)
  const bw = 240 / values.length
  return (
    <div className="card" style={{ minWidth: 0 }}>
      <div className="card-title">{title}</div>
      {active >= MIN_WEEKS ? (
        <>
          <svg viewBox="0 0 240 64" width="100%" role="img" aria-label={`${title} by week`} style={{ display: 'block' }}>
            {values.map((v, i) => {
              const h = v === 0 ? 1 : Math.max(3, (v / max) * 56)
              return <rect key={i} x={i * bw + 2} y={60 - h} width={bw - 4} height={h} rx={2} fill={v ? '#5B2EFF' : 'rgba(128,128,128,.25)'}><title>{`Week of ${weeks[i]}: ${v}`}</title></rect>
            })}
          </svg>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>{values.reduce((a, b) => a + b, 0)} over {values.length} weeks</div>
        </>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
          Not enough data yet.<br />{active} of {MIN_WEEKS} weeks with activity.
        </div>
      )}
    </div>
  )
}

/** The Activity tab: real events, recent updates / submissions / enquiries, trends. */
export function ActivityPanel() {
  const [events, setEvents] = useState<EventRow[] | null>(null)
  const [err, setErr] = useState(false)
  const [group, setGroup] = useState('all')
  const [weekly, setWeekly] = useState<{ weeks: string[]; views: number[]; enquiries: number[]; submitted: number[] } | null>(null)
  const [updates, setUpdates] = useState<{ id: string; title: string; posted_at: string; posted_by_role: string; project: string }[] | null>(null)
  const [subs, setSubs] = useState<{ id: string; name: string; created_at: string; publish_status: string }[] | null>(null)
  const [leads, setLeads] = useState<{ id: string; created_at: string; stage: string | null; project: string }[] | null>(null)

  const load = useCallback(async () => {
    const { data: ev, error } = await sb.from('activity_log')
      .select('id,event_type,message,city,neighborhood,metadata,created_at')
      .order('created_at', { ascending: false }).limit(80)
    if (error) setErr(true); else setEvents((ev as EventRow[]) || [])

    const eightWeeks = Date.now() - 8 * 7 * DAY
    const { data: wk } = await sb.from('activity_log').select('event_type,created_at')
      .in('event_type', ['development_view', 'enquiry_sent', 'development_submitted']).gte('created_at', iso(eightWeeks)).limit(10000)
    const weeks = Array.from({ length: 8 }, (_, i) => new Date(eightWeeks + i * 7 * DAY).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))
    const views = Array(8).fill(0), enq = Array(8).fill(0), sub = Array(8).fill(0)
    for (const r of wk ?? []) {
      const i = Math.min(7, Math.floor((new Date(r.created_at).getTime() - eightWeeks) / (7 * DAY)))
      if (i < 0) continue
      if (r.event_type === 'development_view') views[i]++
      else if (r.event_type === 'enquiry_sent') enq[i]++
      else sub[i]++
    }
    setWeekly({ weeks, views, enquiries: enq, submitted: sub })

    const names = async (ids: string[]) => {
      if (!ids.length) return {} as Record<string, string>
      const { data } = await sb.from('developer_projects').select('id,name').in('id', ids)
      return Object.fromEntries((data ?? []).map(p => [p.id, p.name as string]))
    }
    const { data: up } = await sb.from('development_updates').select('id,title,posted_at,posted_by_role,project_id').order('posted_at', { ascending: false }).limit(8)
    const upNames = await names([...new Set((up ?? []).map(u => u.project_id))])
    setUpdates((up ?? []).map(u => ({ id: u.id, title: u.title, posted_at: u.posted_at, posted_by_role: u.posted_by_role, project: upNames[u.project_id] || 'Development' })))

    const { data: ps } = await sb.from('developer_projects').select('id,name,created_at,publish_status,submitted_via,submitting_agency_id').order('created_at', { ascending: false }).limit(60)
    setSubs((ps ?? []).filter(p => p.publish_status === 'pending_review').slice(0, 8))

    const { data: ld } = await sb.from('developer_leads').select('id,created_at,stage,project_id').order('created_at', { ascending: false }).limit(8)
    const ldNames = await names([...new Set((ld ?? []).map(l => l.project_id).filter(Boolean))])
    // Deliberately no name/email/phone: the admin overview shows that an enquiry happened, not who made it.
    setLeads((ld ?? []).map(l => ({ id: l.id, created_at: l.created_at, stage: l.stage, project: ldNames[l.project_id] || 'Development' })))
  }, [])
  useEffect(() => { load() }, [load])

  const shown = (events ?? []).filter(e => GROUPS.find(g => g.key === group)!.match(e.event_type))
  const detail = (e: EventRow) => {
    const md = e.metadata || {}
    const bits: string[] = []
    if (typeof md.unit_type === 'string') bits.push(`${md.unit_type}: ${md.previous ?? '—'} → ${md.new ?? '—'}`)
    if (typeof md.actor_role === 'string') bits.push(`by ${md.actor_role}`)
    if (typeof md.request === 'string') bits.push(md.request)
    return bits.join(' · ')
  }
  const Empty = ({ t }: { t: string }) => <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>{t}</div>
  const Row = ({ a, b, c }: { a: string; b: string; c: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border2)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflowWrap: 'anywhere' }}>{a}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{b}</div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{c}</div>
    </div>
  )

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10, marginBottom: 14 }}>
        {weekly ? (
          <>
            <Weekly title="Development views / week" weeks={weekly.weeks} values={weekly.views} />
            <Weekly title="Enquiries / week" weeks={weekly.weeks} values={weekly.enquiries} />
            <Weekly title="Submissions / week" weeks={weekly.weeks} values={weekly.submitted} />
          </>
        ) : <div className="card" style={{ color: 'var(--muted)', fontSize: 12 }}>Loading trends…</div>}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <div className="card-title" style={{ margin: 0 }}>Recent platform activity</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {GROUPS.map(g => (
              <button key={g.key} onClick={() => setGroup(g.key)} className="btn btn-sm"
                style={{ opacity: group === g.key ? 1 : 0.6, fontWeight: group === g.key ? 700 : 500 }}>{g.label}</button>
            ))}
          </div>
        </div>
        {err && <Empty t="Activity is unavailable right now." />}
        {!err && events === null && <Empty t="Loading…" />}
        {!err && events !== null && shown.length === 0 && <Empty t="No activity yet." />}
        {shown.slice(0, 40).map(e => (
          <Row key={e.id}
            a={LABELS[e.event_type] || e.event_type.replace(/_/g, ' ')}
            b={[e.message && e.message.replace(/^[a-z_ ]+ — /, ''), [e.neighborhood, e.city].filter(Boolean).join(', '), detail(e)].filter(Boolean).join(' · ')}
            c={ago(e.created_at)} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 10 }}>
        <div className="card">
          <div className="card-title">Recent development updates</div>
          {updates === null ? <Empty t="Loading…" /> : updates.length === 0 ? <Empty t="No updates posted yet." /> :
            updates.map(u => <Row key={u.id} a={u.title} b={`${u.project} · ${u.posted_by_role}`} c={ago(u.posted_at)} />)}
        </div>
        <div className="card">
          <div className="card-title">Recent submissions</div>
          {subs === null ? <Empty t="Loading…" /> : subs.length === 0 ? <Empty t="No submissions yet." /> :
            subs.map(s => <Row key={s.id} a={s.name} b={s.publish_status.replace(/_/g, ' ')} c={ago(s.created_at)} />)}
        </div>
        <div className="card">
          <div className="card-title">Recent enquiries</div>
          {leads === null ? <Empty t="Loading…" /> : leads.length === 0 ? <Empty t="No enquiries yet." /> :
            leads.map(l => <Row key={l.id} a={l.project} b={l.stage ? l.stage.replace(/_/g, ' ') : 'enquiry'} c={ago(l.created_at)} />)}
        </div>
      </div>
    </>
  )
}