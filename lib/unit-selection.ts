// lib/unit-selection.ts
//
// Pure rules for "which unit is the buyer asking about, and what do we know
// about its price and availability right now". Used by the Get Financed modal,
// the enquiry modal, the intake route (server) and the Deal Room display, so all
// of them describe a unit the same way. No imports: safe in client and server.
//
// Principles
//   - The buyer picks the unit. Nothing here ever defaults to "the first unit".
//   - A unit's price comes from that unit's own record. A missing price stays
//     missing: it is never zero, never another unit's price.
//   - A recorded price is the developer's or agency's stated asking price at a
//     point in time. It is described as recorded, and as needing confirmation
//     unless it was confirmed recently.
//   - Availability that is not recorded is "not confirmed", never "available".
//   - What the request captured is a SNAPSHOT: later price edits do not rewrite it.

/** Same window the Buyer Pack uses (lib/buyer-pack.ts PRICE_STALE_DAYS). Kept here so client code need not import the PDF module. */
export const PRICE_STALE_DAYS = 90
const MS_DAY = 86_400_000

export const REQUEST_PURPOSES = ['explore_financing', 'confirm_price_availability', 'financing_and_price'] as const
export type RequestPurpose = (typeof REQUEST_PURPOSES)[number]

export const PURPOSE_LABEL: Record<RequestPurpose, string> = {
  explore_financing: 'Explore financing options',
  confirm_price_availability: 'Confirm price and availability',
  financing_and_price: 'Financing information and price/availability confirmation',
}

export const FINANCING_TYPE_KEYS = ['mortgage', 'nhf', 'developer_plan', 'diaspora_remittance'] as const
export type FinancingTypeKey = (typeof FINANCING_TYPE_KEYS)[number]

export const FINANCING_TYPE_LABEL: Record<FinancingTypeKey, string> = {
  mortgage: 'Mortgage loan',
  nhf: 'NHF / Federal mortgage',
  developer_plan: 'Developer installment plan',
  diaspora_remittance: 'Diaspora financing',
}

export const purposeNeedsFinancing = (p: RequestPurpose) => p !== 'confirm_price_availability'
export const purposeNeedsPrice = purposeNeedsFinancing

export type PriceStatus =
  | 'not_supplied'
  | 'currency_unconfirmed'
  | 'no_confirmation_date'
  | 'not_recently_confirmed'
  | 'recently_confirmed'

export const PRICE_STATUSES: PriceStatus[] = ['not_supplied', 'currency_unconfirmed', 'no_confirmation_date', 'not_recently_confirmed', 'recently_confirmed']

/** The fields of developer_unit_types this module reads. */
export interface UnitRow {
  id: string
  unit_type: string | null
  price_ngn?: number | string | null
  price_usd?: number | string | null
  currency_code?: string | null
  size_sqm?: number | string | null
  available_count?: number | null
  deposit_pct?: number | string | null
  installment_months?: number | string | null
  last_price_verified_at?: string | null
}

export interface UnitView {
  id: string
  label: string
  sizeSqm: number | null
  priceNgn: number | null          // set only when the recorded currency is NGN
  priceUsd: number | null
  currency: string | null
  priceStatus: PriceStatus
  requiresConfirmation: boolean    // true for everything except a recently confirmed price
  priceNote: string
  availableCount: number | null
  availabilityNote: string
  canAssessFinancing: boolean      // a usable NGN price exists
  depositPct: number | null
  installmentMonths: number | null
  lastPriceVerifiedAt: string | null
}

function positive(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null   // 0 and negatives are not prices
}

export function formatNaira(n: number): string {
  return `₦${Math.round(n).toLocaleString('en-US')}`
}

export function describeUnit(u: UnitRow, now: Date = new Date()): UnitView {
  const ngn = positive(u.price_ngn)
  const usd = positive(u.price_usd)
  const cur = (u.currency_code ?? 'NGN').toUpperCase()
  const label = u.unit_type?.trim() || 'Unnamed unit type'

  let status: PriceStatus
  let priceNgn: number | null = ngn
  if (ngn == null && usd == null) status = 'not_supplied'
  else if (ngn != null && cur !== 'NGN') { status = 'currency_unconfirmed'; priceNgn = null }   // never guess which currency a stored figure is in
  else {
    const t = u.last_price_verified_at ? new Date(u.last_price_verified_at).getTime() : NaN
    if (!Number.isFinite(t)) status = 'no_confirmation_date'
    else status = (now.getTime() - t) / MS_DAY > PRICE_STALE_DAYS ? 'not_recently_confirmed' : 'recently_confirmed'
  }

  const priceNote =
    status === 'not_supplied' ? 'Price not supplied for this unit.'
    : status === 'currency_unconfirmed' ? `Recorded currency is ${cur}; the amount needs confirmation.`
    : status === 'no_confirmation_date' ? 'Recorded price. No confirmation date is on file, so it requires confirmation.'
    : status === 'not_recently_confirmed' ? 'Recorded price. It was not confirmed recently and requires confirmation.'
    : 'Recorded price, confirmed recently. Confirm before relying on it.'

  const available = u.available_count == null ? null : Number(u.available_count)
  const availableCount = available != null && Number.isFinite(available) && available >= 0 ? available : null
  const availabilityNote =
    availableCount == null ? 'Availability not confirmed.'
    : availableCount === 0 ? 'None recorded as available.'
    : `${availableCount} recorded as available. Confirm before relying on it.`

  return {
    id: u.id, label, sizeSqm: positive(u.size_sqm),
    priceNgn, priceUsd: usd, currency: ngn != null || usd != null ? (ngn != null ? cur : 'USD') : null,
    priceStatus: status, requiresConfirmation: status !== 'recently_confirmed', priceNote,
    availableCount, availabilityNote,
    canAssessFinancing: priceNgn != null,
    depositPct: positive(u.deposit_pct), installmentMonths: positive(u.installment_months),
    lastPriceVerifiedAt: u.last_price_verified_at ?? null,
  }
}

/** The buyer-facing price line for one unit. Never falls back to another unit. */
export function priceLine(v: UnitView): string {
  if (v.priceNgn != null) return formatNaira(v.priceNgn)
  if (v.priceStatus === 'currency_unconfirmed') return 'Currency to be confirmed'
  if (v.priceUsd != null) return `USD ${Math.round(v.priceUsd).toLocaleString('en-US')}`
  return 'Price not supplied'
}

/** What is stored on developer_leads when a unit-specific request is made. */
export interface UnitSnapshot {
  unit_type_id: string
  unit_type_label: string
  unit_price_ngn: number | null
  unit_price_usd: number | null
  unit_price_currency: string | null
  unit_price_status: PriceStatus
  unit_price_verified_at: string | null
  unit_available_count: number | null
  unit_snapshot_at: string
}

export function buildSnapshot(v: UnitView, now: Date = new Date()): UnitSnapshot {
  return {
    unit_type_id: v.id,
    unit_type_label: v.label,
    unit_price_ngn: v.priceNgn,
    unit_price_usd: v.priceUsd,
    unit_price_currency: v.currency,
    unit_price_status: v.priceStatus,
    unit_price_verified_at: v.lastPriceVerifiedAt,
    unit_available_count: v.availableCount,
    unit_snapshot_at: now.toISOString(),
  }
}

export type UnitRequestResult =
  | { ok: true; unit: UnitView | null; snapshot: UnitSnapshot | null; purpose: RequestPurpose | null; financingType: FinancingTypeKey | null }
  | { ok: false; error: string }

/**
 * Validate the unit part of a request against the development's OWN unit rows.
 *   - A unit id must belong to the development.
 *   - A request purpose requires a chosen unit (nothing is defaulted).
 *   - Financing purposes require a unit with a usable NGN price: a missing price
 *     cannot be assessed, and is never replaced by another unit's price.
 *   - "Confirm price and availability" is allowed for a unit with no price, because
 *     that is precisely the question being asked.
 */
export function validateUnitRequest(input: {
  units: UnitRow[]
  unitTypeId?: string | null
  purpose?: string | null
  financingType?: string | null
  now?: Date
}): UnitRequestResult {
  const now = input.now ?? new Date()
  const purposeRaw = input.purpose ?? null
  let purpose: RequestPurpose | null = null
  if (purposeRaw) {
    if (!(REQUEST_PURPOSES as readonly string[]).includes(purposeRaw)) return { ok: false, error: 'That request type is not recognised.' }
    purpose = purposeRaw as RequestPurpose
  }
  let financingType: FinancingTypeKey | null = null
  if (input.financingType) {
    if (!(FINANCING_TYPE_KEYS as readonly string[]).includes(input.financingType)) return { ok: false, error: 'That financing type is not recognised.' }
    financingType = input.financingType as FinancingTypeKey
  }

  if (!input.unitTypeId) {
    if (purpose) return { ok: false, error: 'Choose the unit this request is about.' }
    return { ok: true, unit: null, snapshot: null, purpose: null, financingType }
  }

  const row = input.units.find(u => u.id === input.unitTypeId)
  if (!row) return { ok: false, error: 'That unit does not belong to this development.' }
  const unit = describeUnit(row, now)

  if (purpose && purposeNeedsFinancing(purpose) && !unit.canAssessFinancing) {
    return { ok: false, error: 'This unit has no usable recorded price, so financing cannot be assessed for it. Ask MANOP to confirm its price and availability instead.' }
  }
  return { ok: true, unit, snapshot: buildSnapshot(unit, now), purpose, financingType }
}

// ── Routing ────────────────────────────────────────────────────────────────

export type RoutingStatus = 'developer_account' | 'agency_mandate' | 'manop_operator'
export const ROUTING_STATUSES: RoutingStatus[] = ['developer_account', 'agency_mandate', 'manop_operator']

export const ROUTING_LABEL: Record<RoutingStatus, string> = {
  developer_account: 'Routed to the developer account',
  agency_mandate: 'Routed to the submitting agency (mandate on file)',
  manop_operator: 'Held in the MANOP operator queue',
}

/**
 * Where a new introduction is handled, from facts about the opportunity. It mirrors who
 * resolveParty() lets into the Deal Room, so routing never promises more than access allows:
 *   - a claimed developer account receives it;
 *   - otherwise the submitting agency, but only with a mandate document on file;
 *   - otherwise MANOP's operator queue. MANOP does not invent a developer contact and does
 *     not assume the developer has authorised it to negotiate.
 */
export function resolveRouting(f: { developerClaimed: boolean; submittingAgencyId: string | null; mandateOnFile: boolean }): RoutingStatus {
  if (f.developerClaimed) return 'developer_account'
  if (f.submittingAgencyId && f.mandateOnFile) return 'agency_mandate'
  return 'manop_operator'
}

// ── Display of a stored request ────────────────────────────────────────────

export interface StoredUnitRequest {
  unit_type_id?: string | null
  unit_type_label?: string | null
  unit_price_ngn?: number | string | null
  unit_price_usd?: number | string | null
  unit_price_currency?: string | null
  unit_price_status?: string | null
  unit_price_verified_at?: string | null
  unit_available_count?: number | null
  unit_snapshot_at?: string | null
  request_purpose?: string | null
  financing_type?: string | null
  routing_status?: string | null
}

export interface UnitRequestSummary {
  recorded: boolean
  unitLabel: string
  priceLine: string
  priceNote: string
  availabilityNote: string
  purposeLabel: string | null
  financingLabel: string | null
  routingLabel: string | null
  snapshotAt: string | null
  note: string | null
}

const PRICE_NOTE: Record<PriceStatus, string> = {
  not_supplied: 'No price was recorded for this unit when the request was made.',
  currency_unconfirmed: 'The recorded currency needed confirmation when the request was made.',
  no_confirmation_date: 'Recorded price at the time of the request; no confirmation date was on file, so it requires confirmation.',
  not_recently_confirmed: 'Recorded price at the time of the request; it had not been confirmed recently and requires confirmation.',
  recently_confirmed: 'Recorded price at the time of the request, confirmed recently. Later changes to the listing do not alter this record.',
}

/**
 * Summarise what a lead stored. For leads created before the structured snapshot existed
 * (no unit_type_label) the stored unit_type_id is NOT presented as the buyer's choice: the old
 * form filled it with the first listed unit whatever the buyer wanted.
 */
export function summariseUnitRequest(l: StoredUnitRequest): UnitRequestSummary {
  const purposeLabel = l.request_purpose && l.request_purpose in PURPOSE_LABEL ? PURPOSE_LABEL[l.request_purpose as RequestPurpose] : null
  const financingLabel = l.financing_type && l.financing_type in FINANCING_TYPE_LABEL ? FINANCING_TYPE_LABEL[l.financing_type as FinancingTypeKey] : null
  const routingLabel = l.routing_status && l.routing_status in ROUTING_LABEL ? ROUTING_LABEL[l.routing_status as RoutingStatus] : null

  if (!l.unit_type_label) {
    return {
      recorded: false, unitLabel: 'No unit selection recorded', priceLine: '', priceNote: '', availabilityNote: '',
      purposeLabel, financingLabel, routingLabel, snapshotAt: null,
      note: l.unit_type_id ? 'This enquiry pre-dates unit selection. Any unit reference stored with it was filled in automatically and is not the buyer’s choice.' : null,
    }
  }
  const status = (PRICE_STATUSES as string[]).includes(l.unit_price_status ?? '') ? (l.unit_price_status as PriceStatus) : 'not_supplied'
  const ngn = positive(l.unit_price_ngn)
  const usd = positive(l.unit_price_usd)
  const price = ngn != null ? formatNaira(ngn)
    : status === 'currency_unconfirmed' ? 'Currency to be confirmed'
    : usd != null ? `USD ${Math.round(usd).toLocaleString('en-US')}`
    : 'Price not supplied'
  const n = l.unit_available_count
  const availabilityNote = n == null ? 'Availability was not confirmed at the time.' : n === 0 ? 'None were recorded as available at the time.' : `${n} were recorded as available at the time. Not confirmed.`
  return {
    recorded: true, unitLabel: l.unit_type_label, priceLine: price, priceNote: PRICE_NOTE[status], availabilityNote,
    purposeLabel, financingLabel, routingLabel, snapshotAt: l.unit_snapshot_at ?? null, note: null,
  }
}