// lib/development-standard.ts
//
// THE intake standard: what a complete MANOP development record contains.
// One definition, used by the admin Add page, the review queue, the developer
// dashboard and the agency dashboard, so every route in is held to the same bar.
//
// Uses ONLY existing structures: developer_projects columns, developer_unit_types,
// developer_documents.document_type, development_updates, development_evidence
// (category + status) and development_comparables. No new schema.
//
// Two tiers, on purpose:
//   'submitter' — what an agency, developer or admin supplies as information.
//   'manop'     — what MANOP records in the evidence register while reviewing.
// This is advisory (it shows what is missing); it never blocks a save.

export type ItemState = 'ok' | 'partial' | 'missing'
export type Tier = 'submitter' | 'manop'

export interface StandardItem {
  key: string
  group: string
  tier: Tier
  required: boolean
  label: string
  /** what to provide when it is not ok */
  hint: string
  state: ItemState
  detail?: string
}

export interface StandardInput {
  project: {
    name?: string | null; neighborhood?: string | null; city?: string | null; stage?: string | null
    total_units?: number | null; handover_date?: string | null; description?: string | null
    images?: string[] | null; submitting_agency_id?: string | null; mandate_document_url?: string | null
  }
  units: { size_sqm: number | null }[]
  docs: { document_type: string; document_name: string }[]
  /** null = the viewer cannot read the evidence register; manop tier is then omitted */
  evidence: { category: string; status: string }[] | null
  updatesCount: number | null
  comparablesCount: number | null
}

// Categories mirror development_evidence.category exactly.
export const EVIDENCE_CATEGORY_STANDARD: { key: string; label: string; required: boolean; hint: string }[] = [
  { key: 'identity',               label: 'Identity (name, address, developer)', required: true,  hint: 'Record the development name, exact address and developer, and where each came from.' },
  { key: 'site',                   label: 'Site (area, boundaries)',             required: true,  hint: 'Record site area and any survey or coordinates available.' },
  { key: 'unit_mix',               label: 'Unit mix',                            required: true,  hint: 'Record the unit types and counts, and note any source conflicts.' },
  { key: 'construction',           label: 'Construction status',                 required: true,  hint: 'Record the current stage with a dated source.' },
  { key: 'pricing',                label: 'Pricing',                             required: true,  hint: 'Record the price list, or record that it was not supplied.' },
  { key: 'payment_plan',           label: 'Payment plan',                        required: true,  hint: 'Record the deposit and instalment terms, or that they are unknown.' },
  { key: 'planning',               label: 'Planning / approvals',                required: true,  hint: 'Record planning approval status and reference, or that it is unknown.' },
  { key: 'title',                  label: 'Land title',                          required: true,  hint: 'Record title evidence status. Needs professional/legal review before any claim.' },
  { key: 'floor_configuration',    label: 'Floor configuration',                 required: false, hint: 'Record floor count and any conflicting descriptions.' },
  { key: 'amenities',              label: 'Amenities',                           required: false, hint: 'Record amenities, separating plan-supported from claimed.' },
  { key: 'architectural_design',   label: 'Architectural design',                required: false, hint: 'Record design and finishing claims.' },
  { key: 'location_positioning',   label: 'Location claims',                     required: false, hint: 'Record proximity and positioning claims as claims.' },
  { key: 'service_charge',         label: 'Service charge',                      required: false, hint: 'Record service charge and what it covers, or that it is unknown.' },
  { key: 'parking',                label: 'Parking',                             required: false, hint: 'Record parking count and allocation.' },
  { key: 'power_water',            label: 'Power and water',                     required: false, hint: 'Record supply arrangements behind any 24-hour claims.' },
  { key: 'market_context',         label: 'Market context',                      required: false, hint: 'Record comparable evidence for the area.' },
  { key: 'rental_yield',           label: 'Rental yield',                        required: false, hint: 'Record any yield claim and its basis.' },
  { key: 'developer_track_record', label: 'Developer track record',              required: false, hint: 'Record delivered projects and how they were checked.' },
  { key: 'consultant_professional',label: 'Consultants / professionals',         required: false, hint: 'Record named consultants and their stated role.' },
]

// Strong enough to count as "evidenced" rather than merely mentioned.
const EVIDENCED = new Set(['documented', 'manop_observed', 'manop_derived', 'independently_verified', 'professional_opinion'])

export const DOCUMENT_STANDARD: { type: string; label: string; required: boolean }[] = [
  { type: 'land_title',        label: 'Land title document',   required: true },
  { type: 'planning_approval', label: 'Planning approval',     required: true },
  { type: 'survey',            label: 'Survey plan',           required: false },
  { type: 'building_approval', label: 'Building approval',     required: false },
  { type: 'cac',               label: 'Developer CAC document',required: false },
]

const has = (v: string | null | undefined) => !!v && v.trim().length > 0

export function evaluateStandard(i: StandardInput): StandardItem[] {
  const p = i.project
  const out: StandardItem[] = []
  const add = (x: Omit<StandardItem, 'state'> & { ok: boolean; partial?: boolean }) => {
    const { ok, partial, ...rest } = x
    out.push({ ...rest, state: ok ? 'ok' : partial ? 'partial' : 'missing' })
  }

  // ── Basics
  add({ key: 'name', group: 'Basics', tier: 'submitter', required: true, label: 'Development name', hint: 'Give the development its name.', ok: has(p.name) })
  add({ key: 'location', group: 'Basics', tier: 'submitter', required: true, label: 'Neighbourhood and city', hint: 'Both are needed so the development appears in the right area.', ok: has(p.neighborhood) && has(p.city), partial: has(p.neighborhood) || has(p.city) })
  add({ key: 'stage', group: 'Basics', tier: 'submitter', required: true, label: 'Construction stage', hint: 'Choose the current stage.', ok: has(p.stage) })
  add({ key: 'total_units', group: 'Basics', tier: 'submitter', required: true, label: 'Total units', hint: 'Enter the total number of units.', ok: (p.total_units ?? 0) > 0 })
  add({ key: 'handover', group: 'Basics', tier: 'submitter', required: false, label: 'Expected handover date', hint: 'Add the stated handover date, even if provisional.', ok: has(p.handover_date) })
  add({ key: 'description', group: 'Basics', tier: 'submitter', required: false, label: 'Description', hint: 'A short factual description. Keep unverified claims for the evidence register.', ok: has(p.description) })

  // ── Units
  const n = i.units.length
  add({ key: 'units', group: 'Units', tier: 'submitter', required: true, label: 'At least one unit type', hint: 'Add each unit type. Price can be left blank if it has not been supplied.', ok: n > 0 })
  const sized = i.units.filter(u => u.size_sqm != null).length
  add({ key: 'unit_sizes', group: 'Units', tier: 'submitter', required: false, label: 'Unit sizes', hint: 'Add the size in sq.m. for each unit type.', ok: n > 0 && sized === n, partial: sized > 0, detail: n ? `${sized} of ${n} have a size` : undefined })

  // ── Media
  const imgs = p.images?.length ?? 0
  add({ key: 'photos', group: 'Media', tier: 'submitter', required: true, label: 'At least one photo or render', hint: 'Upload site photos or renders.', ok: imgs > 0, detail: imgs ? `${imgs} uploaded` : undefined })

  // ── Documents
  for (const d of DOCUMENT_STANDARD) {
    const ok = i.docs.some(x => x.document_type === d.type)
    add({ key: `doc_${d.type}`, group: 'Documents', tier: 'submitter', required: d.required, label: d.label, hint: `Upload the ${d.label.toLowerCase()}. If it does not exist yet, say so in the description.`, ok })
  }
  if (p.submitting_agency_id) {
    add({ key: 'mandate', group: 'Documents', tier: 'submitter', required: true, label: 'Agency mandate letter', hint: 'Agencies must provide the mandate letter.', ok: has(p.mandate_document_url) || i.docs.some(x => /mandate/i.test(x.document_name)) })
  }

  // ── Construction history
  if (i.updatesCount !== null) {
    add({ key: 'first_update', group: 'Construction', tier: 'submitter', required: false, label: 'First construction update', hint: 'Post a dated progress update with photos.', ok: i.updatesCount > 0, detail: i.updatesCount ? `${i.updatesCount} posted` : undefined })
  }

  // ── Evidence register (MANOP records this)
  if (i.evidence !== null) {
    for (const c of EVIDENCE_CATEGORY_STANDARD) {
      const rows = i.evidence.filter(e => e.category === c.key)
      const evidenced = rows.some(r => EVIDENCED.has(r.status))
      add({
        key: `ev_${c.key}`, group: 'Evidence register', tier: 'manop', required: c.required, label: c.label,
        hint: c.hint, ok: evidenced, partial: rows.length > 0,
        detail: rows.length ? (evidenced ? `${rows.length} recorded` : `${rows.length} recorded, none evidenced yet`) : undefined,
      })
    }
  }
  if (i.comparablesCount !== null) {
    add({ key: 'comparables', group: 'Market context', tier: 'manop', required: false, label: 'Comparables recorded for this area', hint: 'Record comparable developments in Comparables so price context can be shown.', ok: i.comparablesCount > 0, detail: i.comparablesCount ? `${i.comparablesCount} recorded` : undefined })
  }
  return out
}

export function summarise(items: StandardItem[], tier?: Tier) {
  const scope = tier ? items.filter(i => i.tier === tier) : items
  const req = scope.filter(i => i.required)
  return {
    requiredTotal: req.length,
    requiredOk: req.filter(i => i.state === 'ok').length,
    requiredMissing: req.filter(i => i.state !== 'ok').length,
    recommendedMissing: scope.filter(i => !i.required && i.state === 'missing').length,
  }
}