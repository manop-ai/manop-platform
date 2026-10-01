'use client'
// app/admin/leads/page.tsx
//
// The gap flagged in the last takeover pass: MANOP had zero visibility
// into the developer_leads pipeline. Developers could see and move their
// own leads (app/developer/dashboard), agencies could see (read-only)
// leads on developments they submitted, but nothing anywhere let admin
// see the platform-wide enquiry → close pipeline that the whole success
// fee model depends on.
//
// Gated by useAuth('admin'). The real boundary is RLS — leads_admin_all
// on developer_leads/lead_stage_log requires is_manop_admin() to be true
// for this session's auth.uid(), independent of whatever this client-side
// check shows. See 001_admin_auth_and_developer_rls.sql.
//
// Every stage change made here logs to lead_stage_log with
// changed_by: 'admin', same audit trail the developer dashboard writes to.

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { sb } from '../../../lib/supabase/client'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import { useAuth } from '../../../lib/useAuth'
import ManopLoader from '../../../components/ManopLoader'

const STAGES = ['enquiry', 'contacted', 'viewing', 'negotiating', 'reserved', 'sold', 'lost'] as const
const FEE_STATUSES = ['not_applicable', 'pending', 'invoiced', 'paid', 'disputed', 'waived'] as const

interface Lead {
  id: string
  developer_id: string
  project_id: string
  name: string
  email: string | null
  phone: string | null
  country: string | null
  is_diaspora: boolean | null
  budget_usd: number | null
  unit_interest: string | null
  note: string | null
  source: string | null
  stage: string
  manop_lead_id: string | null
  fee_percentage: number | null
  declared_txn_value: number | null
  fee_amount: number | null
  fee_status: string | null
  closed_at: string | null
  created_at: string
}

interface ProjectLite { id: string; name: string; city: string | null }
interface DevLite { id: string; company_name: string }

function fmtNGN(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1e9) return `₦${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(1)}M`
  return `₦${n.toLocaleString()}`
}

export default function AdminLeadsPage() {
  const { user, checking } = useAuth('admin')
  const [dark, setDark] = useState(getInitialDark)

  const [leads, setLeads] = useState<Lead[]>([])
  const [projects, setProjects] = useState<Record<string, ProjectLite>>({})
  const [developers, setDevelopers] = useState<Record<string, DevLite>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [stageFilter, setStageFilter] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const [feeDrafts, setFeeDrafts] = useState<Record<string, {
    declared_txn_value: string
    fee_amount: string
    fee_status: string
  }>>({})

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 3000)
  }

  useEffect(() => {
    return listenTheme(setDark)
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setLoadError('')

    const { data: leadRows, error: leadErr } = await sb
      .from('developer_leads')
      .select('*')
      .order('created_at', { ascending: false })

    if (leadErr) {
      setLoadError(
        leadErr.message.includes('permission')
          ? 'No admin access — confirm your login is in admin_users (see 001_admin_auth_and_developer_rls.sql).'
          : leadErr.message,
      )
      setLoading(false)
      return
    }

    setLeads((leadRows as Lead[]) || [])

    const devIds = Array.from(new Set((leadRows || []).map((l: Lead) => l.developer_id).filter(Boolean)))
    const projIds = Array.from(new Set((leadRows || []).map((l: Lead) => l.project_id).filter(Boolean)))

    if (devIds.length > 0) {
      const { data: devs } = await sb
        .from('developer_accounts')
        .select('id, company_name')
        .in('id', devIds)
      const map: Record<string, DevLite> = {}
      ;(devs || []).forEach((d: DevLite) => { map[d.id] = d })
      setDevelopers(map)
    }

    if (projIds.length > 0) {
      const { data: projs } = await sb
        .from('developer_projects')
        .select('id, name, city')
        .in('id', projIds)
      const map: Record<string, ProjectLite> = {}
      ;(projs || []).forEach((p: ProjectLite) => { map[p.id] = p })
      setProjects(map)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    if (user) loadAll()
  }, [user, loadAll])

  async function changeStage(lead: Lead, newStage: string) {
    const { error } = await sb
      .from('developer_leads')
      .update({ stage: newStage, updated_at: new Date().toISOString() })
      .eq('id', lead.id)

    if (error) { flash(`Error: ${error.message}`, false); return }

    await sb.from('lead_stage_log').insert({
      lead_id: lead.id,
      manop_lead_id: lead.manop_lead_id,
      from_stage: lead.stage,
      to_stage: newStage,
      changed_by: 'admin',
    })

    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, stage: newStage } : l))
    flash('✓ Stage updated', true)
  }

  function openFeeEditor(lead: Lead) {
    setExpandedId(prev => prev === lead.id ? null : lead.id)
    setFeeDrafts(prev => ({
      ...prev,
      [lead.id]: prev[lead.id] || {
        declared_txn_value: lead.declared_txn_value != null ? String(lead.declared_txn_value) : '',
        fee_amount: lead.fee_amount != null ? String(lead.fee_amount) : '',
        fee_status: lead.fee_status || 'not_applicable',
      },
    }))
  }

  async function saveFee(lead: Lead) {
    const draft = feeDrafts[lead.id]
    if (!draft) return

    const declared_txn_value = draft.declared_txn_value ? Number(draft.declared_txn_value) : null
    const fee_amount = draft.fee_amount ? Number(draft.fee_amount) : null
    const fee_status = draft.fee_status

    const update: Record<string, unknown> = {
      declared_txn_value,
      fee_amount,
      fee_status,
    }
    if ((fee_status === 'invoiced' || fee_status === 'paid') && !lead.closed_at) {
      update.closed_at = new Date().toISOString()
    }

    const { error } = await sb.from('developer_leads').update(update).eq('id', lead.id)
    if (error) { flash(`Error: ${error.message}`, false); return }

    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, ...update } as Lead : l))
    flash('✓ Fee tracking saved', true)
  }

  const bg     = dark ? '#0F172A' : '#F8FAFC'
  const bg2    = dark ? '#1E293B' : '#F1F5F9'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.08)'

  const CARD: React.CSSProperties = {
    background: bg3, border: `1px solid ${border}`, borderRadius: 12,
    padding: '1.1rem', marginBottom: 10,
  }
  const INP: React.CSSProperties = {
    background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    border: `1px solid ${border}`, borderRadius: 8, color: text,
    fontSize: '0.8rem', outline: 'none', padding: '0.5rem 0.7rem',
    fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
  }

  if (checking || loading) {
    return (
      <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ManopLoader />
      </div>
    )
  }

  const filtered = stageFilter === 'all' ? leads : leads.filter(l => l.stage === stageFilter)

  const stats = {
    total: leads.length,
    active: leads.filter(l => !['sold', 'lost'].includes(l.stage)).length,
    closedWon: leads.filter(l => l.stage === 'sold').length,
    totalDeclaredNGN: leads.reduce((s, l) => s + (l.declared_txn_value || 0), 0),
    totalFeesPending: leads.filter(l => l.fee_status === 'pending' || l.fee_status === 'invoiced')
      .reduce((s, l) => s + (l.fee_amount || 0), 0),
    totalFeesPaid: leads.filter(l => l.fee_status === 'paid').reduce((s, l) => s + (l.fee_amount || 0), 0),
  }

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }}>
      <div style={{
        background: bg2, borderBottom: `1px solid ${border}`, padding: '0.875rem 1.5rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
      }}>
        <div>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#5B2EFF', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Admin
          </div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Leads &amp; Transaction Pipeline</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/admin/developments" style={{
            fontSize: 12, color: text3, textDecoration: 'none', padding: '0.4rem 0.75rem',
            borderRadius: 7, border: `1px solid ${border}`,
          }}>
            Developments
          </Link>
        </div>
      </div>

      {msg && (
        <div style={{
          margin: '0.75rem 1.5rem 0', padding: '0.6rem 1rem', borderRadius: 8,
          background: msg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${msg.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
          color: msg.ok ? '#22C55E' : '#EF4444', fontSize: '0.82rem',
        }}>
          {msg.text}
        </div>
      )}

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}>

        {loadError && (
          <div style={{ ...CARD, borderColor: 'rgba(239,68,68,0.35)', color: '#EF4444' }}>
            {loadError}
          </div>
        )}

        {!loadError && (
          <>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 10, marginBottom: '1.5rem',
            }}>
              {[
                { label: 'Total leads', value: String(stats.total) },
                { label: 'Active in pipeline', value: String(stats.active) },
                { label: 'Closed won', value: String(stats.closedWon) },
                { label: 'Declared txn value', value: fmtNGN(stats.totalDeclaredNGN) },
                { label: 'Fees pending/invoiced', value: fmtNGN(stats.totalFeesPending) },
                { label: 'Fees collected', value: fmtNGN(stats.totalFeesPaid) },
              ].map(s => (
                <div key={s.label} style={CARD}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{s.value}</div>
                  <div style={{ fontSize: '0.68rem', color: text3, marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {['all', ...STAGES].map(s => (
                <button
                  key={s}
                  onClick={() => setStageFilter(s)}
                  style={{
                    fontSize: '0.75rem', fontWeight: 600,
                    color: stageFilter === s ? '#fff' : text2,
                    background: stageFilter === s ? '#5B2EFF' : 'transparent',
                    border: `1px solid ${stageFilter === s ? '#5B2EFF' : border}`,
                    borderRadius: 20, padding: '0.4rem 0.9rem', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {s === 'all' ? `All (${leads.length})` : `${s} (${leads.filter(l => l.stage === s).length})`}
                </button>
              ))}
            </div>

            {filtered.length === 0 && (
              <div style={{ ...CARD, textAlign: 'center', padding: '2rem 1rem', color: text2 }}>
                No leads {stageFilter !== 'all' ? `at stage "${stageFilter}"` : 'yet'}.
              </div>
            )}

            {filtered.map(lead => {
              const project = projects[lead.project_id]
              const developer = developers[lead.developer_id]
              const draft = feeDrafts[lead.id]
              const expanded = expandedId === lead.id

              return (
                <div key={lead.id} style={CARD}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{lead.name}</div>
                      <div style={{ fontSize: '0.75rem', color: text3, marginTop: 2 }}>
                        {lead.phone || lead.email || 'No contact provided'}
                        {lead.is_diaspora && ' · Diaspora'}
                        {lead.country ? ` · ${lead.country}` : ''}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: text2, marginTop: 4 }}>
                        {project?.name || 'Unknown development'}{project?.city ? ` · ${project.city}` : ''}
                        {' — '}
                        {developer?.company_name || 'Unclaimed / unlinked developer'}
                      </div>
                      {lead.unit_interest && (
                        <div style={{ fontSize: '0.72rem', color: text3, marginTop: 2 }}>
                          Interested in: {lead.unit_interest}
                        </div>
                      )}
                      {lead.note && (
                        <div style={{ fontSize: '0.75rem', color: text2, marginTop: 4, fontStyle: 'italic' }}>
                          &ldquo;{lead.note}&rdquo;
                        </div>
                      )}
                      <div style={{ fontSize: '0.65rem', color: text3, marginTop: 4 }}>
                        {lead.manop_lead_id && `Lead ${lead.manop_lead_id.slice(0, 8)} · `}
                        Submitted {new Date(lead.created_at).toLocaleDateString()}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                      <select
                        value={lead.stage}
                        onChange={e => changeStage(lead, e.target.value)}
                        style={{ ...INP, width: 'auto' }}
                      >
                        {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>

                      <button
                        onClick={() => openFeeEditor(lead)}
                        style={{
                          fontSize: '0.72rem', fontWeight: 600, color: '#5B2EFF',
                          background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        {expanded ? 'Hide fee tracking ▲' : 'Fee tracking ▼'}
                      </button>

                      {lead.fee_status && lead.fee_status !== 'not_applicable' && (
                        <div style={{
                          fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                          color: lead.fee_status === 'paid' ? '#22C55E' : '#F59E0B',
                        }}>
                          {lead.fee_status}
                        </div>
                      )}
                    </div>
                  </div>

                  {expanded && draft && (
                    <div style={{
                      marginTop: 12, paddingTop: 12, borderTop: `1px solid ${border}`,
                      display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, alignItems: 'end',
                    }}>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: text3, marginBottom: 4 }}>
                          Declared transaction value (₦)
                        </div>
                        <input
                          type="number"
                          style={INP}
                          value={draft.declared_txn_value}
                          onChange={e => setFeeDrafts(prev => ({
                            ...prev,
                            [lead.id]: { ...prev[lead.id], declared_txn_value: e.target.value },
                          }))}
                          placeholder="e.g. 85000000"
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: text3, marginBottom: 4 }}>
                          Fee amount (₦)
                        </div>
                        <input
                          type="number"
                          style={INP}
                          value={draft.fee_amount}
                          onChange={e => setFeeDrafts(prev => ({
                            ...prev,
                            [lead.id]: { ...prev[lead.id], fee_amount: e.target.value },
                          }))}
                          placeholder="Manually entered — no % assumed"
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: text3, marginBottom: 4 }}>
                          Fee status
                        </div>
                        <select
                          style={INP}
                          value={draft.fee_status}
                          onChange={e => setFeeDrafts(prev => ({
                            ...prev,
                            [lead.id]: { ...prev[lead.id], fee_status: e.target.value },
                          }))}
                        >
                          {FEE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div style={{ gridColumn: '1/-1' }}>
                        <button
                          onClick={() => saveFee(lead)}
                          style={{
                            background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8,
                            padding: '0.5rem 1.1rem', fontWeight: 700, fontSize: '0.8rem',
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          Save fee tracking
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}