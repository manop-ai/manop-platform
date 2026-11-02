// lib/unit-terms.ts
//
// The commercial terms of a unit type that a developer may change directly on a published development:
// price, deposit %, instalment months, units available, and total units. Everything that changes them goes through
// public.apply_unit_term_changes (sql/phase32), which records history. This module mirrors that function's validation and
// materiality rules so the browser and the route can refuse early with a clear message; the database remains the last line of defence.
//
// Deliberately NOT here: sold or reserved quantities. The app does not collect them and they are never derived from "available".

export const TERM_FIELDS = ['price_ngn', 'deposit_pct', 'installment_months', 'available_count', 'quantity'] as const
export type TermField = typeof TERM_FIELDS[number]
export type UnitTerms = Record<TermField, number | null>
export type TermChanges = Partial<UnitTerms>

export const TERM_LABEL: Record<TermField, string> = {
  price_ngn: 'Price', deposit_pct: 'Deposit', installment_months: 'Instalment period', available_count: 'Units available', quantity: 'Total units',
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isInt = (v: number) => Number.isInteger(v)

/** Parse a form value: '' / null / undefined -> null (clear the field), a number -> number, anything else -> NaN (invalid). */
export function parseTermInput(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return raw
  const s = String(raw).replace(/[,\s₦]/g, '')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

/** Validate the result of applying `changes` to `current`. Returns an error message, or null when acceptable. */
export function validateTermChanges(current: UnitTerms, changes: TermChanges): string | null {
  const keys = Object.keys(changes)
  if (keys.length === 0) return 'Nothing to change.'
  for (const k of keys) {
    if (!(TERM_FIELDS as readonly string[]).includes(k)) return `"${k}" cannot be changed here.`
    const v = (changes as Record<string, unknown>)[k]
    if (v !== null && !isNum(v)) return `${TERM_LABEL[k as TermField]} must be a number.`
  }
  const n: UnitTerms = { ...current, ...changes } as UnitTerms
  if ('price_ngn' in changes && (n.price_ngn === null || n.price_ngn <= 0 || n.price_ngn > 1e12)) return 'Price must be greater than zero.'
  if (n.deposit_pct !== null && (n.deposit_pct < 0 || n.deposit_pct > 100)) return 'Deposit must be between 0% and 100%.'
  if (n.installment_months !== null && (n.installment_months < 1 || n.installment_months > 360 || !isInt(n.installment_months))) return 'Instalment period must be a whole number of months, from 1 to 360.'
  if (n.available_count !== null && (n.available_count < 0 || n.available_count > 1e6 || !isInt(n.available_count))) return 'Units available must be a whole number of 0 or more.'
  if (n.quantity !== null && (n.quantity < 0 || n.quantity > 1e6 || !isInt(n.quantity))) return 'Total units must be a whole number of 0 or more.'
  if (('deposit_pct' in changes || 'installment_months' in changes) && ((n.deposit_pct === null) !== (n.installment_months === null))) return 'Set both the deposit and the instalment period, or clear both.'
  if (('available_count' in changes || 'quantity' in changes) && n.available_count !== null && n.quantity !== null && n.available_count > n.quantity) return 'Units available cannot be more than total units.'
  return null
}

/** Only the fields whose value actually differs from the current value. */
export function diffTerms(current: UnitTerms, next: TermChanges): TermChanges {
  const out: TermChanges = {}
  for (const k of TERM_FIELDS) if (k in next && next[k] !== current[k]) out[k] = next[k] as number | null
  return out
}

/** Same rule as the SQL: a price move of 5% or more, any move to or from "none available", and any change to deposit, period or total is material. */
export function isMaterial(field: TermField, prev: number | null, next: number | null): boolean {
  if (prev === next) return false
  if (field === 'price_ngn') return prev === null || next === null || prev === 0 || Math.abs(next - prev) / prev >= 0.05
  if (field === 'available_count') return (prev !== 0 && next === 0) || (prev === 0 && next !== 0)
  return true
}

/** Map a database/RPC error message to something a developer can act on, with an HTTP status. */
export function mapUnitTermsError(message: string): { status: number; error: string; code: string } {
  const m = message || ''
  if (/STALE:/.test(m)) return { status: 409, code: 'STALE', error: 'These terms were changed by someone else since you opened them. Reload to see the latest values, then try again.' }
  if (/NOT_FOUND/.test(m)) return { status: 404, code: 'NOT_FOUND', error: 'Unit type not found.' }
  if (/INVALID:payment_plan_incomplete/.test(m)) return { status: 400, code: 'INVALID', error: 'Set both the deposit and the instalment period, or clear both.' }
  if (/INVALID:available_exceeds_total/.test(m)) return { status: 400, code: 'INVALID', error: 'Units available cannot be more than total units.' }
  if (/INVALID:|BAD_FIELD|BAD_VALUE|NO_CHANGES/.test(m)) return { status: 400, code: 'INVALID', error: 'One of the values is not acceptable. Check the price, deposit, period and unit counts.' }
  if (/apply_unit_term_changes|unit_term_changes|terms_updated/.test(m) && /does not exist|schema cache|42883|42P01|42703|PGRST/.test(m)) return { status: 503, code: 'MIGRATION', error: 'Unit-terms updates are not switched on yet (database migration pending).' }
  return { status: 500, code: 'SERVER', error: 'Could not save the change.' }
}

/** One readable line for a history row. */
export function describeChange(field: TermField, prev: number | null, next: number | null): string {
  const f = (v: number | null) => {
    if (v === null) return 'not set'
    if (field === 'price_ngn') return `₦${Math.round(v).toLocaleString('en-NG')}`
    if (field === 'deposit_pct') return `${v}%`
    if (field === 'installment_months') return `${v} months`
    return String(v)
  }
  return `${TERM_LABEL[field]}: ${f(prev)} → ${f(next)}`
}