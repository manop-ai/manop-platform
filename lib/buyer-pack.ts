// lib/buyer-pack.ts
//
// MANOP Buyer Pack: a PDF built on demand from the CURRENT public development record. Nothing is cached or copied, so a
// document made private, a changed price or an updated stage shows in the next download.
//
// What is (and is not) in it follows the public page's own rules:
//  - only PUBLISHED developments; only fields the public page already shows;
//  - documents: ONLY those an admin explicitly made public, as metadata (files are never embedded); private and
//    confidential documents are counted at most, never named; no URLs of any private file ever enter this module;
//  - developer identity: only for signed-in users, as on the public page;
//  - missing information is labelled, never inferred or invented.
// The pure parts (gaps, formatting, wrapping) are exported for testing. PDF text uses standard fonts, so characters outside
// Latin-1 are replaced (currency symbols become codes).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from 'pdf-lib'
import { isPublicDocument, DOC_STATUS_LABEL, type DocStatus } from './documents-access'

export const BUYER_PACK_DISCLAIMER = 'Information reviewed by MANOP. This is not financial, legal, or investment advice — independent due diligence is required before any decision.'
export const SITE_URL = 'https://manopintel.com'

export interface PackUnit { unit_type: string; size_sqm: number | null; price_ngn: number | null; price_usd: number | null; currency_code: string | null; available_count: number | null; quantity: number | null; deposit_pct: number | null; installment_months: number | null; completion_payment_pct: number | null; last_price_verified_at: string | null }
export interface PackUpdate { title: string; body: string | null; stage_at_time: string | null; completion_pct_at_time: number | null; posted_by_role: string; verification_status: string | null; posted_at: string }
export interface PackDoc { id: string; document_type: string; document_name: string | null; status: string | null; publicly_visible: boolean | null; verified?: boolean | null }
export interface PackEvidence { category: string; status: string }
export interface PackProject {
  id: string; name: string; neighborhood: string | null; city: string | null; state: string | null; country_code: string | null
  stage: string | null; total_units: number | null; handover_date: string | null; description: string | null
  manop_checked_note: string | null; manop_flag_note: string | null; reviewed_at: string | null
  virtual_viewing?: boolean | null; remote_purchase?: boolean | null; poa_process?: boolean | null; international_payment?: boolean | null
}
export interface PackImage { bytes: Uint8Array; type: 'jpg' | 'png' }
export interface PackData {
  generatedAt: Date
  project: PackProject
  developerName: string | null          // null = not shown (signed-out) — see developerNote
  developerNote: string | null
  units: PackUnit[]
  updates: PackUpdate[]
  documents: PackDoc[]                  // ALL project documents; only public ones are rendered
  evidence: PackEvidence[]
  images: PackImage[]
}

const MS_DAY = 86_400_000
export const PRICE_STALE_DAYS = 90

// ── pure helpers ──────────────────────────────────────────────────────────────────────────────────
const REPLACE: [RegExp, string][] = [[/₦/g, 'NGN '], [/GH₵/g, 'GHS '], [/[–—]/g, '-'], [/[‘’]/g, "'"], [/[“”]/g, '"'], [/…/g, '...'], [/[•·]/g, '-'], [/[↗→]/g, ''], [/\u00a0/g, ' ']]
/** Standard PDF fonts cover Latin-1 only: map the common symbols, replace the rest, never throw. */
export function pdfSafe(s: unknown): string {
  let t = String(s ?? '')
  for (const [re, to] of REPLACE) t = t.replace(re, to)
  return t.replace(/[^\n\x20-\x7E\xA1-\xFF]/g, '?')
}

export function wrapText(text: string, width: number, measure: (s: string) => number): string[] {
  const out: string[] = []
  for (const para of pdfSafe(text).split('\n')) {
    if (!para.trim()) { out.push(''); continue }
    let line = ''
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (measure(word) > width) {                       // break an over-long token (e.g. a URL)
        let cut = word.length; while (cut > 1 && measure(word.slice(0, cut)) > width) cut--
        if (line) { out.push(line); line = '' }
        out.push(word.slice(0, cut)); word = word.slice(cut)
      }
      const next = line ? `${line} ${word}` : word
      if (measure(next) <= width) line = next
      else { out.push(line); line = word }
    }
    if (line) out.push(line)
  }
  return out
}

const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null)
const label = (s: string | null | undefined) => (s ? s.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) : '')

export function priceText(u: PackUnit): string {
  const cur = (u.currency_code ?? 'NGN').toUpperCase()
  const parts: string[] = []
  if (u.price_ngn != null) {
    if (cur === 'NGN') parts.push(`NGN ${Number(u.price_ngn).toLocaleString('en-US')}`)
    else parts.push(`Recorded currency is ${cur}; the amount needs confirmation`)   // never guess which currency a stored figure is in
  }
  if (u.price_usd != null) parts.push(`USD ${Number(u.price_usd).toLocaleString('en-US')}`)
  return parts.length ? parts.join(' / ') : 'Not provided'
}

export function priceConfirmation(u: PackUnit, now: Date): string {
  if (u.price_ngn == null && u.price_usd == null) return ''
  if (!u.last_price_verified_at) return 'Confirmation date not recorded'
  const age = (now.getTime() - new Date(u.last_price_verified_at).getTime()) / MS_DAY
  return age > PRICE_STALE_DAYS ? `Not recently confirmed (last confirmed ${fmtDate(u.last_price_verified_at)})` : `Confirmed ${fmtDate(u.last_price_verified_at)}`
}

export function paymentText(u: PackUnit): string {
  const p: string[] = []
  if (u.deposit_pct != null) p.push(`${u.deposit_pct}% deposit`)
  if (u.installment_months != null) p.push(`${u.installment_months} months`)
  if (u.completion_payment_pct != null) p.push(`${u.completion_payment_pct}% on completion`)
  return p.length ? p.join(', ') : 'Not provided'
}

export function availabilityText(u: PackUnit): string { return u.available_count != null ? String(u.available_count) : 'Not provided' }

/** Every honest "we don't have this" the pack can state, derived only from what is actually missing. */
export function computeGaps(d: PackData): string[] {
  const g: string[] = []
  const p = d.project, now = d.generatedAt
  if (!p.description?.trim()) g.push('Development description: not provided.')
  if (!p.stage) g.push('Construction stage: not provided.')
  if (!p.handover_date) g.push('Expected completion date: not provided.')
  if (!p.total_units) g.push('Number of units: not provided.')
  if (d.images.length === 0) g.push('Images: none available for this pack.')
  if (d.units.length === 0) g.push('Unit types and pricing: not provided.')
  else {
    const noPrice = d.units.filter(u => u.price_ngn == null && u.price_usd == null).map(u => u.unit_type)
    if (noPrice.length) g.push(`Price not provided for: ${noPrice.join(', ')}.`)
    const stale = d.units.filter(u => (u.price_ngn != null || u.price_usd != null) && priceConfirmation(u, now).startsWith('Not recently') || (u.price_ngn != null && !u.last_price_verified_at)).map(u => u.unit_type)
    if (stale.length) g.push(`Price needs confirming (not recently confirmed, or no confirmation date): ${Array.from(new Set(stale)).join(', ')}.`)
    const noAvail = d.units.filter(u => u.available_count == null).map(u => u.unit_type)
    if (noAvail.length) g.push(`Availability not provided for: ${noAvail.join(', ')}.`)
  }
  if (d.documents.filter(isPublicDocument).length === 0) g.push('Documents: none have been approved for public viewing. Ask MANOP what supporting documents exist.')
  if (!p.reviewed_at) g.push('MANOP review: not yet completed for this development.')
  const weak = d.evidence.filter(e => ['developer_stated', 'unknown', 'contradictory_clarification_required'].includes(e.status)).length
  if (d.evidence.length === 0) g.push('Evidence register: no claims have been recorded yet.')
  else if (weak) g.push(`Evidence: ${weak} of ${d.evidence.length} recorded claims are developer-stated, unknown, or need clarification. These require further verification.`)
  return g
}

export function evidenceSummary(e: PackEvidence[]): string[] {
  const counts = new Map<string, number>()
  for (const x of e) counts.set(x.status, (counts.get(x.status) ?? 0) + 1)
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${n} ${label(s).toLowerCase()}`)
}

export function packFilename(name: string, now: Date): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'development'
  return `MANOP-Buyer-Pack-${slug}-${now.toISOString().slice(0, 10)}.pdf`
}

// ── PDF ───────────────────────────────────────────────────────────────────────────────────────────
const NAVY = rgb(0.059, 0.09, 0.165), PURPLE = rgb(0.357, 0.18, 1), TEAL = rgb(0.078, 0.722, 0.651), INK = rgb(0.11, 0.13, 0.18), MUTED = rgb(0.38, 0.42, 0.5), RULE = rgb(0.85, 0.87, 0.9), AMBER = rgb(0.72, 0.42, 0.02)
const W = 595.28, H = 841.89, M = 48, TOP = H - 64, BOTTOM = 64

class Writer {
  page!: PDFPage; y = 0; pages: PDFPage[] = []
  constructor(public pdf: PDFDocument, public reg: PDFFont, public bold: PDFFont) {}
  add(): PDFPage {
    this.page = this.pdf.addPage([W, H]); this.pages.push(this.page); this.y = TOP
    this.page.drawRectangle({ x: 0, y: H - 30, width: W, height: 30, color: NAVY })
    this.page.drawText('MANOP', { x: M, y: H - 20, size: 10, font: this.bold, color: rgb(1, 1, 1) })
    this.page.drawText('Buyer Pack', { x: W - M - this.reg.widthOfTextAtSize('Buyer Pack', 9), y: H - 20, size: 9, font: this.reg, color: rgb(0.8, 0.84, 0.92) })
    return this.page
  }
  need(h: number) { if (this.y - h < BOTTOM) this.add() }
  measure(font: PDFFont, size: number) { return (s: string) => font.widthOfTextAtSize(s, size) }
  para(text: string, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; gap?: number; indent?: number; width?: number } = {}) {
    const size = o.size ?? 10, font = o.font ?? this.reg, lh = size * 1.45, indent = o.indent ?? 0
    const lines = wrapText(text, (o.width ?? (W - 2 * M)) - indent, this.measure(font, size))
    for (const l of lines) { this.need(lh); this.page.drawText(l, { x: M + indent, y: this.y - size, size, font, color: o.color ?? INK }); this.y -= lh }
    this.y -= o.gap ?? 6
  }
  h1(t: string) { this.need(46); this.y -= 6; this.page.drawText(pdfSafe(t), { x: M, y: this.y - 15, size: 15, font: this.bold, color: NAVY }); this.y -= 22; this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: 1, color: TEAL }); this.y -= 12 }
  kv(k: string, v: string) { this.need(16); const kw = 118; this.page.drawText(pdfSafe(k), { x: M, y: this.y - 10, size: 9, font: this.bold, color: MUTED }); const lines = wrapText(v, W - 2 * M - kw, this.measure(this.reg, 10)); lines.forEach((l, i) => { if (i) this.need(14); this.page.drawText(l, { x: M + kw, y: this.y - 10, size: 10, font: this.reg, color: INK }); this.y -= 14 }); this.y -= 2 }
  bullet(t: string, color = INK) { this.need(14); this.page.drawText('-', { x: M + 2, y: this.y - 10, size: 10, font: this.bold, color: TEAL }); this.para(t, { indent: 14, color, gap: 3 }) }
}

async function embed(pdf: PDFDocument, im: PackImage): Promise<PDFImage | null> {
  try { return im.type === 'png' ? await pdf.embedPng(im.bytes) : await pdf.embedJpg(im.bytes) } catch { return null }
}

export async function buildBuyerPackPdf(d: PackData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(pdfSafe(`MANOP Buyer Pack - ${d.project.name}`)); pdf.setAuthor('MANOP'); pdf.setProducer('MANOP'); pdf.setCreationDate(d.generatedAt)
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const w = new Writer(pdf, reg, bold), p = d.project
  const loc = [p.neighborhood, p.city, p.state, p.country_code].filter(Boolean).join(', ')
  const url = `${SITE_URL}/development/${p.id}`
  const embedded = (await Promise.all(d.images.slice(0, 7).map(i => embed(pdf, i)))).filter((x): x is PDFImage => !!x)

  // 1 ── Cover
  const cover = w.add()
  cover.drawRectangle({ x: 0, y: H - 260, width: W, height: 230, color: NAVY })
  cover.drawText('MANOP', { x: M, y: H - 78, size: 26, font: bold, color: rgb(1, 1, 1) })
  cover.drawText('The intelligence partner for real estate development', { x: M, y: H - 96, size: 10, font: reg, color: rgb(0.7, 0.76, 0.9) })
  cover.drawText('BUYER PACK', { x: M, y: H - 140, size: 10, font: bold, color: TEAL })
  w.y = H - 156
  for (const l of wrapText(p.name, W - 2 * M, w.measure(bold, 26))) { cover.drawText(l, { x: M, y: w.y - 24, size: 26, font: bold, color: rgb(1, 1, 1) }); w.y -= 32 }
  if (loc) cover.drawText(pdfSafe(loc), { x: M, y: H - 244, size: 11, font: reg, color: rgb(0.8, 0.84, 0.92) })
  w.y = H - 285
  if (embedded[0]) {
    const im = embedded[0], maxW = W - 2 * M, maxH = 300, sc = Math.min(maxW / im.width, maxH / im.height)
    cover.drawImage(im, { x: M, y: w.y - im.height * sc, width: im.width * sc, height: im.height * sc }); w.y -= im.height * sc + 16
  }
  w.kv('Developer', d.developerName ?? d.developerNote ?? 'Not shown')
  w.kv('Generated', `${fmtDate(d.generatedAt.toISOString())} (current MANOP record at that time)`)
  w.kv('Reference', `MANOP development ${p.id.slice(0, 8).toUpperCase()}`)
  w.kv('Online', url)

  // 2 ── Overview
  w.add(); w.h1('Development overview')
  if (p.description?.trim()) w.para(p.description.trim(), { size: 10.5, gap: 10 }); else w.para('Description: not provided.', { color: MUTED })
  w.kv('Location', loc || 'Not provided')
  w.kv('Construction stage', p.stage ? label(p.stage) : 'Not provided')
  w.kv('Expected completion', fmtDate(p.handover_date) ?? 'Not provided')
  w.kv('Number of units', p.total_units ? String(p.total_units) : 'Not provided')
  w.kv('MANOP review', p.reviewed_at ? `Reviewed ${fmtDate(p.reviewed_at)}` : 'Not yet reviewed by MANOP')
  const buyerFlags = [p.virtual_viewing && 'Virtual viewing offered', p.remote_purchase && 'Remote purchase supported', p.poa_process && 'Power of attorney process described', p.international_payment && 'International payment supported'].filter(Boolean) as string[]
  if (buyerFlags.length) w.kv('Stated by the developer', buyerFlags.join('; '))

  // 3 ── Images
  if (embedded.length) {
    w.add(); w.h1('Images')
    const colW = (W - 2 * M - 14) / 2
    for (let i = 0; i < embedded.length; i += 2) {
      const row = embedded.slice(i, i + 2), hs = row.map(im => (im.height * colW) / im.width), h = Math.min(Math.max(...hs), 210)
      w.need(h + 16)
      row.forEach((im, j) => { const sc = Math.min(colW / im.width, h / im.height); w.page.drawImage(im, { x: M + j * (colW + 14), y: w.y - im.height * sc, width: im.width * sc, height: im.height * sc }) })
      w.y -= h + 14
    }
    w.para('Images are supplied for the development and may be illustrative. They are not independently verified by MANOP.', { size: 8.5, color: MUTED })
  }

  // 4 ── Units and pricing
  w.add(); w.h1('Unit types and pricing')
  if (!d.units.length) w.para('Unit types and pricing: not provided.', { color: MUTED })
  for (const u of d.units) {
    w.need(112)
    w.page.drawRectangle({ x: M, y: w.y - 4, width: W - 2 * M, height: 0.8, color: RULE }); w.y -= 10
    w.para(u.unit_type, { font: bold, size: 11.5, gap: 3 })
    w.kv('Size', u.size_sqm != null ? `${u.size_sqm} sq.m.` : 'Not provided')
    w.kv('Price', priceText(u))
    const conf = priceConfirmation(u, d.generatedAt); if (conf) w.kv('Price status', conf)
    w.kv('Available now', availabilityText(u))
    w.kv('Payment structure', paymentText(u))
  }
  w.para('Prices and availability are supplied by the developer or its agent and can change. Confirm current figures with MANOP or the developer before relying on them.', { size: 8.5, color: MUTED })

  // 5 ── Progress
  w.need(120); w.h1('Development progress')
  if (!d.updates.length) w.para('No progress updates have been posted yet.', { color: MUTED })
  for (const u of d.updates.slice(0, 6)) {
    const by = u.verification_status === 'manop_confirmed' ? 'MANOP-confirmed' : `Reported by ${u.posted_by_role === 'admin' ? 'MANOP' : u.posted_by_role}`
    w.para(`${u.title}`, { font: bold, size: 10.5, gap: 1 })
    w.para(`${fmtDate(u.posted_at)} · ${by}${u.stage_at_time ? ` · ${label(u.stage_at_time)}` : ''}${u.completion_pct_at_time != null ? ` · ${u.completion_pct_at_time}% complete` : ''}`, { size: 8.5, color: MUTED, gap: 2 })
    if (u.body) w.para(u.body, { gap: 8 })
  }

  // 6 ── Documents
  w.need(120); w.h1('Documents and evidence')
  const pub = d.documents.filter(isPublicDocument)
  if (!pub.length) w.para('No documents have been approved for public viewing for this development.', { color: MUTED })
  for (const doc of pub) {
    const st = doc.status === 'reviewed' || doc.verified ? 'Reviewed by MANOP' : DOC_STATUS_LABEL[(doc.status ?? 'provided') as DocStatus] ?? 'Submitted, not reviewed'
    w.bullet(`${doc.document_name || label(doc.document_type)} (${label(doc.document_type)}) - ${st}`)
  }
  w.para('Listed documents have been approved for public viewing. This does not mean MANOP has certified them. Other submitted documents are held privately by MANOP and are not included in this pack.', { size: 8.5, color: MUTED })
  if (d.evidence.length) w.kv('Evidence register', `${d.evidence.length} claims recorded: ${evidenceSummary(d.evidence).join('; ')}`)

  // 7 ── MANOP review
  w.need(120); w.h1('MANOP review')
  if (!p.reviewed_at) w.para('MANOP has not completed a review of this development.', { color: MUTED })
  else {
    w.kv('Reviewed', fmtDate(p.reviewed_at)!)
    if (p.manop_checked_note?.trim()) { w.para('What MANOP checked', { font: bold, size: 10, gap: 2 }); w.para(p.manop_checked_note.trim()) }
    if (p.manop_flag_note?.trim()) { w.para('Considerations identified', { font: bold, size: 10, gap: 2, color: AMBER }); w.para(p.manop_flag_note.trim()) }
    if (!p.manop_checked_note?.trim() && !p.manop_flag_note?.trim()) w.para('No review summary has been approved for public disclosure.', { color: MUTED })
  }
  w.para('A MANOP review records what was found. It does not guarantee the developer, certify legal title, approve the property or recommend an investment.', { size: 8.5, color: MUTED })

  // 8 ── Gaps
  w.need(120); w.h1('Information gaps and further investigation')
  const gaps = computeGaps(d)
  if (!gaps.length) w.para('No gaps were identified in the information held by MANOP. Independent due diligence is still required.', { color: MUTED })
  gaps.forEach(g => w.bullet(g))

  // 9 ── Next steps
  w.need(150); w.h1('Next steps')
  ;['Enquire about this development on its MANOP page and ask for what is missing above.', 'Request additional information or documents through MANOP.', 'Sign in to save this development to your watchlist.', 'Verify title, planning and payment terms independently with qualified professionals.'].forEach(t => w.bullet(t))
  w.kv('MANOP page', url)

  // 10 ── Disclaimer
  w.need(120); w.h1('Disclaimer')
  w.para(BUYER_PACK_DISCLAIMER, { size: 10.5, font: bold, color: NAVY, gap: 8 })
  w.para(`This pack was generated on ${fmtDate(d.generatedAt.toISOString())} from the MANOP record for this development. Later changes will not appear in a copy already downloaded.`, { size: 8.5, color: MUTED })

  // footers with page numbers
  const total = w.pages.length
  w.pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: M, y: 46 }, end: { x: W - M, y: 46 }, thickness: 0.6, color: RULE })
    pg.drawText(pdfSafe(`${p.name} · Generated ${d.generatedAt.toISOString().slice(0, 10)} · Independent due diligence is required`), { x: M, y: 32, size: 7.5, font: reg, color: MUTED, maxWidth: W - 2 * M - 60 })
    pg.drawText(`Page ${i + 1} of ${total}`, { x: W - M - 48, y: 32, size: 7.5, font: reg, color: MUTED })
  })
  return pdf.save()
}

// ── data ──────────────────────────────────────────────────────────────────────────────────────────
/** Insert a Cloudinary transformation so images arrive as modest JPEGs (smaller PDF, formats pdf-lib can embed). */
export function packImageUrl(url: string): string {
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/.exec(url)
  if (!m) return url
  return /^[a-z]_|^f_|^w_|^c_|^q_/.test(m[2]) ? url : `${m[1]}f_jpg,w_1100,q_70,c_limit/${m[2]}`
}

export function sniffImage(b: Uint8Array): 'jpg' | 'png' | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return 'jpg'
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  return null
}

export async function fetchPackImages(urls: string[] | null | undefined, max = 7): Promise<PackImage[]> {
  const out: PackImage[] = []
  for (const raw of (urls ?? []).filter(u => /^https:\/\//i.test(u)).slice(0, max)) {
    try {
      const res = await fetch(packImageUrl(raw), { signal: AbortSignal.timeout(8000), cache: 'no-store' })
      if (!res.ok) continue
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.length === 0 || bytes.length > 4_000_000) continue
      const type = sniffImage(bytes); if (type) out.push({ bytes, type })
    } catch { /* an unreachable image is skipped, never a broken placeholder */ }
  }
  return out
}