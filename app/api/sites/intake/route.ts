// app/api/sites/intake/route.ts
//
// Handles blueprint steps 1-4 (Identify → Capture → Create the
// Spatial Object → Survey Plan) as one submission. Deliberately
// does NOT auto-transform coordinates or mark anything "verified" —
// this route only ever produces a `draft` or `pending_review` site;
// review, CRS confirmation, and evidence-status changes all happen
// in the admin review flow (not built here — see the workflow doc).
//
// Follows the existing codebase's convention (seen throughout the
// repomix export): a plain supabase-js client using the publishable
// key, relying on RLS rather than a service-role bypass. If the
// request carries a user session, we forward it so auth.uid() only
// resolves for signed-in developers/agencies claiming their own site
// — everyone else falls through the `auth.uid() IS NULL` insert path
// already defined in the migration.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logSiteSignal } from '../../../../lib/log-site-signal'
import { notifyAdminOfSiteSubmission } from '../../../../lib/notify-admin'

interface BoundaryPoint { label: string; x: number; y: number }

interface IntakePayload {
  // ── Step 1: Identify ──────────────────────────────────────
  opportunity_type: string
  entry_source: 'landowner' | 'agency_submission' | 'developer_self' | 'manop_sourced'

  // ── Step 2: Capture ───────────────────────────────────────
  name_hint?: string               // working name, not stored as a column — folded into address_description if no better location text exists
  country_code: string
  state?: string
  city: string
  neighborhood?: string
  address_description?: string
  transaction_structure?: 'outright_sale' | 'jv' | 'lease' | 'development_partnership'
  asking_price?: number
  asking_price_currency?: string
  area_sqm?: number
  area_source?: string

  // Submission identity (one of these, matching entry_source)
  developer_id?: string
  submitting_agency_id?: string
  landowner_name?: string
  landowner_contact?: string
  mandate_document_url?: string

  // ── Step 3: Spatial object ────────────────────────────────
  lat?: number
  lng?: number
  raw_boundary_points?: BoundaryPoint[]   // beacon coordinates as submitted, in source CRS
  coordinate_source?: string
  coordinate_reference_system?: string
  coordinate_format?: string

  // ── Step 4: Documents (already uploaded to Cloudinary via
  // ImageUploader — this route only records the references) ──
  documents?: { document_type: string; document_name: string; document_url: string }[]

  // ── Consent ────────────────────────────────────────────────
  consent_confirmed?: boolean
}

const REQUIRED_FIELDS: (keyof IntakePayload)[] = ['opportunity_type', 'entry_source', 'country_code', 'city']

export async function POST(req: NextRequest) {
  const body = (await req.json()) as IntakePayload

  const missing = REQUIRED_FIELDS.filter((f) => !body[f])
  if (missing.length > 0) {
    return NextResponse.json({ error: `Missing required field(s): ${missing.join(', ')}` }, { status: 400 })
  }

  if (!body.consent_confirmed) {
    return NextResponse.json({ error: 'Consent confirmation is required to submit a site.' }, { status: 400 })
  }

  if (body.entry_source === 'agency_submission') {
    const hasMandate = !!body.mandate_document_url
      || (body.documents || []).some((d) => d.document_type === 'allocation')
    if (!hasMandate) {
      return NextResponse.json(
        { error: 'Agency submissions require mandate evidence — a mandate document URL or an allocation document.' },
        { status: 400 },
      )
    }
  }

  const authHeader = req.headers.get('authorization')
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    authHeader ? { global: { headers: { Authorization: authHeader } } } : undefined,
  )

  // Coordinates: never assume a CRS. If raw beacon points were
  // submitted without an explicit CRS, crs_status stays at its
  // default 'requires_verification' — the DB default already
  // encodes this, so we simply don't set it here.
  const hasCoordinates = body.lat != null && body.lng != null
  const hasRawBoundary = Array.isArray(body.raw_boundary_points) && body.raw_boundary_points.length > 0

  // Capture the actual logged-in user, if any — separate from
  // developer_id/submitting_agency_id, which identify the ENTITY, not
  // the PERSON who filled out this form. A landowner or MANOP-sourced
  // entry may have no entity link at all, but if someone is logged in,
  // this is what makes the submission traceable to them.
  const { data: { user } } = await sb.auth.getUser()

  const { data: site, error: siteError } = await sb
    .from('sites')
    .insert({
      country_code: body.country_code,
      state: body.state ?? null,
      city: body.city,
      neighborhood: body.neighborhood ?? null,
      address_description: body.address_description ?? body.name_hint ?? null,
      opportunity_type: body.opportunity_type,
      transaction_structure: body.transaction_structure ?? null,
      asking_price: body.asking_price ?? null,
      asking_price_currency: body.asking_price_currency ?? 'NGN',
      area_sqm: body.area_sqm ?? null,
      area_source: body.area_source ?? null,
      entry_source: body.entry_source,
      developer_id: body.developer_id ?? null,
      submitting_agency_id: body.submitting_agency_id ?? null,
      submitted_by_user_id: user?.id ?? null,
      landowner_name: body.landowner_name ?? null,
      landowner_contact: body.landowner_contact ?? null,
      mandate_document_url: body.mandate_document_url ?? null,
      lat: hasCoordinates ? body.lat : null,
      lng: hasCoordinates ? body.lng : null,
      raw_boundary_points: hasRawBoundary ? body.raw_boundary_points : null,
      coordinate_source: body.coordinate_source ?? null,
      coordinate_reference_system: body.coordinate_reference_system ?? null,
      coordinate_format: body.coordinate_format ?? null,
      submitter_consent_confirmed: !!body.consent_confirmed,
      submitter_consent_confirmed_at: body.consent_confirmed ? new Date().toISOString() : null,
      // entry_source drives the starting workflow state: a MANOP-
      // sourced or developer-self site can start in draft; an agency
      // submission goes straight to pending_review since it already
      // arrives under a mandate and is meant for the review queue.
      site_status: body.entry_source === 'agency_submission' ? 'pending_review' : 'draft',
    })
    .select()
    .single()

  if (siteError || !site) {
    return NextResponse.json({ error: siteError?.message || 'Could not create site' }, { status: 500 })
  }

  await logSiteSignal(sb, 'site_submitted', {
    siteId: site.id, city: body.city, neighborhood: body.neighborhood, countryCode: body.country_code,
  })

  // Notify staff whenever the site is actually sitting in the review
  // queue, not for a bare draft that hasn't been submitted for review yet.
  if (site.site_status === 'pending_review') {
    await notifyAdminOfSiteSubmission({
      siteId: site.id, city: body.city, neighborhood: body.neighborhood,
      entrySource: body.entry_source, isAgencySubmission: body.entry_source === 'agency_submission',
    })
  }

  // Record documents against the shared developer_documents table
  if (body.documents && body.documents.length > 0) {
    const rows = body.documents.map((d) => ({
      site_id: site.id,
      document_type: d.document_type,
      document_name: d.document_name,
      document_url: d.document_url,
      status: 'provided',
      provided_by: body.entry_source,
    }))
    const { error: docError } = await sb.from('developer_documents').insert(rows)
    if (docError) {
      // Site already exists — surface the doc failure without rolling
      // back the site, so the submitter doesn't lose their progress.
      return NextResponse.json(
        { site, warning: `Site created, but documents failed to save: ${docError.message}` },
        { status: 207 },
      )
    }
  }

  // Auto-seed the standard investigation checklist. These are the
  // gaps every new site has by construction, not a judgment call —
  // the admin review flow resolves/removes items as evidence comes in.
  const standardItems: string[] = []
  if (!hasCoordinates) standardItems.push('Capture site coordinates')
  if (hasRawBoundary && !body.coordinate_reference_system) {
    standardItems.push('Confirm coordinate reference system with a licensed surveyor before deriving a boundary polygon')
  }
  if (!body.area_sqm) standardItems.push('Confirm site area from a survey plan or title document')
  if (!(body.documents || []).some((d) => d.document_type === 'survey')) {
    standardItems.push('Obtain survey plan')
  }
  if (body.entry_source !== 'manop_sourced' && !(body.documents || []).some((d) => d.document_type === 'land_title' || d.document_type === 'deed')) {
    standardItems.push('Obtain title/ownership evidence')
  }

  if (standardItems.length > 0) {
    await sb.from('investigation_items').insert(
      standardItems.map((label) => ({ site_id: site.id, label, raised_by: 'system' })),
    )
  }

  return NextResponse.json({ site }, { status: 201 })
}