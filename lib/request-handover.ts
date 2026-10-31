// lib/request-handover.ts
//
// Builds the three texts an admin copies from a financing request or an introduction:
//   - internal summary     everything MANOP holds that an admin may use (no secrets, no tokens)
//   - developer request    questions for a developer; contains NO buyer identity or contact details unless the buyer's
//                          agreement to share is explicitly recorded (shareBuyerWithDeveloper)
//   - financing-partner    the applicant's declared figures and city; contact details are withheld until MANOP confirms
//                          the applicant has agreed to their release (shareContactWithPartner)
// Plus: which information is missing and what the next action is. Pure functions, no I/O.
//
// Nothing here marks a request as contacted, approved or progressed. Copying text is not the same as sending it: the
// admin records that in the follow-up log.

export type HandoverKind = 'financing_request' | 'introduction'

export interface HandoverRequest {
  kind: HandoverKind
  reference: string                 // MANOP reference shown to everyone
  linked_references: string[]       // e.g. the introduction id for a financing request
  submitted_at: string | null
  status: string
  requester: { name: string | null; email: string | null; phone: string | null; city: string | null; is_diaspora: boolean | null; country: string | null }
  development: { name: string | null; address: string | null; unit_label: string | null; price_text: string | null; price_status: string | null }
  pathway: string | null            // plain-language: what the buyer asked for
  financing: { loan_ngn: number | null; deposit_ngn: number | null; tenure_months: number | null; employment: string | null; income_range: string | null; price_ngn: number | null }
  scenario: { reference: string | null; saved: boolean | null; summary: string | null }
  payment_terms: string | null      // the terms as recorded/shown, with their confirmation status
  buyer_message: string | null
  consent: { enquiry_consent: boolean; attribution_acknowledged: boolean | null }
  notes: string | null
  developer: { company: string | null; claimed: boolean | null; contact_email: string | null }
  routing: string | null            // developer_account | agency_mandate | manop_operator
  assigned_to: string | null
}

const clean = (s: unknown): string => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim()
const ngn = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? `₦${Math.round(n).toLocaleString('en-NG')}` : 'not recorded')
const line = (label: string, v: unknown) => `${label}: ${clean(v) || 'not recorded'}`
const dateText = (iso: string | null) => {
  if (!iso) return 'not recorded'
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : 'not recorded'
}

export const STATUS_NEXT_ACTION: Record<string, string> = {
  submitted: 'Review the request and check the declared figures.',
  new: 'Review the introduction and confirm the unit and price with the buyer if needed.',
  reviewing: 'Decide the route: ask the buyer for clarification, send an information request to the developer, or enquire with a financing partner.',
  information_required: 'Waiting for the buyer to supply information.',
  clarification_requested: 'Waiting for the buyer to answer MANOP’s clarification request.',
  sent_to_partner: 'Waiting for the financing partner. Record the response when it arrives.',
  partner_contacted: 'Follow up with the partner and record what they say.',
  in_progress: 'Follow up and record the latest response.',
  closed: 'Closed: no action unless the buyer returns.',
  rejected: 'Closed: no action.',
  withdrawn: 'Withdrawn by the buyer: no action.',
}

export function nextAction(r: HandoverRequest): string {
  if (r.routing === 'manop_operator' && r.kind === 'introduction') {
    return r.developer.claimed
      ? 'MANOP is holding this introduction. Review it, then refer it to the developer (the buyer has agreed to share) or contact the developer yourself.'
      : 'The developer has not claimed their account. MANOP handles this directly: send the developer information request through a confirmed contact route and record the response.'
  }
  return STATUS_NEXT_ACTION[r.status] ?? 'Review the request and decide the next step.'
}

export function missingInformation(r: HandoverRequest): string[] {
  const m: string[] = []
  if (!r.requester.phone && !r.requester.email) m.push('No contact route for the buyer.')
  else if (!r.requester.phone) m.push('Buyer phone number.')
  else if (!r.requester.email) m.push('Buyer email address.')
  if (r.requester.is_diaspora && !r.requester.country) m.push('Country of residence (diaspora buyer).')
  if (!r.development.unit_label && r.kind === 'introduction') m.push('The unit the buyer is asking about.')
  if (r.development.price_status && /unconfirmed|unverified|stale|not confirmed/i.test(r.development.price_status)) m.push('Confirmation of the unit price from the developer.')
  if (r.scenario.saved === false) m.push('The buyer’s scenario was not saved to their account: the declared figures are in the notes.')
  if (r.financing.loan_ngn == null && r.pathway && /mortgage|nhf|diaspora|financ/i.test(r.pathway)) m.push('Loan amount requested.')
  if (!r.financing.employment && r.pathway && /mortgage|nhf|financ/i.test(r.pathway)) m.push('Employment status.')
  if (!r.developer.contact_email && r.kind === 'introduction') m.push('A confirmed contact route for the developer (none on file).')
  if (!r.consent.enquiry_consent) m.push('Record of the buyer’s consent to the enquiry.')
  if (r.kind === 'introduction' && r.consent.attribution_acknowledged === false) m.push('The buyer’s agreement to share their details with the developer.')
  return m
}

const DISCLAIMER = 'MANOP’s figures are indicative calculations from the buyer’s own inputs. They are not a lender decision, an approval or an offer. Developers and lenders confirm their own terms.'

export function buildInternalSummary(r: HandoverRequest): string {
  const miss = missingInformation(r)
  return [
    `MANOP ${r.kind === 'introduction' ? 'INTRODUCTION' : 'FINANCING REQUEST'} (internal)`,
    line('Reference', r.reference),
    ...(r.linked_references.length ? [`Linked: ${r.linked_references.map(clean).join(', ')}`] : []),
    line('Submitted', dateText(r.submitted_at)),
    line('Status', r.status),
    line('Responsible', r.assigned_to),
    '',
    'BUYER',
    line('Name', r.requester.name),
    line('Email', r.requester.email),
    line('Phone', r.requester.phone),
    line('City', r.requester.city),
    ...(r.requester.is_diaspora ? [line('Based in', r.requester.country)] : []),
    '',
    'DEVELOPMENT AND UNIT',
    line('Development', r.development.name ?? r.development.address),
    line('Unit', r.development.unit_label),
    line('Recorded price', r.development.price_text),
    line('Price status', r.development.price_status),
    line('Payment terms', r.payment_terms),
    '',
    'REQUEST',
    line('Pathway', r.pathway),
    line('Estimated price used', ngn(r.financing.price_ngn)),
    line('Loan requested', ngn(r.financing.loan_ngn)),
    line('Deposit', ngn(r.financing.deposit_ngn)),
    line('Tenure (months)', r.financing.tenure_months),
    line('Employment', r.financing.employment),
    line('Income range', r.financing.income_range),
    line('Scenario', r.scenario.reference ? `${r.scenario.reference} (saved)` : r.scenario.saved === false ? 'NOT saved (figures in notes)' : 'none'),
    ...(r.scenario.summary ? [`Declared figures: ${clean(r.scenario.summary)}`] : []),
    ...(r.buyer_message ? ['', `Buyer message: ${clean(r.buyer_message)}`] : []),
    '',
    'CONSENT AND ROUTING',
    line('Enquiry consent recorded', r.consent.enquiry_consent ? 'yes' : 'no'),
    line('Agreed to share with the developer', r.consent.attribution_acknowledged == null ? 'n/a' : r.consent.attribution_acknowledged ? 'yes' : 'no'),
    line('Routing', r.routing),
    line('Developer', r.developer.company),
    line('Developer account claimed', r.developer.claimed == null ? 'unknown' : r.developer.claimed ? 'yes' : 'no'),
    line('Developer contact on file (MANOP-recorded, not verified)', r.developer.contact_email),
    '',
    `MISSING INFORMATION: ${miss.length ? '' : 'none identified'}`,
    ...miss.map(x => `- ${x}`),
    '',
    `NEXT ACTION: ${nextAction(r)}`,
    ...(r.notes ? ['', `Notes: ${clean(r.notes)}`] : []),
    '',
    DISCLAIMER,
  ].join('\n')
}

export function buildDeveloperRequest(r: HandoverRequest, opts: { shareBuyerWithDeveloper?: boolean } = {}): string {
  const share = !!opts.shareBuyerWithDeveloper && r.consent.attribution_acknowledged === true
  const wants = r.pathway ? clean(r.pathway) : 'information about this unit'
  return [
    `Subject: MANOP enquiry ${r.reference}: ${clean(r.development.name ?? r.development.address) || 'your development'}${r.development.unit_label ? `, ${clean(r.development.unit_label)}` : ''}`,
    '',
    'Hello,',
    '',
    `A prospective buyer has asked MANOP about ${wants} for the unit below. MANOP is passing the question on and is not negotiating on your behalf or claiming to represent you.`,
    '',
    line('MANOP reference', r.reference),
    line('Development', r.development.name ?? r.development.address),
    line('Unit', r.development.unit_label),
    line('Price MANOP has on record', r.development.price_text),
    line('Payment terms MANOP has on record', r.payment_terms),
    '',
    'Could you please confirm:',
    '1. That the unit is still available and the price above is current.',
    '2. The deposit required and the structure of the payments after the deposit (amounts, dates or milestones).',
    '3. Whether any reservation or other fee applies, and what it covers.',
    '4. Whether a developer payment plan is open to this buyer, and on what conditions.',
    ...(r.buyer_message ? ['', `The buyer's question: ${clean(r.buyer_message)}`] : []),
    '',
    share
      ? `Buyer (shared with their agreement): ${clean(r.requester.name)}${r.requester.phone ? `, ${clean(r.requester.phone)}` : ''}${r.requester.email ? `, ${clean(r.requester.email)}` : ''}.`
      : 'The buyer’s identity and contact details are not included. MANOP will share them only with the buyer’s agreement.',
    '',
    `Please reply to MANOP quoting ${r.reference}. Your answer will be recorded as information supplied by you; MANOP does not treat it as a confirmed payment schedule until it has been reviewed.`,
  ].join('\n')
}

export function buildPartnerEnquiry(r: HandoverRequest, opts: { shareContactWithPartner?: boolean } = {}): string {
  const first = clean(r.requester.name).split(/\s+/)[0] || 'The applicant'
  return [
    `Subject: Financing enquiry ${r.reference}`,
    '',
    'Hello,',
    '',
    `MANOP is writing about an applicant who asked about ${clean(r.pathway) || 'financing'} for a property. Figures are the applicant's own declared inputs.`,
    '',
    line('MANOP reference', r.reference),
    line('Applicant', `${first}, ${clean(r.requester.city) || 'city not recorded'}${r.requester.is_diaspora ? `, based in ${clean(r.requester.country) || 'country not recorded'}` : ''}`),
    line('Property', r.development.name ?? r.development.address),
    line('Unit', r.development.unit_label),
    line('Price used', ngn(r.financing.price_ngn)),
    line('Deposit available', ngn(r.financing.deposit_ngn)),
    line('Loan sought', ngn(r.financing.loan_ngn)),
    line('Tenure (months)', r.financing.tenure_months),
    line('Employment', r.financing.employment),
    line('Income range', r.financing.income_range),
    ...(r.scenario.summary ? [`Applicant's scenario: ${clean(r.scenario.summary)}`] : []),
    '',
    opts.shareContactWithPartner
      ? `Contact (released with the applicant's agreement): ${clean(r.requester.phone) || 'no phone'}, ${clean(r.requester.email) || 'no email'}.`
      : 'Contact details are withheld until MANOP confirms the applicant agrees to their release.',
    '',
    'Please tell us which of your products, if any, are relevant and what you need from the applicant. Eligibility and terms are yours to decide; MANOP makes no commitment on your behalf or the applicant’s.',
  ].join('\n')
}

// ── Normalisers: one canonical shape from each source row ───────────────────────────────────────────────
const get = (o: any, k: string) => (o && o[k] !== undefined ? o[k] : null)

export function fromFinancingRequest(row: any, extra: { analysis?: any; assignedName?: string | null } = {}): HandoverRequest {
  const notes: string = clean(get(row, 'notes'))
  const intro = /Introduction\s+([A-Za-z0-9-]+)/.exec(notes)?.[1] ?? null
  const unit = /Unit:\s*([^()]+?)\s*\(/.exec(notes)?.[1] ?? null
  const notSaved = /Scenario NOT saved/i.test(notes)
  const declared = /Declared figures:\s*([^]*?)(?:\.\s|$)/i.exec(notes)?.[1] ?? null
  const id = String(get(row, 'id') ?? '')
  const a = extra.analysis
  return {
    kind: 'financing_request',
    reference: `FIN-${id.slice(0, 8).toUpperCase()}`,
    linked_references: [intro ? `Introduction ${intro}` : null, a?.reference ? `Scenario ${a.reference}` : null].filter(Boolean) as string[],
    submitted_at: get(row, 'submitted_at'),
    status: String(get(row, 'status') ?? 'submitted'),
    requester: { name: get(row, 'buyer_name'), email: get(row, 'buyer_email'), phone: get(row, 'buyer_phone'), city: get(row, 'buyer_city'), is_diaspora: get(row, 'is_diaspora'), country: get(row, 'country_of_residence') },
    development: { name: null, address: get(row, 'property_address'), unit_label: unit, price_text: ngn(get(row, 'estimated_price_ngn')), price_status: null },
    pathway: get(row, 'financing_type') ? String(get(row, 'financing_type')).replace(/_/g, ' ') : null,
    financing: {
      loan_ngn: get(row, 'loan_amount_requested'), deposit_ngn: get(row, 'down_payment_ngn'), tenure_months: get(row, 'tenure_months'),
      employment: get(row, 'employment_status'), income_range: get(row, 'monthly_income_range'), price_ngn: get(row, 'estimated_price_ngn'),
    },
    scenario: { reference: a?.reference ?? null, saved: get(row, 'finance_analysis_id') ? true : (notSaved ? false : null), summary: a ? null : declared },
    payment_terms: null,
    buyer_message: null,
    consent: { enquiry_consent: /consent acknowledged/i.test(notes), attribution_acknowledged: null },
    notes: notes || null,
    developer: { company: null, claimed: null, contact_email: null },
    routing: null,
    assigned_to: extra.assignedName ?? null,
  }
}

export function fromIntroduction(lead: any, extra: { developer?: any; project?: any; assignedName?: string | null } = {}): HandoverRequest {
  const d = extra.developer
  const note: string = clean(get(lead, 'note'))
  const price = get(lead, 'unit_price_ngn')
  const terms = /(Payment terms shown to buyer:[^·]*|Developer plan shown:[^·]*)/i.exec(note)?.[1] ?? null
  return {
    kind: 'introduction',
    reference: String(get(lead, 'manop_lead_id') ?? `LEAD-${String(get(lead, 'id') ?? '').slice(0, 8).toUpperCase()}`),
    linked_references: [],
    submitted_at: get(lead, 'created_at'),
    status: String(get(lead, 'stage') ?? 'new'),
    requester: { name: get(lead, 'name'), email: get(lead, 'email'), phone: get(lead, 'phone'), city: null, is_diaspora: get(lead, 'is_diaspora'), country: get(lead, 'country') },
    development: {
      name: extra.project?.name ?? null, address: extra.project?.city ?? null,
      unit_label: get(lead, 'unit_type_label') ?? get(lead, 'unit_interest'),
      price_text: typeof price === 'number' ? ngn(price) : null, price_status: get(lead, 'unit_price_status'),
    },
    pathway: get(lead, 'request_purpose') ? `${String(get(lead, 'request_purpose')).replace(/_/g, ' ')}${get(lead, 'financing_type') ? ` (${String(get(lead, 'financing_type')).replace(/_/g, ' ')})` : ''}` : null,
    financing: { loan_ngn: null, deposit_ngn: null, tenure_months: null, employment: null, income_range: null, price_ngn: typeof price === 'number' ? price : null },
    scenario: { reference: null, saved: null, summary: null },
    payment_terms: terms ? clean(terms) : null,
    buyer_message: note || null,
    consent: { enquiry_consent: /consent acknowledged/i.test(note) || !!get(lead, 'attribution_acknowledged_at'), attribution_acknowledged: !!get(lead, 'attribution_acknowledged_at') },
    notes: null,
    developer: { company: d?.company_name ?? null, claimed: d ? !!d.auth_user_id : null, contact_email: d?.email ?? null },
    routing: get(lead, 'routing_status'),
    assigned_to: extra.assignedName ?? null,
  }
}