// components/dossier/DossierView.tsx — presentation of one published development's dossier. Data is fetched (and gated) by
// app/development/[id]/page.tsx and passed in; nothing here reads the database. All information the old page showed is kept:
// overview, diaspora logistics, units and pricing (with developer payment plans and comparables context), MANOP review,
// the evidence register, the construction timeline, public documents, and every action (save, Buyer Pack, enquire, finance).
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import './dossier.css'
import DossierGallery, { type GalleryItem } from './DossierGallery'
import DossierTabs, { type DossierSection } from './DossierTabs'
import EvidenceExplorer, { type EvidenceRow } from './EvidenceExplorer'
import GatedDeveloperName from '../GatedDeveloperName'
import DevelopmentEnquiryModal from '../DevelopmentEnquiryModal'
import DevelopmentFinancingLauncher from '../DevelopmentFinancingLauncher'
import SaveDevelopmentButton from '../SaveDevelopmentButton'
import BuyerPackButton from '../BuyerPackButton'
import CurrencyContext from '../CurrencyContext'
import { isPublicDocument, DOC_STATUS_LABEL, type DocStatus } from '../../lib/documents-access'
import { calculateUnitPaymentPlan } from '../../lib/finance-intelligence'
import { ngnShort, toParagraphs } from '../../lib/dossier-format'

export interface DossierData {
  project: any
  units: any[]
  documents: any[]
  evidence: EvidenceRow[]
  updates: any[]
  priceContextLines: string[]
  media: GalleryItem[]
}

const POSTED_BY: Record<string, string> = { admin: 'MANOP', developer: 'The developer', agency: 'Submitting agency' }
// Who stands behind an update. "MANOP-confirmed" is only for an update MANOP marked as verified. An update MANOP entered on the developer's behalf
// is shown as relayed, so a buyer is never told MANOP checked something it only passed on.
function progressLabel(u: { posted_by_role: string }, confirmed: boolean) {
  if (confirmed) return 'MANOP-confirmed'
  if (u.posted_by_role === 'admin') return 'Relayed by MANOP from the developer, not yet verified by MANOP'
  return `Reported by ${POSTED_BY[u.posted_by_role] || u.posted_by_role}, not verified by MANOP`
}
const updImg = (u: string, w: number) => {
  const m = u.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/)
  return m ? `${m[1]}f_auto,q_auto,w_${w},c_limit/${m[2]}` : u
}
const STAGES = ['Planning', 'Foundation', 'Structure', 'Finishing', 'Completed']
const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function DossierView({ data, dark }: { data: DossierData; dark: boolean }) {
  const { project, units, documents, evidence, updates, priceContextLines, media } = data
  const prices = units.map(u => Number(u.price_ngn)).filter(n => Number.isFinite(n) && n > 0)
  const fromPrice = prices.length ? ngnShort(Math.min(...prices)) : null
  const firstPricedUnitId = units.find(u => u.price_ngn)?.id ?? null
  const publicDocs = documents.filter(isPublicDocument)
  const hiddenDocs = documents.length - publicDocs.length
  const backed = evidence.filter(e => ['independently_verified', 'documented', 'manop_observed', 'manop_derived'].includes(e.status)).length
  const stageIdx = STAGES.findIndex(s => String(project.stage ?? '').toLowerCase().includes(s.toLowerCase()))

  const checked = toParagraphs(project.manop_checked_note)
  const flags = toParagraphs(project.manop_flag_note)

  const diaspora: [boolean, string][] = [
    [!!project.virtual_viewing, 'Virtual viewing'], [!!project.remote_purchase, 'Remote purchase'],
    [!!project.poa_process, 'Power of Attorney process'], [!!project.international_payment, 'International payment'],
  ]

  const overview = (
    <div>
      <h2 className="dx-h2">Overview</h2>
      {project.description
        ? <div className="dx-prose">{toParagraphs(project.description, 3, 520).map((p, i) => <p key={i}>{p}</p>)}</div>
        : <p className="dx-sub">No description has been provided for this development yet.</p>}
      <div className="dx-label" style={{ marginTop: 22 }}>For buyers abroad</div>
      <div className="dx-chips">
        {diaspora.some(([v]) => v)
          ? diaspora.filter(([v]) => v).map(([, l]) => <span key={l} className="dx-chip"><CheckCircle2 size={13} /> {l}</span>)
          : <span className="dx-chip off">Not yet confirmed by the developer</span>}
      </div>
    </div>
  )

  const unitsPanel = (
    <div>
      <h2 className="dx-h2">Units &amp; pricing</h2>
      <p className="dx-sub">Prices are the developer&apos;s published prices. Where a developer payment plan is recorded it is shown with the unit.</p>
      {units.length === 0 && <div className="dx-empty">Pricing has not been published for this development yet.</div>}
      <div className="dx-units">
        {units.map(u => {
          const plan = u.price_ngn && u.deposit_pct && u.installment_months
            ? calculateUnitPaymentPlan({ price_ngn: Number(u.price_ngn), deposit_pct: Number(u.deposit_pct), installment_months: Number(u.installment_months) })
            : null
          return (
            <div key={u.id} className="dx-unit">
              <div>
                <h3>{u.unit_type}</h3>
                <div className="meta">{u.size_sqm ? <span>{u.size_sqm} sqm</span> : null}{u.available_count === 0 ? <span style={{ color: 'var(--dx-teal, #0F766E)', fontWeight: 700 }}>Sold out, per the developer</span> : u.available_count == null ? <span>Availability not stated</span> : <span>{u.available_count}{u.quantity != null && u.quantity >= u.available_count ? ` of ${u.quantity}` : ''} available, per the developer</span>}</div>
              </div>
              <div>
                <div className="p">{u.price_ngn ? `₦${Number(u.price_ngn).toLocaleString()}` : 'Price not published'}</div>
                {u.price_usd && <div className="usd">≈ ${Number(u.price_usd).toLocaleString()}</div>}
                {u.price_ngn && u.id === firstPricedUnitId && <CurrencyContext amountNgn={Number(u.price_ngn)} dark={dark} />}
              </div>
              {plan && (
                <div className="dx-plan">
                  <div className="dx-label" style={{ margin: 0 }}>Developer payment plan</div>
                  <div className="dx-plan-bar"><i style={{ width: `${Math.min(100, Number(u.deposit_pct))}%` }} /><b /></div>
                  <p><strong>₦{plan.deposit_ngn.toLocaleString()}</strong> deposit ({u.deposit_pct}%), then <strong>₦{Math.round(plan.monthly_installment_ngn).toLocaleString()}</strong>/month for {plan.installment_months} months.</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {priceContextLines.length > 0 && <div className="dx-ctx">{priceContextLines.map((l, i) => <div key={i}>{l}</div>)}</div>}
    </div>
  )

  const review = (
    <div>
      <h2 className="dx-h2">MANOP review</h2>
      <p className="dx-sub">What MANOP looked at and what it noted. {project.reviewed_at ? `Reviewed ${fmtDate(project.reviewed_at)}.` : 'Not yet reviewed by MANOP.'}</p>
      <div className="dx-review">
        <div className="dx-rev a">
          <h3>What we checked</h3>
          {checked.length ? checked.map((p, i) => <p key={i}>{p}</p>) : <p>Not yet documented.</p>}
        </div>
        <div className="dx-rev b">
          <h3>Considerations</h3>
          {flags.length ? flags.map((p, i) => <p key={i}>{p}</p>) : <p>No specific considerations recorded.</p>}
        </div>
      </div>
      <div className="dx-legal">Information reviewed by MANOP. This is not financial, legal, or investment advice — independent due diligence is required before any decision.</div>
    </div>
  )

  const evidencePanel = evidence.length
    ? <EvidenceExplorer rows={evidence} />
    : <div><h2 className="dx-h2">What MANOP knows</h2><div className="dx-empty">No claims have been recorded in the evidence register for this development yet.</div></div>

  const progress = (
    <div>
      <h2 className="dx-h2">Construction progress</h2>
      <p className="dx-sub">Each update is labelled by who reported it. A developer&apos;s report is not shown as MANOP-confirmed.</p>
      {project.stage && (
        <div className="dx-stage" aria-label="Current stage">
          {stageIdx >= 0 ? STAGES.map((s, i) => <span key={s} className={i <= stageIdx ? 'on' : ''}>{s}</span>) : <span className="on">{project.stage}</span>}
        </div>
      )}
      {updates.length === 0 && <div className="dx-empty">No construction updates have been posted yet.</div>}
      <div className="dx-tl">
        {updates.map((u, i) => {
          const ok = u.verification_status === 'manop_confirmed'
          return (
            <div key={i} className={ok ? 'ok' : ''}>
              <h4>{u.title}</h4>
              <div className="d">{fmtDate(u.posted_at)}{u.stage_at_time ? ` · ${u.stage_at_time}` : ''}{u.completion_pct_at_time != null ? ` · ${u.completion_pct_at_time}% complete` : ''}</div>
              {u.body && <p>{u.body}</p>}
              {(u.availability ?? []).length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 4, fontSize: 13, color: 'var(--dx-muted)' }}>
                  {u.availability.map((c: any, k: number) => (
                    <li key={k}><strong style={{ color: 'var(--dx-text)' }}>{c.unit_label}</strong>: {c.previous_value ?? '—'} → {c.new_value === 0 ? 'sold out' : `${c.new_value} available`}</li>
                  ))}
                </ul>
              )}
              {Array.isArray(u.media_urls) && u.media_urls.length > 0 && (
                <div className="dx-ph">
                  {u.media_urls.filter((s: unknown) => typeof s === 'string' && /^https:\/\//.test(s as string)).map((src: string, k: number) => (
                    <a key={k} href={src} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={updImg(src, 480)} alt={`${u.title}, photo ${k + 1}`} loading="lazy" />
                    </a>
                  ))}
                </div>
              )}
              <div className="m" style={{ color: ok ? 'var(--dx-green)' : 'var(--dx-teal, #0F766E)' }}>{progressLabel(u, ok)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const docs = (
    <div>
      <h2 className="dx-h2">Documents</h2>
      <p className="dx-sub">Only documents MANOP has approved for public viewing are listed. Private documents are counted but never named.</p>
      {publicDocs.length === 0 && <div className="dx-empty">No documents have been made public for this development yet.</div>}
      <div className="dx-docs">
        {publicDocs.map((d: any, i: number) => {
          const reviewed = d.status === 'reviewed' || d.verified
          return (
            <div key={d.id ?? i} className="dx-doc">
              <a href={`/api/documents/${d.id}/file?r=1`} target="_blank" rel="noopener noreferrer">{d.document_name || String(d.document_type ?? 'Document').replace(/_/g, ' ')}</a>
              <span className={reviewed ? 'ok' : ''}>{reviewed ? <><CheckCircle2 size={13} /> Reviewed by MANOP</> : DOC_STATUS_LABEL[(d.status ?? 'provided') as DocStatus]}</span>
            </div>
          )
        })}
      </div>
      {hiddenDocs > 0 && <p className="dx-note">{hiddenDocs} further document{hiddenDocs === 1 ? '' : 's'} submitted for MANOP&apos;s review and held private.</p>}
      <p className="dx-note">A public document has been approved for viewing. It has not been certified by MANOP.</p>
    </div>
  )

  const sections: DossierSection[] = [
    { id: 'overview', label: 'Overview', node: overview },
    { id: 'units', label: 'Units', badge: units.length || '', node: unitsPanel },
    { id: 'review', label: 'MANOP review', node: review },
    { id: 'evidence', label: 'Evidence', badge: evidence.length || '', node: evidencePanel },
    { id: 'progress', label: 'Progress', badge: updates.length || '', node: progress },
    { id: 'documents', label: 'Documents', badge: publicDocs.length || '', node: docs },
  ]

  return (
    <div className="dx">
      <div className="dx-wrap">
        <nav className="dx-crumb" aria-label="Breadcrumb"><Link href="/developments">Reviewed developments</Link><span>/</span><span>{project.name}</span></nav>

        <DossierGallery media={media} alt={project.name} />

        <header className="dx-head">
          <div>
            <span className="dx-eyebrow"><i /> MANOP reviewed development</span>
            <h1 className="dx-title">{project.name}</h1>
            <div className="dx-loc"><GatedDeveloperName developerId={project.developer_id} dark={dark} /> · {[project.neighborhood, project.city].filter(Boolean).join(', ')}</div>
          </div>
          {project.reviewed_at && <span className="dx-seal">MANOP reviewed · {fmtDate(project.reviewed_at)}</span>}
        </header>

        <div className="dx-facts">
          <div className="dx-fact"><small>From</small><b className="price">{fromPrice ?? '—'}</b></div>
          <div className="dx-fact"><small>Stage</small><b>{project.stage || '—'}</b></div>
          <div className="dx-fact"><small>Total units</small><b>{project.total_units ?? '—'}</b></div>
          <div className="dx-fact"><small>Handover</small><b>{fmtDate(project.handover_date)}</b></div>
          <div className="dx-fact"><small>Evidence</small><b>{evidence.length ? `${backed} of ${evidence.length} backed` : 'None yet'}</b></div>
        </div>

        <div className="dx-grid">
          <main><DossierTabs sections={sections} /></main>

          <aside className="dx-aside">
            <div className="dx-card" id="dx-actions">
              {fromPrice && <div className="dx-from"><small>Units from</small>{fromPrice}</div>}
              <div style={{ display: 'grid', gap: 10, marginTop: fromPrice ? 16 : 0 }}>
                <DevelopmentEnquiryModal developerId={project.developer_id} projectId={project.id} units={units} neighborhood={project.neighborhood} city={project.city} countryCode={project.country_code} dark={dark} />
                <DevelopmentFinancingLauncher developerId={project.developer_id} projectId={project.id} units={units} developmentName={project.name} dark={dark} />
              </div>
              <p className="dx-note">Your enquiry goes to MANOP first, which routes it to the right party.</p>
            </div>
            <div className="dx-card">
              <div className="dx-label">Keep and share</div>
              <div style={{ display: 'grid', gap: 10 }}>
                <SaveDevelopmentButton projectId={project.id} />
                <BuyerPackButton projectId={project.id} dark={dark} />
              </div>
            </div>
            <div className="dx-card">
              <div className="dx-label">Developer</div>
              <GatedDeveloperName developerId={project.developer_id} fields="full" dark={dark} />
            </div>
          </aside>
        </div>
      </div>

      {/* phones: a persistent bar so the main action is never a long scroll away */}
      <div className="dx-bar">
        <div>{fromPrice ? <><small>Units from</small><b>{fromPrice}</b></> : <b>{project.name}</b>}</div>
        <a href="#dx-actions">Enquire or get financed</a>
      </div>
    </div>
  )
}