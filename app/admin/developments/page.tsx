'use client'
// app/admin/developments/page.tsx — MANOP Reviewed Developments admin panel
//
// Lets admin, with no developer login required, do the entire Day-1 flow:
//   1. Create or select an unclaimed developer_accounts record
//   2. Add a project (development) under that developer
//   3. Add unit types
//   4. Record comparables for that neighborhood/segment
//   5. Write the review (checked / flagged / recommendation)
//   6. Publish — blocked by a DB constraint until a recommendation exists
//
// Gated by useAuth('admin'). Follows the same direct-Supabase-write pattern
// as app/admin/verification/page.tsx — relies on RLS admin policies already
// in place for that page's writes to data_partners; the same policy shape
// needs to exist for developer_accounts / developer_projects / etc. if it
// doesn't already.

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import { useAuth } from '../../../lib/useAuth'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

const COUNTRIES = [
  { code: 'NG', label: 'Nigeria', currency: 'NGN' },
  { code: 'GH', label: 'Ghana',   currency: 'GHS' },
]

interface DeveloperAccount {
  id: string
  company_name: string
  country_code: string
  city: string | null
  account_status: string
  cac_number: string | null
  years_active: number | null
}

interface Project {
  id: string
  name: string
  neighborhood: string | null
  city: string | null
  publish_status: string
  manop_recommendation: string | null
  submitted_via: string | null
}

interface VerifiedAgency {
  id: string
  name: string
}

export default function AdminDevelopmentsPage() {
  const { user, checking } = useAuth('admin')
  const [dark, setDark] = useState(true)

  const [developers, setDevelopers] = useState<DeveloperAccount[]>([])
  const [selectedDeveloperId, setSelectedDeveloperId] = useState<string>('')
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [verifiedAgencies, setVerifiedAgencies] = useState<VerifiedAgency[]>([])

  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const flash = (text: string, ok: boolean) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 3500) }

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  const loadDevelopers = useCallback(async () => {
    const { data } = await sb
      .from('developer_accounts')
      .select('id,company_name,country_code,city,account_status,cac_number,years_active')
      .order('company_name')
    setDevelopers((data as DeveloperAccount[]) || [])
  }, [])

  const loadVerifiedAgencies = useCallback(async () => {
    // Reuses the existing agency verification pipeline (data_partners) —
    // no separate agent-verification system. Only agencies MANOP has
    // already verified show up as eligible to submit a development.
    const { data } = await sb
      .from('data_partners')
      .select('id,name')
      .eq('partner_type', 'agency')
      .eq('verification_status', 'verified')
      .order('name')
    setVerifiedAgencies((data as VerifiedAgency[]) || [])
  }, [])

  const loadProjects = useCallback(async (developerId: string) => {
    if (!developerId) { setProjects([]); return }
    const { data } = await sb
      .from('developer_projects')
      .select('id,name,neighborhood,city,publish_status,manop_recommendation,submitted_via')
      .eq('developer_id', developerId)
      .order('created_at', { ascending: false })
    setProjects((data as Project[]) || [])
  }, [])

  useEffect(() => { if (user) { loadDevelopers(); loadVerifiedAgencies() } }, [user, loadDevelopers, loadVerifiedAgencies])
  useEffect(() => { loadProjects(selectedDeveloperId) }, [selectedDeveloperId, loadProjects])

  // ── New developer form ──────────────────────────────────────
  const [devForm, setDevForm] = useState({
    company_name: '', country_code: 'NG', city: '', cac_number: '',
    contact_name: '', contact_email: '', contact_phone: '',
    years_active: '', track_record_notes: '', risk_notes: '',
  })

  async function createDeveloper() {
    if (!devForm.company_name.trim()) { flash('Company name is required', false); return }
    const { data, error } = await sb.from('developer_accounts').insert({
      company_name:       devForm.company_name,
      country_code:       devForm.country_code,
      city:                devForm.city || null,
      cac_number:          devForm.cac_number || null,
      contact_name:        devForm.contact_name || null,
      contact_email:       devForm.contact_email || null,
      years_active:        devForm.years_active ? parseInt(devForm.years_active) : null,
      track_record_notes:  devForm.track_record_notes || null,
      risk_notes:          devForm.risk_notes || null,
      account_status:      'unclaimed',
      added_by:            'manop_admin',
    }).select('id').maybeSingle()

    if (error) { flash(`Error: ${error.message}`, false); return }
    flash(`✓ ${devForm.company_name} added (unclaimed)`, true)
    setDevForm({ company_name: '', country_code: 'NG', city: '', cac_number: '', contact_name: '', contact_email: '', contact_phone: '', years_active: '', track_record_notes: '', risk_notes: '' })
    await loadDevelopers()
    if (data?.id) setSelectedDeveloperId(data.id)
  }

  // ── New project form ────────────────────────────────────────
  const [projForm, setProjForm] = useState({
    name: '', neighborhood: '', city: '', state: '', country_code: 'NG',
    stage: 'Foundation', total_units: '', handover_date: '',
    title_type: '', virtual_viewing: false, remote_purchase: false, poa_process: false,
    international_payment: false,
    // Submission path — who brought this development to MANOP
    submitted_via: 'manop_direct' as 'manop_direct' | 'agency_submission',
    submitting_agency_id: '',
    mandate_type: 'direct_authority' as 'direct_authority' | 'developer_mandate',
    mandate_document_url: '',
    fee_model: 'developer_success_fee' as 'developer_success_fee' | 'agency_commission_share',
    agency_fee_share_pct: '25',
  })

  async function createProject() {
    if (!selectedDeveloperId) { flash('Select or create a developer first', false); return }
    if (!projForm.name.trim()) { flash('Development name is required', false); return }
    if (projForm.submitted_via === 'agency_submission' && !projForm.submitting_agency_id) {
      flash('Select the submitting agency — only verified agencies can submit', false); return
    }

    const { data, error } = await sb.from('developer_projects').insert({
      developer_id:           selectedDeveloperId,
      name:                    projForm.name,
      neighborhood:            projForm.neighborhood || null,
      city:                    projForm.city || null,
      state:                   projForm.state || null,
      country_code:            projForm.country_code,
      stage:                   projForm.stage,
      total_units:             projForm.total_units ? parseInt(projForm.total_units) : null,
      handover_date:           projForm.handover_date || null,
      virtual_viewing:         projForm.virtual_viewing,
      remote_purchase:         projForm.remote_purchase,
      poa_process:             projForm.poa_process,
      international_payment:   projForm.international_payment,
      entry_source:            'manop_sourced',
      publish_status:          'draft',
      submitted_via:           projForm.submitted_via,
      submitting_agency_id:    projForm.submitted_via === 'agency_submission' ? projForm.submitting_agency_id : null,
      mandate_type:            projForm.submitted_via === 'agency_submission' ? projForm.mandate_type : null,
      mandate_document_url:   projForm.submitted_via === 'agency_submission' ? (projForm.mandate_document_url || null) : null,
      fee_model:               projForm.submitted_via === 'agency_submission' ? projForm.fee_model : 'developer_success_fee',
      agency_fee_share_pct:    projForm.submitted_via === 'agency_submission' && projForm.fee_model === 'agency_commission_share'
                                  ? parseFloat(projForm.agency_fee_share_pct) : null,
    }).select('id').maybeSingle()

    if (error) { flash(`Error: ${error.message}`, false); return }
    flash(`✓ ${projForm.name} added as draft`, true)
    setProjForm({ name: '', neighborhood: '', city: '', state: '', country_code: 'NG', stage: 'Foundation', total_units: '', handover_date: '', title_type: '', virtual_viewing: false, remote_purchase: false, poa_process: false, international_payment: false, submitted_via: 'manop_direct', submitting_agency_id: '', mandate_type: 'direct_authority', mandate_document_url: '', fee_model: 'developer_success_fee', agency_fee_share_pct: '25' })
    await loadProjects(selectedDeveloperId)
    if (data?.id) setSelectedProjectId(data.id)
  }

  // ── Review + publish ────────────────────────────────────────
  const [reviewForm, setReviewForm] = useState({
    manop_checked_note: '', manop_flag_note: '', manop_recommendation: '',
  })

  async function saveReviewAndPublish(publish: boolean) {
    if (!selectedProjectId) { flash('Select a development first', false); return }
    if (publish && !reviewForm.manop_recommendation) {
      flash('A recommendation is required before publishing — that is the gate, by design', false); return
    }
    const { error } = await sb.from('developer_projects').update({
      manop_checked_note:   reviewForm.manop_checked_note || null,
      manop_flag_note:      reviewForm.manop_flag_note || null,
      manop_recommendation: reviewForm.manop_recommendation || null,
      reviewed_at:          new Date().toISOString(),
      publish_status:       publish ? 'published' : 'pending_review',
    }).eq('id', selectedProjectId)

    if (error) { flash(`Error: ${error.message}`, false); return }
    flash(publish ? '✓ Published' : '✓ Saved as pending review', true)
    await loadProjects(selectedDeveloperId)
  }

  // ── Theme ────────────────────────────────────────────────────
  const bg     = dark ? '#0F172A' : '#F8FAFC'
  const bg2    = dark ? '#1E293B' : '#F1F5F9'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.08)'
  const accent = '#5B2EFF'
  const teal   = '#14B8A6'

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.55rem 0.7rem', borderRadius: 8,
    border: `1px solid ${border}`, background: bg2, color: text,
    fontSize: 13, fontFamily: 'inherit', marginBottom: 8,
  }
  const labelStyle: React.CSSProperties = { fontSize: 11, color: text3, marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' }
  const sectionStyle: React.CSSProperties = { background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '1.25rem', marginBottom: 16 }
  const btnPrimary: React.CSSProperties = { background: accent, color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1rem', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
  const btnSecondary: React.CSSProperties = { background: 'transparent', color: text, border: `1px solid ${border}`, borderRadius: 8, padding: '0.6rem 1rem', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }

  if (checking) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 30, height: 30, border: '3px solid rgba(91,46,255,0.18)', borderTopColor: accent, borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }}>
      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: 15 }}>M</div>
          </Link>
          <div>
            <div style={{ fontWeight: 700, color: text, fontSize: 14 }}>Admin · Reviewed Developments</div>
            <div style={{ fontSize: 11, color: text3 }}>Add developers &amp; projects — no developer login required</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: text3 }}>{user?.email}</div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}>

        {msg && (
          <div style={{ background: msg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${msg.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 8, padding: '0.65rem 0.875rem', fontSize: 13, color: msg.ok ? '#22C55E' : '#EF4444', marginBottom: 14 }}>
            {msg.text}
          </div>
        )}

        {/* ── Step 1: Developer ─────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: teal, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            Step 1 · Developer
          </div>

          <label style={labelStyle}>Select existing developer</label>
          <select style={inputStyle} value={selectedDeveloperId} onChange={e => setSelectedDeveloperId(e.target.value)}>
            <option value="">— choose —</option>
            {developers.map(d => (
              <option key={d.id} value={d.id}>
                {d.company_name} · {d.country_code} · {d.account_status}
              </option>
            ))}
          </select>

          <div style={{ fontSize: 12, color: text3, margin: '10px 0' }}>— or add a new one —</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Company name</label>
              <input style={inputStyle} value={devForm.company_name} onChange={e => setDevForm({ ...devForm, company_name: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Country</label>
              <select style={inputStyle} value={devForm.country_code} onChange={e => setDevForm({ ...devForm, country_code: e.target.value })}>
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>City</label>
              <input style={inputStyle} value={devForm.city} onChange={e => setDevForm({ ...devForm, city: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>CAC number</label>
              <input style={inputStyle} value={devForm.cac_number} onChange={e => setDevForm({ ...devForm, cac_number: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Contact name</label>
              <input style={inputStyle} value={devForm.contact_name} onChange={e => setDevForm({ ...devForm, contact_name: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Contact email</label>
              <input style={inputStyle} value={devForm.contact_email} onChange={e => setDevForm({ ...devForm, contact_email: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Years active</label>
              <input type="number" style={inputStyle} value={devForm.years_active} onChange={e => setDevForm({ ...devForm, years_active: e.target.value })} />
            </div>
          </div>
          <label style={labelStyle}>Track record (completed projects, claimed by developer)</label>
          <textarea style={{ ...inputStyle, minHeight: 60 }} value={devForm.track_record_notes} onChange={e => setDevForm({ ...devForm, track_record_notes: e.target.value })} />
          <label style={labelStyle}>Risk notes (private — anything found independently, never shown publicly)</label>
          <textarea style={{ ...inputStyle, minHeight: 60 }} value={devForm.risk_notes} onChange={e => setDevForm({ ...devForm, risk_notes: e.target.value })} />

          <button style={btnPrimary} onClick={createDeveloper}>Add developer (unclaimed)</button>
        </div>

        {/* ── Step 2: Project ───────────────────────────────── */}
        {selectedDeveloperId && (
          <div style={sectionStyle}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: teal, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
              Step 2 · Development
            </div>

            {projects.length > 0 && (
              <>
                <label style={labelStyle}>Existing developments for this developer</label>
                <select style={inputStyle} value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>
                  <option value="">— choose —</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.publish_status} {p.manop_recommendation ? `· ${p.manop_recommendation}` : ''} {p.submitted_via === 'agency_submission' ? '· via agency' : ''}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 12, color: text3, margin: '10px 0' }}>— or add a new one —</div>
              </>
            )}

            {/* ── Who is submitting this development ────────── */}
            <div style={{ background: bg2, borderRadius: 10, padding: '0.875rem', marginBottom: 14 }}>
              <label style={labelStyle}>Submission path</label>
              <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                {([
                  ['manop_direct', 'MANOP direct — we sourced and diligenced it ourselves'],
                  ['agency_submission', 'Agency submission — a verified agency brought this, with a mandate'],
                ] as const).map(([val, label]) => (
                  <label key={val} style={{ fontSize: 12, color: text2, display: 'flex', alignItems: 'flex-start', gap: 6, flex: 1 }}>
                    <input type="radio" checked={projForm.submitted_via === val} onChange={() => setProjForm({ ...projForm, submitted_via: val })} style={{ marginTop: 2 }} />
                    {label}
                  </label>
                ))}
              </div>

              {projForm.submitted_via === 'agency_submission' && (
                <>
                  <label style={labelStyle}>Submitting agency (verified agencies only)</label>
                  {verifiedAgencies.length === 0 && (
                    <div style={{ fontSize: 12, color: '#F59E0B', marginBottom: 8 }}>
                      No verified agencies on file yet — verify one in the Verify Queue first.
                    </div>
                  )}
                  <select style={inputStyle} value={projForm.submitting_agency_id} onChange={e => setProjForm({ ...projForm, submitting_agency_id: e.target.value })}>
                    <option value="">— choose —</option>
                    {verifiedAgencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Mandate type</label>
                      <select style={inputStyle} value={projForm.mandate_type} onChange={e => setProjForm({ ...projForm, mandate_type: e.target.value as any })}>
                        <option value="direct_authority">Agency has direct authority to market</option>
                        <option value="developer_mandate">Agency holds a documented developer mandate</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Mandate document URL</label>
                      <input style={inputStyle} value={projForm.mandate_document_url} onChange={e => setProjForm({ ...projForm, mandate_document_url: e.target.value })} placeholder="Link to uploaded mandate letter" />
                    </div>
                    <div>
                      <label style={labelStyle}>Fee model</label>
                      <select style={inputStyle} value={projForm.fee_model} onChange={e => setProjForm({ ...projForm, fee_model: e.target.value as any })}>
                        <option value="agency_commission_share">MANOP takes a share of the agency's commission</option>
                        <option value="developer_success_fee">Standard developer success fee</option>
                      </select>
                    </div>
                    {projForm.fee_model === 'agency_commission_share' && (
                      <div>
                        <label style={labelStyle}>MANOP's share of agency commission (%)</label>
                        <input type="number" style={inputStyle} value={projForm.agency_fee_share_pct} onChange={e => setProjForm({ ...projForm, agency_fee_share_pct: e.target.value })} placeholder="e.g. 25" />
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: text3, marginTop: 4 }}>
                    The agency becomes the ongoing update contact for this development — construction
                    progress, availability, and pricing changes come from them, not from MANOP chasing
                    the developer directly. The review and publish gate below still applies exactly the same.
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Development name</label>
                <input style={inputStyle} value={projForm.name} onChange={e => setProjForm({ ...projForm, name: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Country</label>
                <select style={inputStyle} value={projForm.country_code} onChange={e => setProjForm({ ...projForm, country_code: e.target.value })}>
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Neighborhood</label>
                <input style={inputStyle} value={projForm.neighborhood} onChange={e => setProjForm({ ...projForm, neighborhood: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>City</label>
                <input style={inputStyle} value={projForm.city} onChange={e => setProjForm({ ...projForm, city: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>State</label>
                <input style={inputStyle} value={projForm.state} onChange={e => setProjForm({ ...projForm, state: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Stage</label>
                <select style={inputStyle} value={projForm.stage} onChange={e => setProjForm({ ...projForm, stage: e.target.value })}>
                  {['Planning','Foundation','Structure','Finishing','Completed'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Total units</label>
                <input type="number" style={inputStyle} value={projForm.total_units} onChange={e => setProjForm({ ...projForm, total_units: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Expected handover</label>
                <input type="date" style={inputStyle} value={projForm.handover_date} onChange={e => setProjForm({ ...projForm, handover_date: e.target.value })} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' as const, margin: '4px 0 12px' }}>
              {([
                ['virtual_viewing', 'Virtual viewing available'],
                ['remote_purchase', 'Remote purchase supported'],
                ['poa_process', 'Power of Attorney process supported'],
                ['international_payment', 'International payment accepted'],
              ] as const).map(([key, label]) => (
                <label key={key} style={{ fontSize: 12, color: text2, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={(projForm as any)[key]} onChange={e => setProjForm({ ...projForm, [key]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </div>

            <button style={btnPrimary} onClick={createProject}>Add development (draft)</button>
          </div>
        )}

        {/* ── Comparables now live on their own page ─────────── */}
        {selectedProjectId && (
          <div style={{ ...sectionStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: teal, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
                Comparables
              </div>
              <div style={{ fontSize: 12, color: text3 }}>
                Comparables are recorded on their own page — add or check them for this neighborhood any time, independent of this development.
              </div>
            </div>
            <Link href="/admin/comparables" style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-block' }}>
              Open comparables →
            </Link>
          </div>
        )}

        {/* ── Step 4: Review + publish ──────────────────────── */}
        {selectedProjectId && (
          <div style={sectionStyle}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: teal, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
              Step 3 · MANOP review — required before publishing
            </div>

            <label style={labelStyle}>What we checked</label>
            <textarea style={{ ...inputStyle, minHeight: 60 }} value={reviewForm.manop_checked_note} onChange={e => setReviewForm({ ...reviewForm, manop_checked_note: e.target.value })} />

            <label style={labelStyle}>What to flag (or state that nothing was found)</label>
            <textarea style={{ ...inputStyle, minHeight: 60 }} value={reviewForm.manop_flag_note} onChange={e => setReviewForm({ ...reviewForm, manop_flag_note: e.target.value })} />

            <label style={labelStyle}>Recommendation</label>
            <select style={inputStyle} value={reviewForm.manop_recommendation} onChange={e => setReviewForm({ ...reviewForm, manop_recommendation: e.target.value })}>
              <option value="">— choose —</option>
              <option value="recommended">Recommended</option>
              <option value="proceed_with_caution">Proceed with caution</option>
              <option value="not_recommended">Not recommended</option>
            </select>

            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button style={btnSecondary} onClick={() => saveReviewAndPublish(false)}>Save as pending review</button>
              <button style={btnPrimary} onClick={() => saveReviewAndPublish(true)}>Publish</button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}