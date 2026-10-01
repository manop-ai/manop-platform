'use client'
// app/admin/developments/page.tsx — MANOP Reviewed Developments admin panel
//
// Lets admin, with no developer login required, do the entire Day-1 flow:
//   1. Create or select an unclaimed developer_accounts record
//   2. Add a project (development) under that developer
//   3. Add unit types
//   4. Record comparables for that neighborhood/segment
//   5. Upload development media (gallery, via ImageUploader/Cloudinary)
//   6. Write the review (what was checked, considerations found)
//   7. Mark as reviewed, then publish — blocked until reviewed_at is set
//
// MANOP does not issue recommendations (migration 009,
// manop_review_not_recommendation) — "Mark as reviewed" replaces the old
// Recommended / Proceed with caution / Not recommended dropdown, and
// publishing is gated on reviewed_at IS NOT NULL, not on a recommendation.
//
// Gated by useAuth('admin'). Follows the same direct-Supabase-write pattern
// as app/admin/verification/page.tsx — relies on RLS admin policies already
// in place for that page's writes to data_partners; the same policy shape
// needs to exist for developer_accounts / developer_projects / etc. if it
// doesn't already.

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { sb } from '../../../lib/supabase/client'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import { useAuth } from '../../../lib/useAuth'
import ImageUploader from '../../../components/ImageUploader'
import ManopLoader from '../../../components/ManopLoader'

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
  state: string | null
  country_code: string | null
  stage: string | null
  total_units: number | null
  handover_date: string | null
  virtual_viewing: boolean | null
  remote_purchase: boolean | null
  poa_process: boolean | null
  international_payment: boolean | null
  publish_status: string
  submitted_via: string | null
  submitting_agency_id: string | null
  mandate_type: string | null
  mandate_document_url: string | null
  fee_model: string | null
  agency_fee_share_pct: number | null
  reviewed_at: string | null
  manop_checked_note: string | null
  manop_flag_note: string | null
  images: string[] | null
  video_urls: string[] | null
}

interface UnitType {
  id: string
  unit_type: string
  price_ngn: number | null
  quantity: number | null
  size_sqm: number | null
}

interface EvidenceRow {
  id: string
  category: string
  claim: string
  source: string | null
  status: string
  next_action: string | null
  recorded_at: string
}

interface UpdateRow {
  id: string
  title: string
  body: string | null
  stage_at_time: string | null
  completion_pct_at_time: number | null
  posted_by_role: string
  verification_status: string
  posted_at: string
}

const EVIDENCE_CATEGORIES = [
  'identity','site','unit_mix','floor_configuration','construction',
  'amenities','architectural_design','location_positioning',
  'pricing','payment_plan','planning','title','service_charge',
  'parking','power_water','market_context','rental_yield',
  'developer_track_record','consultant_professional','other',
] as const

const EVIDENCE_STATUSES = [
  'developer_stated','documented','manop_observed','manop_derived',
  'independently_verified','professional_opinion','unknown',
  'contradictory_clarification_required',
] as const

const EVIDENCE_STATUS_COLOR: Record<string, string> = {
  developer_stated: '#F59E0B',
  documented: '#3B82F6',
  manop_observed: '#14B8A6',
  manop_derived: '#14B8A6',
  independently_verified: '#22C55E',
  professional_opinion: '#8B5CF6',
  unknown: '#64748B',
  contradictory_clarification_required: '#EF4444',
}

// A row in the global Pending Review list — spans every developer, not
// just whichever one happens to be selected in Step 1. This is the fix
// for drafts effectively "disappearing": a project only ever showed up
// in the Step 2 dropdown for the developer it was created under, so
// moving on to work on a different developer made the first one
// impossible to find again without remembering which developer it
// belonged to.
interface PendingProject {
  id: string
  name: string
  neighborhood: string | null
  city: string | null
  publish_status: string
  submitted_via: string | null
  created_at: string
  developer_id: string
  developer_name: string
  submitting_agency_id: string | null
  agency_name: string | null
  agency_verification_status: string | null
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
  const [pending, setPending] = useState<PendingProject[]>([])
  const [showPending, setShowPending] = useState(true)

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
      .select('id,name,neighborhood,city,state,country_code,stage,total_units,handover_date,virtual_viewing,remote_purchase,poa_process,international_payment,publish_status,submitted_via,submitting_agency_id,mandate_type,mandate_document_url,fee_model,agency_fee_share_pct,reviewed_at,manop_checked_note,manop_flag_note,images,video_urls')
      .eq('developer_id', developerId)
      .order('created_at', { ascending: false })
    setProjects((data as Project[]) || [])
  }, [])

  // Global — every developer, not just the one selected in Step 1. This
  // is what makes a draft findable again regardless of which developer
  // you're currently working on.
  const loadPending = useCallback(async () => {
    const { data } = await sb
      .from('developer_projects')
      .select('id,name,neighborhood,city,publish_status,submitted_via,created_at,developer_id,submitting_agency_id,developer_accounts(company_name),data_partners!submitting_agency_id(name,verification_status)')
      .in('publish_status', ['draft', 'pending_review'])
      .order('created_at', { ascending: false })
    setPending(((data as any[]) || []).map(p => ({
      ...p,
      developer_name: Array.isArray(p.developer_accounts) ? p.developer_accounts[0]?.company_name : p.developer_accounts?.company_name,
      agency_name: Array.isArray(p.data_partners) ? p.data_partners[0]?.name : p.data_partners?.name,
      agency_verification_status: Array.isArray(p.data_partners) ? p.data_partners[0]?.verification_status : p.data_partners?.verification_status,
    })))
  }, [])

  function openPendingItem(p: PendingProject) {
    setSelectedDeveloperId(p.developer_id)
    setSelectedProjectId(p.id)
    setShowPending(false)
  }

  useEffect(() => { if (user) { loadDevelopers(); loadVerifiedAgencies(); loadPending() } }, [user, loadDevelopers, loadVerifiedAgencies, loadPending])
  useEffect(() => { loadProjects(selectedDeveloperId) }, [selectedDeveloperId, loadProjects])

  // Keep the review form in sync with whichever development is selected —
  // otherwise switching between developments would show stale notes from
  // whatever was last typed, or silently overwrite one project's notes with
  // another's on save.
  useEffect(() => {
    const current = projects.find(p => p.id === selectedProjectId)
    setReviewForm({
      manop_checked_note: current?.manop_checked_note || '',
      manop_flag_note:    current?.manop_flag_note || '',
    })
  }, [selectedProjectId, projects])

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
      email:               devForm.contact_email || null,
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
  function emptyProjForm() {
    return {
      name: '', neighborhood: '', city: '', state: '', country_code: 'NG',
      stage: 'Foundation', total_units: '', handover_date: '',
      title_type: '', virtual_viewing: false, remote_purchase: false, poa_process: false,
      international_payment: false,
      submitted_via: 'manop_direct' as 'manop_direct' | 'agency_submission',
      submitting_agency_id: '',
      mandate_type: 'direct_authority' as 'direct_authority' | 'developer_mandate',
      mandate_document_url: '',
      fee_model: 'developer_success_fee' as 'developer_success_fee' | 'agency_commission_share',
      agency_fee_share_pct: '25',
    }
  }
  const [projForm, setProjForm] = useState(emptyProjForm())

  // Keep the base project fields in sync with whichever development is
  // selected — this is the actual fix for "only what they created can be
  // edited": before this, selecting an existing project only fed the
  // review/media sections; the Step 2 field form stayed on whatever was
  // last typed for a NEW project, with no way to load or change a saved
  // project's own name, units, stage, handover date, or mandate info.
  useEffect(() => {
    const current = projects.find(p => p.id === selectedProjectId)
    if (!current) { setProjForm(emptyProjForm()); return }
    setProjForm({
      name:                  current.name || '',
      neighborhood:          current.neighborhood || '',
      city:                  current.city || '',
      state:                 current.state || '',
      country_code:          current.country_code || 'NG',
      stage:                 current.stage || 'Foundation',
      total_units:           current.total_units != null ? String(current.total_units) : '',
      handover_date:         current.handover_date ? current.handover_date.slice(0, 10) : '',
      title_type:            '',
      virtual_viewing:       !!current.virtual_viewing,
      remote_purchase:       !!current.remote_purchase,
      poa_process:           !!current.poa_process,
      international_payment: !!current.international_payment,
      submitted_via:         (current.submitted_via as 'manop_direct' | 'agency_submission') || 'manop_direct',
      submitting_agency_id:  current.submitting_agency_id || '',
      mandate_type:          (current.mandate_type as 'direct_authority' | 'developer_mandate') || 'direct_authority',
      mandate_document_url:  current.mandate_document_url || '',
      fee_model:             (current.fee_model as 'developer_success_fee' | 'agency_commission_share') || 'developer_success_fee',
      agency_fee_share_pct:  current.agency_fee_share_pct != null ? String(current.agency_fee_share_pct) : '25',
    })
  }, [selectedProjectId, projects])

  async function createProject() {
    if (!selectedDeveloperId) { flash('Select or create a developer first', false); return }
    if (!projForm.name.trim()) { flash('Development name is required', false); return }
    if (projForm.submitted_via === 'agency_submission' && !projForm.submitting_agency_id) {
      flash('Select the submitting agency — only verified agencies can submit', false); return
    }

    const { data, error } = await sb.from('developer_projects').insert({
      developer_id:           selectedDeveloperId,
      name:                    projForm.name,
      location:                [projForm.neighborhood, projForm.city].filter(Boolean).join(', ') || projForm.name,
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
    setProjForm(emptyProjForm())
    await loadProjects(selectedDeveloperId)
    await loadPending()
    if (data?.id) setSelectedProjectId(data.id)
  }

  // Editing an existing development — same fields as createProject,
  // but UPDATE, not INSERT, and never touches publish_status/reviewed_at
  // (those stay with the Step 3 review workflow below).
  async function updateProject() {
    if (!selectedProjectId) { flash('Select a development first', false); return }
    if (!projForm.name.trim()) { flash('Development name is required', false); return }
    if (projForm.submitted_via === 'agency_submission' && !projForm.submitting_agency_id) {
      flash('Select the submitting agency — only verified agencies can submit', false); return
    }

    const { error } = await sb.from('developer_projects').update({
      name:                    projForm.name,
      location:                [projForm.neighborhood, projForm.city].filter(Boolean).join(', ') || projForm.name,
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
      submitted_via:           projForm.submitted_via,
      submitting_agency_id:    projForm.submitted_via === 'agency_submission' ? projForm.submitting_agency_id : null,
      mandate_type:            projForm.submitted_via === 'agency_submission' ? projForm.mandate_type : null,
      mandate_document_url:   projForm.submitted_via === 'agency_submission' ? (projForm.mandate_document_url || null) : null,
      fee_model:               projForm.submitted_via === 'agency_submission' ? projForm.fee_model : 'developer_success_fee',
      agency_fee_share_pct:    projForm.submitted_via === 'agency_submission' && projForm.fee_model === 'agency_commission_share'
                                  ? parseFloat(projForm.agency_fee_share_pct) : null,
    }).eq('id', selectedProjectId)

    if (error) { flash(`Error: ${error.message}`, false); return }
    flash(`✓ ${projForm.name} updated`, true)
    await loadProjects(selectedDeveloperId)
    await loadPending()
  }

  // ── Review + publish ────────────────────────────────────────
  // MANOP does not issue recommendations (migration 009,
  // manop_review_not_recommendation) — publishing is gated on
  // `reviewed_at IS NOT NULL`, not on a recommendation value.
  // manop_recommendation may still exist as a column for historical rows
  // but this admin UI no longer reads, writes, or displays it.
  const [reviewForm, setReviewForm] = useState({
    manop_checked_note: '', manop_flag_note: '',
  })

  function currentProject() {
    return projects.find(p => p.id === selectedProjectId) || null
  }

  async function saveNotes() {
    if (!selectedProjectId) { flash('Select a development first', false); return }
    const { error } = await sb.from('developer_projects').update({
      manop_checked_note: reviewForm.manop_checked_note || null,
      manop_flag_note:    reviewForm.manop_flag_note || null,
    }).eq('id', selectedProjectId)

    if (error) { flash(`Error: ${error.message}`, false); return }
    flash('✓ Notes saved', true)
    await loadProjects(selectedDeveloperId)
    await loadPending()
  }

  async function saveAsPendingReview() {
    if (!selectedProjectId) { flash('Select a development first', false); return }
    const { error } = await sb.from('developer_projects').update({
      manop_checked_note: reviewForm.manop_checked_note || null,
      manop_flag_note:    reviewForm.manop_flag_note || null,
      publish_status:      'pending_review',
    }).eq('id', selectedProjectId)

    if (error) { flash(`Error: ${error.message}`, false); return }
    flash('✓ Saved as pending review', true)
    await loadProjects(selectedDeveloperId)
    await loadPending()
  }

  async function markAsReviewed() {
    if (!selectedProjectId) { flash('Select a development first', false); return }
    const { error } = await sb.from('developer_projects').update({
      manop_checked_note: reviewForm.manop_checked_note || null,
      manop_flag_note:    reviewForm.manop_flag_note || null,
      reviewed_at:         new Date().toISOString(),
    }).eq('id', selectedProjectId)

    if (error) { flash(`Error: ${error.message}`, false); return }
    flash('✓ Marked as reviewed', true)
    await loadProjects(selectedDeveloperId)
    await loadPending()
  }

  async function publishDevelopment() {
    if (!selectedProjectId) { flash('Select a development first', false); return }
    const current = currentProject()
    if (!current?.reviewed_at) {
      flash('Mark as reviewed first — unreviewed developments cannot publish', false); return
    }
    const { error } = await sb.from('developer_projects').update({
      publish_status: 'published',
    }).eq('id', selectedProjectId)

    if (error) { flash(`Error: ${error.message}`, false); return }
    flash('✓ Published', true)
    await loadProjects(selectedDeveloperId)
    await loadPending()
  }

  // ── Media (gallery) ─────────────────────────────────────────
  // Reuses the real Cloudinary ImageUploader — no separate upload path.
  // Video is stored as pasted URLs for now (Cloudinary video upload via
  // the same component is worth building, but the public page already
  // renders whatever lands in video_urls through MediaLightbox, so this
  // is a real, working path today rather than a placeholder).
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [videoUrlsText, setVideoUrlsText] = useState('')

  async function saveMedia() {
    if (!selectedProjectId) { flash('Select a development first', false); return }
    const video_urls = videoUrlsText.split('\n').map(s => s.trim()).filter(Boolean)
    const { error } = await sb.from('developer_projects').update({
      images:     pendingImages,
      video_urls: video_urls,
    }).eq('id', selectedProjectId)

    if (error) { flash(`Error: ${error.message}`, false); return }
    flash('✓ Gallery saved', true)
    await loadProjects(selectedDeveloperId)
    await loadPending()
  }

  // Keep the media form in sync with whichever development is selected,
  // same reasoning as the review-form effect above.
  useEffect(() => {
    const current = projects.find(p => p.id === selectedProjectId)
    setPendingImages(current?.images || [])
    setVideoUrlsText((current?.video_urls || []).join('\n'))
  }, [selectedProjectId, projects])

  // ── Submitted documents ──────────────────────────────────────
  // This was the real gap behind "documents should come through in
  // full, just as submitted" — admin never queried developer_documents
  // at all before this, so anything an agency attached (mandate letter,
  // land title, survey, etc.) was invisible here even though it was
  // sitting in the database the whole time.
  interface AdminDoc {
    id: string; document_type: string; document_name: string; document_url: string
    verified: boolean; provided_by: string | null; provided_at: string
  }
  const [documents, setDocuments] = useState<AdminDoc[]>([])

  const loadDocuments = useCallback(async (projectId: string) => {
    if (!projectId) { setDocuments([]); return }
    const { data } = await sb.from('developer_documents')
      .select('id,document_type,document_name,document_url,verified,provided_by,provided_at')
      .eq('project_id', projectId)
      .order('provided_at', { ascending: false })
    setDocuments((data as AdminDoc[]) || [])
  }, [])

  useEffect(() => { loadDocuments(selectedProjectId) }, [selectedProjectId, loadDocuments])

  async function toggleDocVerified(docId: string, verified: boolean) {
    await sb.from('developer_documents').update({
      verified,
      verified_at: verified ? new Date().toISOString() : null,
    }).eq('id', docId)
    await loadDocuments(selectedProjectId)
  }

  // ── Unit types ───────────────────────────────────────────────
  // This closes a real, pre-existing gap: nothing anywhere in the app —
  // not here, not the developer dashboard — ever let anyone add a unit
  // type. developer_unit_types only ever got populated by hand via SQL.
  // The public development page already reads and displays this table;
  // it just had no input side at all until now.
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([])
  const [newUnit, setNewUnit] = useState({ unit_type: '', price_ngn: '', quantity: '', size_sqm: '' })

  const loadUnitTypes = useCallback(async (projectId: string) => {
    if (!projectId) { setUnitTypes([]); return }
    const { data } = await sb.from('developer_unit_types')
      .select('id,unit_type,price_ngn,quantity,size_sqm')
      .eq('project_id', projectId)
      .order('price_ngn', { ascending: true, nullsFirst: true })
    setUnitTypes((data as UnitType[]) || [])
  }, [])

  useEffect(() => { loadUnitTypes(selectedProjectId) }, [selectedProjectId, loadUnitTypes])

  async function addUnitType() {
    if (!selectedProjectId) { flash('Select a development first', false); return }
    if (!newUnit.unit_type.trim()) { flash('Unit type name is required (e.g. "2 Bedroom")', false); return }

    // Deliberately allows price_ngn/size_sqm to be left blank — a real
    // early-stage development often has a confirmed unit mix before it
    // has confirmed pricing, and the schema needs to represent that
    // honestly rather than force a placeholder number.
    const { error } = await sb.from('developer_unit_types').insert({
      project_id: selectedProjectId,
      unit_type: newUnit.unit_type.trim(),
      price_ngn: newUnit.price_ngn ? parseFloat(newUnit.price_ngn) : null,
      quantity: newUnit.quantity ? parseInt(newUnit.quantity) : null,
      size_sqm: newUnit.size_sqm ? parseFloat(newUnit.size_sqm) : null,
    })

    if (error) { flash(`Error: ${error.message}`, false); return }
    flash('✓ Unit type added', true)
    setNewUnit({ unit_type: '', price_ngn: '', quantity: '', size_sqm: '' })
    await loadUnitTypes(selectedProjectId)
  }

  async function updateUnitTypeField(id: string, field: 'price_ngn' | 'quantity' | 'size_sqm', value: string) {
    const parsed = value === '' ? null : (field === 'quantity' ? parseInt(value) : parseFloat(value))
    await sb.from('developer_unit_types').update({ [field]: parsed }).eq('id', id)
    setUnitTypes(prev => prev.map(u => u.id === id ? { ...u, [field]: parsed } : u))
  }

  async function deleteUnitType(id: string) {
    await sb.from('developer_unit_types').delete().eq('id', id)
    setUnitTypes(prev => prev.filter(u => u.id !== id))
  }

  // ── Development evidence ────────────────────────────────────
  // The per-claim ledger — distinguishing developer claims from what
  // MANOP has actually confirmed, at the granularity a real submission
  // (e.g. The Lavender) actually needs. Previously there was nowhere to
  // record this except one freeform review-notes blob.
  const [evidenceRows, setEvidenceRows] = useState<EvidenceRow[]>([])
  const [newEvidence, setNewEvidence] = useState({
    category: 'other', claim: '', source: '', status: 'unknown', next_action: '',
  })

  const loadEvidence = useCallback(async (projectId: string) => {
    if (!projectId) { setEvidenceRows([]); return }
    const { data } = await sb.from('development_evidence')
      .select('id,category,claim,source,status,next_action,recorded_at')
      .eq('project_id', projectId)
      .order('recorded_at', { ascending: false })
    setEvidenceRows((data as EvidenceRow[]) || [])
  }, [])

  useEffect(() => { loadEvidence(selectedProjectId) }, [selectedProjectId, loadEvidence])

  async function addEvidence() {
    if (!selectedProjectId) { flash('Select a development first', false); return }
    if (!newEvidence.claim.trim()) { flash('Describe the claim or fact being recorded', false); return }

    const { error } = await sb.from('development_evidence').insert({
      project_id: selectedProjectId,
      category: newEvidence.category,
      claim: newEvidence.claim.trim(),
      source: newEvidence.source.trim() || null,
      status: newEvidence.status,
      next_action: newEvidence.next_action.trim() || null,
    })

    if (error) { flash(`Error: ${error.message}`, false); return }
    flash('✓ Evidence recorded', true)
    setNewEvidence({ category: 'other', claim: '', source: '', status: 'unknown', next_action: '' })
    await loadEvidence(selectedProjectId)
  }

  async function deleteEvidence(id: string) {
    await sb.from('development_evidence').delete().eq('id', id)
    setEvidenceRows(prev => prev.filter(e => e.id !== id))
  }

  // ── Construction updates — history, not a single overwritten field ──
  // developer_projects.stage/completion_pct still exist for the "current
  // state" summary shown elsewhere, but this is the actual timeline —
  // admin can post on behalf of unclaimed developers (no login exists to
  // post it themselves), which is the primary real-world case today.
  const [updateRows, setUpdateRows] = useState<UpdateRow[]>([])
  const [newUpdate, setNewUpdate] = useState({ title: '', body: '', stage_at_time: '', completion_pct_at_time: '' })

  const loadUpdates = useCallback(async (projectId: string) => {
    if (!projectId) { setUpdateRows([]); return }
    const { data } = await sb.from('development_updates')
      .select('id,title,body,stage_at_time,completion_pct_at_time,posted_by_role,verification_status,posted_at')
      .eq('project_id', projectId)
      .order('posted_at', { ascending: false })
    setUpdateRows((data as UpdateRow[]) || [])
  }, [])

  useEffect(() => { loadUpdates(selectedProjectId) }, [selectedProjectId, loadUpdates])

  async function addUpdate() {
    if (!selectedProjectId) { flash('Select a development first', false); return }
    if (!newUpdate.title.trim()) { flash('Give the update a short title', false); return }

    const { data: { user } } = await sb.auth.getUser()
    const { error } = await sb.from('development_updates').insert({
      project_id: selectedProjectId,
      title: newUpdate.title.trim(),
      body: newUpdate.body.trim() || null,
      stage_at_time: newUpdate.stage_at_time || null,
      completion_pct_at_time: newUpdate.completion_pct_at_time ? parseInt(newUpdate.completion_pct_at_time) : null,
      posted_by_role: 'admin',
      posted_by_user_id: user?.id || null,
      verification_status: 'manop_confirmed',
    })

    if (error) { flash(`Error: ${error.message}`, false); return }
    flash('✓ Update posted', true)
    setNewUpdate({ title: '', body: '', stage_at_time: '', completion_pct_at_time: '' })
    await loadUpdates(selectedProjectId)
  }

  async function deleteUpdate(id: string) {
    await sb.from('development_updates').delete().eq('id', id)
    setUpdateRows(prev => prev.filter(u => u.id !== id))
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

  if (checking) return <ManopLoader dark={dark} label="Loading admin panel…" />

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }}>
      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/admin" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, color: text2, fontSize: 12, fontWeight: 600, border: `1px solid ${border}`, borderRadius: 7, padding: '0.4rem 0.75rem' }}>
            ← Command Center
          </Link>
          <div>
            <div style={{ fontWeight: 700, color: text, fontSize: 14 }}>Admin · Reviewed Developments</div>
            <div style={{ fontSize: 11, color: text3 }}>Add developers &amp; projects — no developer login required</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {pending.length > 0 && (
            <button onClick={() => setShowPending(v => !v)} style={{ background: showPending ? accent : 'rgba(245,158,11,0.12)', color: showPending ? '#fff' : '#F59E0B', border: 'none', borderRadius: 7, padding: '0.4rem 0.75rem', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {pending.length} pending review
            </button>
          )}
          <div style={{ fontSize: 12, color: text3 }}>{user?.email}</div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}>

        {msg && (
          <div style={{ background: msg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${msg.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 8, padding: '0.65rem 0.875rem', fontSize: 13, color: msg.ok ? '#22C55E' : '#EF4444', marginBottom: 14 }}>
            {msg.text}
          </div>
        )}

        {/* ── Pending Review — every developer, always findable ──
             This is the fix for drafts feeling like they vanish: Step 2's
             dropdown only ever showed projects for whichever developer
             was selected, so a draft created under Developer A became
             invisible the moment you moved on to work on Developer B.
             This list spans everyone, always, regardless of what's
             selected below. */}
        {showPending && pending.length > 0 && (
          <div style={{ ...sectionStyle, borderColor: 'rgba(245,158,11,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Pending review · {pending.length}
              </div>
              <button onClick={() => setShowPending(false)} style={{ background: 'transparent', border: 'none', color: text3, cursor: 'pointer', fontSize: 12 }}>Hide</button>
            </div>
            {pending.map(p => (
              <div key={p.id} onClick={() => openPendingItem(p)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0', borderBottom: `1px solid ${border}`, cursor: 'pointer' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: text3 }}>
                    {p.developer_name || 'Unknown developer'} · {p.neighborhood}, {p.city}
                    {p.submitted_via === 'agency_submission' && (
                      <>
                        {' · via '}
                        <span style={{ fontWeight: 700, color: p.agency_verification_status === 'verified' ? teal : '#F59E0B' }}>
                          {p.agency_name || 'unverified agency'}
                        </span>
                        {p.agency_verification_status !== 'verified' && (
                          <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 700, color: '#F59E0B', background: 'rgba(245,158,11,0.12)', borderRadius: 20, padding: '1px 6px' }}>
                            not yet verified
                          </span>
                        )}
                      </>
                    )}
                    {p.submitted_via !== 'agency_submission' && ' · MANOP direct'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#F59E0B', background: 'rgba(245,158,11,0.12)', borderRadius: 20, padding: '3px 8px', textTransform: 'capitalize' }}>{p.publish_status.replace(/_/g, ' ')}</span>
                  <span style={{ fontSize: 11, color: teal, fontWeight: 700 }}>Continue →</span>
                </div>
              </div>
            ))}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: teal, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Step 2 · Development {selectedProjectId && <span style={{ color: text3, textTransform: 'none', letterSpacing: 'normal', fontWeight: 400 }}>· editing an existing one</span>}
              </div>
              {selectedProjectId && (
                <button onClick={() => setSelectedProjectId('')} style={{ ...btnSecondary, padding: '0.35rem 0.75rem', fontSize: 12 }}>
                  + Start new development
                </button>
              )}
            </div>

            {projects.length > 0 && (
              <>
                <label style={labelStyle}>Existing developments for this developer — select to edit</label>
                <select style={inputStyle} value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>
                  <option value="">— choose —</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.publish_status} · {p.reviewed_at ? 'reviewed' : 'not reviewed'} {p.submitted_via === 'agency_submission' ? '· via agency' : ''}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 12, color: text3, margin: '10px 0' }}>— or fill in the fields below to add a new one —</div>
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

            {selectedProjectId ? (
              <button style={btnPrimary} onClick={updateProject}>Save changes</button>
            ) : (
              <button style={btnPrimary} onClick={createProject}>Add development (draft)</button>
            )}
          </div>
        )}

        {/* ── Media — gallery, real Cloudinary uploads ────────── */}
        {selectedProjectId && (
          <div style={sectionStyle}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: teal, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
              Development media
            </div>
            <ImageUploader
              key={selectedProjectId}
              initialUrls={pendingImages}
              onImagesChange={setPendingImages}
              maxImages={15}
              dark={dark}
              label="Development & site images"
              hint="Cover image, gallery, and site photographs — first image is used as the cover"
            />
            <label style={{ ...labelStyle, marginTop: 14 }}>Video URLs (one per line)</label>
            <textarea
              style={{ ...inputStyle, minHeight: 60 }}
              value={videoUrlsText}
              onChange={e => setVideoUrlsText(e.target.value)}
              placeholder={'https://res.cloudinary.com/.../video1.mp4'}
            />
            <button style={btnPrimary} onClick={saveMedia}>Save gallery</button>
          </div>
        )}

        {/* ── Unit types — was missing entirely anywhere in the app ── */}
        {selectedProjectId && (
          <div style={sectionStyle}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: teal, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
              Unit types · {unitTypes.length}
            </div>

            {unitTypes.length === 0 ? (
              <div style={{ fontSize: 13, color: text3, marginBottom: 12 }}>No unit types recorded yet.</div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                {unitTypes.map(u => (
                  <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.7fr 0.9fr auto', gap: 8, alignItems: 'center', padding: '0.5rem 0', borderBottom: `1px solid ${border}` }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{u.unit_type}</div>
                    <input
                      style={{ ...inputStyle, marginBottom: 0 }}
                      type="number"
                      placeholder="Price (₦) — leave blank if not supplied"
                      defaultValue={u.price_ngn ?? ''}
                      onBlur={e => updateUnitTypeField(u.id, 'price_ngn', e.target.value)}
                    />
                    <input
                      style={{ ...inputStyle, marginBottom: 0 }}
                      type="number"
                      placeholder="Qty"
                      defaultValue={u.quantity ?? ''}
                      onBlur={e => updateUnitTypeField(u.id, 'quantity', e.target.value)}
                    />
                    <input
                      style={{ ...inputStyle, marginBottom: 0 }}
                      type="number"
                      placeholder="Size (sq.m)"
                      defaultValue={u.size_sqm ?? ''}
                      onBlur={e => updateUnitTypeField(u.id, 'size_sqm', e.target.value)}
                    />
                    <button onClick={() => deleteUnitType(u.id)} style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 16, padding: '0 6px' }}>×</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.7fr 0.9fr auto', gap: 8, alignItems: 'center' }}>
              <input style={{ ...inputStyle, marginBottom: 0 }} placeholder="e.g. 2 Bedroom" value={newUnit.unit_type} onChange={e => setNewUnit({ ...newUnit, unit_type: e.target.value })} />
              <input style={{ ...inputStyle, marginBottom: 0 }} type="number" placeholder="Price (₦)" value={newUnit.price_ngn} onChange={e => setNewUnit({ ...newUnit, price_ngn: e.target.value })} />
              <input style={{ ...inputStyle, marginBottom: 0 }} type="number" placeholder="Qty" value={newUnit.quantity} onChange={e => setNewUnit({ ...newUnit, quantity: e.target.value })} />
              <input style={{ ...inputStyle, marginBottom: 0 }} type="number" placeholder="Size (sq.m)" value={newUnit.size_sqm} onChange={e => setNewUnit({ ...newUnit, size_sqm: e.target.value })} />
              <button onClick={addUnitType} style={{ ...btnPrimary, padding: '0.55rem 0.8rem' }}>+ Add</button>
            </div>
            <div style={{ fontSize: 11, color: text3, marginTop: 8 }}>
              Price and size can be left blank if the developer hasn't supplied them yet — record the unit type as known and fill in pricing once it exists, rather than waiting to add the row at all.
            </div>
          </div>
        )}

        {/* ── Construction updates — the actual timeline ─────── */}
        {selectedProjectId && (
          <div style={sectionStyle}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: teal, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
              Construction updates · {updateRows.length}
            </div>

            {updateRows.length === 0 ? (
              <div style={{ fontSize: 13, color: text3, marginBottom: 12 }}>No updates posted yet.</div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                {updateRows.map(u => (
                  <div key={u.id} style={{ padding: '0.6rem 0', borderBottom: `1px solid ${border}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{u.title}</div>
                        {u.body && <div style={{ fontSize: 12.5, color: text2, marginTop: 2 }}>{u.body}</div>}
                        <div style={{ fontSize: 11, color: text3, marginTop: 3 }}>
                          {new Date(u.posted_at).toLocaleDateString()} · Posted by {u.posted_by_role}
                          {u.stage_at_time ? ` · ${u.stage_at_time}` : ''}
                          {u.completion_pct_at_time != null ? ` · ${u.completion_pct_at_time}% complete` : ''}
                        </div>
                      </div>
                      <button onClick={() => deleteUpdate(u.id)} style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 15 }}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <label style={labelStyle}>Update title</label>
            <input style={inputStyle} placeholder="e.g. Roofing complete" value={newUpdate.title} onChange={e => setNewUpdate({ ...newUpdate, title: e.target.value })} />

            <label style={labelStyle}>Details (optional)</label>
            <textarea style={{ ...inputStyle, minHeight: 50 }} value={newUpdate.body} onChange={e => setNewUpdate({ ...newUpdate, body: e.target.value })} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Stage at this update</label>
                <select style={inputStyle} value={newUpdate.stage_at_time} onChange={e => setNewUpdate({ ...newUpdate, stage_at_time: e.target.value })}>
                  <option value="">—</option>
                  {['Planning', 'Foundation', 'Structure', 'Finishing', 'Completed'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Completion % at this update</label>
                <input style={inputStyle} type="number" min={0} max={100} value={newUpdate.completion_pct_at_time} onChange={e => setNewUpdate({ ...newUpdate, completion_pct_at_time: e.target.value })} />
              </div>
            </div>

            <button style={btnPrimary} onClick={addUpdate}>+ Post update</button>
            <div style={{ fontSize: 11, color: text3, marginTop: 8 }}>
              Posted by admin, this is recorded as MANOP-confirmed — appropriate for unclaimed developers where there's no one else to post on their behalf. A developer or agency posting their own update is recorded as their own report, not MANOP's.
            </div>
          </div>
        )}

        {/* ── Submitted documents — exactly as the agency/developer
             attached them, not a summary. Previously invisible here:
             admin had no way to see mandate letters, land titles,
             surveys, etc. even though they were saved the moment the
             submission came in. ──────────────────────────────────── */}
        {selectedProjectId && (
          <div style={sectionStyle}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: teal, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
              Submitted documents · {documents.length}
            </div>
            {documents.length === 0 ? (
              <div style={{ fontSize: 13, color: text3 }}>No documents attached to this submission yet.</div>
            ) : (
              documents.map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0', borderBottom: `1px solid ${border}` }}>
                  <div>
                    <a href={d.document_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13.5, fontWeight: 600, color: text, textDecoration: 'none' }}>
                      {d.document_name} ↗
                    </a>
                    <div style={{ fontSize: 11, color: text3, marginTop: 2, textTransform: 'capitalize' }}>
                      {d.document_type.replace(/_/g, ' ')} · provided by {d.provided_by || 'unknown'} · {new Date(d.provided_at).toLocaleDateString()}
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: d.verified ? teal : text3, cursor: 'pointer', flexShrink: 0 }}>
                    <input type="checkbox" checked={d.verified} onChange={e => toggleDocVerified(d.id, e.target.checked)} />
                    {d.verified ? 'Independently confirmed' : 'Provided, not yet confirmed'}
                  </label>
                </div>
              ))
            )}
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

        {/* ── Development evidence register ───────────────────
             Per-claim ledger — distinguishes developer claims from what
             MANOP has actually confirmed. Feeds the public Dossier's
             "What MANOP knows" section once one exists (see the
             development detail page). ──────────────────────────── */}
        {selectedProjectId && (
          <div style={sectionStyle}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: teal, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
              Evidence register · {evidenceRows.length}
            </div>

            {evidenceRows.length === 0 ? (
              <div style={{ fontSize: 13, color: text3, marginBottom: 12 }}>No individual claims recorded yet — the notes below stay as one summary until specific facts are logged here.</div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                {evidenceRows.map(e => (
                  <div key={e.id} style={{ padding: '0.65rem 0', borderBottom: `1px solid ${border}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            {e.category.replace(/_/g, ' ')}
                          </span>
                          <span style={{
                            fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                            color: EVIDENCE_STATUS_COLOR[e.status] || text3,
                            background: `${EVIDENCE_STATUS_COLOR[e.status] || text3}22`,
                            borderRadius: 10, padding: '1px 7px',
                          }}>
                            {e.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div style={{ fontSize: 13.5, color: text }}>{e.claim}</div>
                        {e.source && <div style={{ fontSize: 11, color: text3, marginTop: 2 }}>Source: {e.source}</div>}
                        {e.next_action && <div style={{ fontSize: 11, color: '#F59E0B', marginTop: 2 }}>Next: {e.next_action}</div>}
                      </div>
                      <button onClick={() => deleteEvidence(e.id)} style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 15, flexShrink: 0 }}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <label style={labelStyle}>Category</label>
            <select style={inputStyle} value={newEvidence.category} onChange={e => setNewEvidence({ ...newEvidence, category: e.target.value })}>
              {EVIDENCE_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select>

            <label style={labelStyle}>Claim / fact</label>
            <textarea style={{ ...inputStyle, minHeight: 50 }} placeholder="e.g. Developer states 24-hour power supply." value={newEvidence.claim} onChange={e => setNewEvidence({ ...newEvidence, claim: e.target.value })} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Source</label>
                <input style={inputStyle} placeholder="e.g. Developer brochure" value={newEvidence.source} onChange={e => setNewEvidence({ ...newEvidence, source: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <select style={inputStyle} value={newEvidence.status} onChange={e => setNewEvidence({ ...newEvidence, status: e.target.value })}>
                  {EVIDENCE_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            </div>

            <label style={labelStyle}>What would move this forward (optional)</label>
            <input style={inputStyle} placeholder="e.g. Obtain planning approval documentation" value={newEvidence.next_action} onChange={e => setNewEvidence({ ...newEvidence, next_action: e.target.value })} />

            <button style={btnPrimary} onClick={addEvidence}>+ Record evidence</button>
          </div>
        )}

        {/* ── Step 3: Review + publish ──────────────────────── */}
        {selectedProjectId && (() => {
          const current = currentProject()
          const isReviewed = !!current?.reviewed_at
          return (
            <div style={sectionStyle}>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: teal, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
                Step 3 · MANOP review — required before publishing
              </div>

              <div style={{
                display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '0.3rem 0.65rem',
                borderRadius: 6, marginBottom: 12,
                color:      isReviewed ? '#0D9488' : '#F59E0B',
                background: isReviewed ? 'rgba(13,148,136,0.12)' : 'rgba(245,158,11,0.12)',
              }}>
                {isReviewed
                  ? `✓ Reviewed · ${new Date(current!.reviewed_at as string).toLocaleDateString()}`
                  : 'Not yet reviewed'}
              </div>

              <label style={labelStyle}>What we checked</label>
              <textarea style={{ ...inputStyle, minHeight: 60 }} value={reviewForm.manop_checked_note} onChange={e => setReviewForm({ ...reviewForm, manop_checked_note: e.target.value })} />

              <label style={labelStyle}>Identified considerations (or state that none were found)</label>
              <textarea style={{ ...inputStyle, minHeight: 60 }} value={reviewForm.manop_flag_note} onChange={e => setReviewForm({ ...reviewForm, manop_flag_note: e.target.value })} />

              <div style={{ fontSize: 11, color: text3, margin: '2px 0 12px' }}>
                MANOP does not issue recommendations. Marking a development as reviewed means MANOP
                has checked the information provided and recorded what it found — not that MANOP
                endorses a purchase decision.
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
                <button style={btnSecondary} onClick={saveNotes}>Save notes</button>
                <button style={btnSecondary} onClick={saveAsPendingReview}>Save as pending review</button>
                <button style={btnPrimary} onClick={markAsReviewed}>Mark as reviewed</button>
                <button
                  style={{ ...btnPrimary, opacity: isReviewed ? 1 : 0.4, cursor: isReviewed ? 'pointer' : 'not-allowed' }}
                  onClick={publishDevelopment}
                  disabled={!isReviewed}
                >
                  Publish
                </button>
              </div>

              {!isReviewed && (
                <div style={{ fontSize: 11, color: '#F59E0B', marginTop: 8 }}>
                  Publishing is blocked until this development is marked as reviewed.
                </div>
              )}
            </div>
          )
        })()}

      </div>
    </div>
  )
}