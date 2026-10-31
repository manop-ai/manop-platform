// lib/developer-project.ts
//
// Pure rules for a developer creating, editing and submitting their own development.
// Used by app/api/developer/projects (server) and components/DeveloperProjectForm (client),
// so the form can never offer something the server will refuse.
//
// What a developer can and cannot do:
//   - save a DRAFT with only a name and a location;
//   - edit it while it is still a draft;
//   - SUBMIT it for MANOP review (draft -> pending_review) once it carries the minimum MANOP
//     needs to review it;
//   - never publish. 'published' (and 'rejected') are set only by MANOP's own review pages.
// Optional fields (units, price, handover, description) never become mandatory just to save.

export const DEV_STAGES = ['Planning', 'Foundation', 'Structure', 'Finishing', 'Completed'] as const

/** Statuses a developer may edit from the dashboard. Anything MANOP has taken up is read-only here. */
export const EDITABLE_STATUSES = ['draft'] as const
export const canEditProject = (publishStatus: string | null | undefined) =>
  (EDITABLE_STATUSES as readonly string[]).includes(publishStatus ?? '')

export interface UnitInput {
  unit_type: string
  price_ngn?: string | number | null
  size_sqm?: string | number | null
  available_count?: string | number | null
  deposit_pct?: string | number | null
  installment_months?: string | number | null
}

export interface ProjectInput {
  name: string
  neighborhood: string
  city?: string
  state?: string
  country_code?: string
  stage?: string
  total_units?: string | number | null
  handover_date?: string | null
  description?: string | null
}

export interface CleanProject {
  name: string
  location: string
  neighborhood: string
  city: string | null
  state: string | null
  country_code: string
  stage: string
  total_units: number | null
  handover_date: string | null
  description: string | null
}

export interface CleanUnit {
  unit_type: string
  price_ngn: number | null          // absent stays null: never 0, never another unit's price
  size_sqm: number | null
  available_count: number | null
  deposit_pct: number | null
  installment_months: number | null
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const positive = (v: unknown) => { const n = num(v); return n != null && n > 0 ? n : null }
const wholeNonNeg = (v: unknown) => { const n = num(v); return n != null && n >= 0 ? Math.floor(n) : null }

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string }

/** A draft needs only a name and a location (neighbourhood). Everything else is optional. */
export function cleanDraft(input: ProjectInput): Checked<CleanProject> {
  const name = (input.name ?? '').trim()
  const neighborhood = (input.neighborhood ?? '').trim()
  if (!name) return { ok: false, error: 'Development name is required.' }
  if (!neighborhood) return { ok: false, error: 'Location is required: enter the neighbourhood or area.' }
  if (name.length > 160) return { ok: false, error: 'Development name is too long.' }
  const city = (input.city ?? '').trim() || null
  const stage = (DEV_STAGES as readonly string[]).includes(input.stage ?? '') ? (input.stage as string) : 'Foundation'
  const totalRaw = num(input.total_units)
  if (input.total_units !== undefined && input.total_units !== null && input.total_units !== '' && (totalRaw == null || totalRaw < 1 || !Number.isInteger(totalRaw))) {
    return { ok: false, error: 'Total units must be a whole number of 1 or more, or left blank (for example, land).' }
  }
  const handover = (input.handover_date ?? '').toString().trim()
  if (handover && Number.isNaN(Date.parse(handover))) return { ok: false, error: 'Handover date is not a valid date.' }
  return {
    ok: true,
    value: {
      name, neighborhood, city,
      location: [neighborhood, city].filter(Boolean).join(', '),
      state: (input.state ?? '').trim() || null,
      country_code: (input.country_code ?? 'NG').trim().toUpperCase().slice(0, 2) || 'NG',
      stage,
      total_units: totalRaw,
      handover_date: handover || null,
      description: (input.description ?? '').toString().trim() || null,
    },
  }
}

/** What MANOP needs before it can review: a city as well, and at least a description or one unit type. */
export function validateSubmit(p: CleanProject, unitCount: number): string | null {
  if (!p.city) return 'City is required before submitting for review.'
  if (!p.description && unitCount === 0) return 'Add a short description or at least one unit type so MANOP has something to review.'
  return null
}

/** Rows with no unit name are ignored. Prices are optional; an empty price is stored as null, not 0. */
export function cleanUnits(rows: UnitInput[] | undefined): Checked<CleanUnit[]> {
  const out: CleanUnit[] = []
  for (const r of rows ?? []) {
    const unit_type = (r.unit_type ?? '').trim()
    if (!unit_type) continue
    const priceRaw = r.price_ngn
    if (priceRaw !== undefined && priceRaw !== null && priceRaw !== '' && positive(priceRaw) == null) {
      return { ok: false, error: `The price for "${unit_type}" must be a positive amount, or left blank if not yet confirmed.` }
    }
    const dep = num(r.deposit_pct)
    if (dep != null && (dep < 0 || dep > 100)) return { ok: false, error: `The deposit for "${unit_type}" must be between 0 and 100 percent.` }
    out.push({
      unit_type,
      price_ngn: positive(priceRaw),
      size_sqm: positive(r.size_sqm),
      available_count: wholeNonNeg(r.available_count),
      deposit_pct: dep,
      installment_months: positive(r.installment_months) != null ? Math.floor(positive(r.installment_months)!) : null,
    })
  }
  if (out.length > 40) return { ok: false, error: 'Too many unit types in one submission.' }
  return { ok: true, value: out }
}

/** The only transitions the developer route performs. Publishing is never one of them. */
export function nextStatus(action: 'save' | 'submit', current: string | null): { ok: true; status: 'draft' | 'pending_review' } | { ok: false; error: string } {
  if (current !== null && !canEditProject(current)) {
    return { ok: false, error: current === 'pending_review' ? 'This development is already with MANOP for review and cannot be edited here.' : 'This development can no longer be edited from the developer dashboard.' }
  }
  return { ok: true, status: action === 'submit' ? 'pending_review' : 'draft' }
}
