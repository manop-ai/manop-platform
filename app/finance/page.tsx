// app/finance/page.tsx
//
// Front door for MANOP Finance Intelligence. Not a separate product: it points into the places where finance already lives (a development's
// "Get Financed" flow, Investment Intelligence, Construction Appraisal in Site Studio) and says plainly which parts are live and which are not yet.
// Status labels are deliberate: nothing is presented as available unless a real route or flow exists for it today.
//
// Server component: the theme follows the site-wide light/dark choice with no flash, and the page carries real metadata. The earlier stock photograph
// is gone; the picture is an illustrative diagram built from the page's own content.
import Link from 'next/link'
import type { Metadata } from 'next'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight, Wallet, LineChart, HardHat, CalendarClock, Landmark, ShieldCheck, Sigma, CircleHelp } from 'lucide-react'
import '../../components/home/home.css'
import '../../components/public/pub.css'
import { SITE_URL } from '../../lib/market-intelligence'

export const metadata: Metadata = {
  title: 'Finance Intelligence | MANOP',
  description: 'Understand what an opportunity means financially before you commit further: buyer affordability, payment plans, investment analysis and development economics, each traced to the numbers behind it. MANOP is not a lender.',
  alternates: { canonical: `${SITE_URL}/finance` },
  openGraph: { title: 'Finance Intelligence | MANOP', description: 'Affordability, payment plans, investment analysis and development economics, with every figure traced to its inputs.', url: `${SITE_URL}/finance`, type: 'website' },
}

type Status = 'available' | 'in_development'
interface Module { title: string; icon: LucideIcon; status: Status; who: string; body: string; where: string; href?: string; cta?: string }

const MODULES: Module[] = [
  { title: 'Affordability Assessment', icon: Wallet, status: 'available', who: 'For buyers',
    body: 'Set a property price against the deposit you have. See the amount you would need to borrow, the loan-to-value, an indicative monthly repayment and the cash needed now, using your own assumptions.',
    where: 'Reachable from “Get Financed” on any reviewed development. Saved assessments carry a MANOP reference and surface again in My Finance.',
    href: '/developments', cta: 'Browse reviewed developments' },
  { title: 'Payment Plan Intelligence', icon: CalendarClock, status: 'available', who: 'For buyers',
    body: 'Turns a developer’s own deposit and instalment schedule into a buyer cashflow: the deposit due, the recurring monthly burden and how long it runs, using the actual terms that unit’s developer has published.',
    where: 'Shown inline on unit pricing for reviewed developments where the developer has set deposit and instalment terms.' },
  { title: 'Investment Intelligence', icon: LineChart, status: 'available', who: 'For investors',
    body: 'Rent, operating costs and financing structure in; gross yield, net income, debt service, cash-on-cash and debt cover out. Every figure traces back to the numbers you entered.',
    where: 'Available now. No account is needed to run an analysis.', href: '/calculator', cta: 'Open Investment Intelligence' },
  { title: 'Construction Appraisal', icon: HardHat, status: 'available', who: 'For developers',
    body: 'Development economics for a site scenario: gross development value, build and professional costs, finance cost and required profit, leading to an indicative residual land value with sensitivity.',
    where: 'Runs on scenarios created in Site Studio. Detailed quantity take-offs and cost plans are not part of it yet.', href: '/site-intelligence/studio', cta: 'Go to Site Studio' },
  { title: 'Finance Suitability', icon: Landmark, status: 'in_development', who: 'Mortgage, NHF and diaspora products',
    body: 'Compares a property against published lender criteria. Only ever shown with its source and the date it was last checked, and withdrawn when that information goes stale.',
    where: 'The matching engine is live inside Get Financed. It has no lender products to compare against yet, so it currently shows that honestly rather than a result.' },
]
const STATUS_LABEL: Record<Status, string> = { available: 'Available', in_development: 'In development' }

const PRINCIPLES = [
  { icon: Sigma, title: 'Calculated, not guessed', body: 'Repayments, yields, debt cover and appraisal arithmetic come from a deterministic engine. Language models explain results; they never produce the numbers.' },
  { icon: ShieldCheck, title: 'Sourced and dated', body: 'Anything drawn from a lender or public source carries where it came from and when it was last checked. Stale information is withdrawn, not shown as current.' },
  { icon: CircleHelp, title: 'Unknown stays unknown', body: 'Where evidence is missing, MANOP says so. Your own assumptions are labelled as yours. They are never quietly promoted to facts.' },
]

function Diagram() {
  return (
    <div className="pg-dia" role="img" aria-label="Illustration: buyer affordability and payment plans on one side, investment analysis and development economics on the other, both connected to the development. Financing pathways are in development.">
      <div className="cols" aria-hidden="true">
        <div className="col"><small>Buyer side</small><span>Affordability</span><span>Payment plan cashflow</span></div>
        <div className="col"><small>Investor and developer side</small><span>Investment analysis</span><span>Construction Appraisal</span></div>
      </div>
      <div className="mid" aria-hidden="true">One development</div>
      <div className="path" aria-hidden="true"><b>In development:</b> matching to published mortgage, NHF and diaspora products. Information only; MANOP does not lend, arrange or approve finance.</div>
    </div>
  )
}

export default function FinanceOverviewPage() {
  return (
    <div className="hm">
      {/* HERO */}
      <section className="pg-hero">
        <div className="hm-wrap pg-two">
          <div>
            <span className="hm-eyebrow">Finance Intelligence</span>
            <h1 className="pg-h1">Understand what an opportunity means financially, before you commit further.</h1>
            <p className="pg-lead">MANOP makes the financial implications of a property, an investment or a site clearer: what it would cost, what it could produce, which assumptions drive the answer and what is still unknown.</p>
            <p className="pg-small">Lenders make lending decisions. MANOP does not.</p>
            <div className="pg-cta">
              <Link href="/calculator" className="hm-btn p">Open Investment Intelligence <ArrowRight size={16} /></Link>
              <Link href="/developments" className="hm-btn g">Browse reviewed developments</Link>
            </div>
          </div>
          <Diagram />
        </div>
      </section>

      {/* MODULES */}
      <section className="pg-sec pg-alt">
        <div className="hm-wrap">
          <span className="hm-eyebrow">What is here</span>
          <h2 className="pg-h2">Five parts, with their real status.</h2>
          <p className="hm-lead">Finance Intelligence is not a separate product. It sits where finance questions already arise, and it says plainly which parts are available today and which are not yet.</p>
          <div className="pg-cards">
            {MODULES.map(m => {
              const Icon = m.icon
              return (
                <div className="pg-card" key={m.title}>
                  <div className="pg-top">
                    <span className="pg-ico"><Icon size={20} /></span>
                    <span className={`pg-chip ${m.status === 'available' ? 'on' : 'dev'}`}>{STATUS_LABEL[m.status]}</span>
                  </div>
                  <span className="pg-for">{m.who}</span>
                  <h3>{m.title}</h3>
                  <p>{m.body}</p>
                  <div className="where">{m.where}</div>
                  {m.href && <Link href={m.href} className="pg-link">{m.cta} <ArrowRight size={15} /></Link>}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* TWO SIDES */}
      <section className="pg-sec">
        <div className="hm-wrap">
          <span className="hm-eyebrow">Who it helps</span>
          <h2 className="pg-h2">Two sides of finance, around one development.</h2>
          <div className="pg-split even">
            <div className="pg-box yes">
              <h3>Buyers</h3>
              <ul>
                <li>See how much you would need to borrow and the cash needed now, from your own deposit.</li>
                <li>Understand a developer’s payment plan as a monthly burden and how long it runs.</li>
                <li>Know what you are committing to before you go further.</li>
              </ul>
            </div>
            <div className="pg-box yes">
              <h3>Investors and developers</h3>
              <ul>
                <li>Test yield, income, debt service and debt cover on your own assumptions.</li>
                <li>Appraise a site scenario: costs, finance cost, required profit and an indicative residual land value.</li>
                <li>See which assumptions move the answer most, through sensitivity.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* HONEST */}
      <section className="pg-sec pg-alt">
        <div className="hm-wrap">
          <span className="hm-eyebrow">How we keep it honest</span>
          <h2 className="pg-h2">Every number says where it came from.</h2>
          <div className="pg-pr">
            {PRINCIPLES.map(p => (
              <div key={p.title}><p.icon size={20} /><b>{p.title}</b><p>{p.body}</p></div>
            ))}
          </div>
          <p className="pg-fine">Everything in Finance Intelligence is indicative and based on the information provided. It is not financial, legal or investment advice, and it is not a lender decision. Final terms depend on lender underwriting, valuation, title review and your eligibility.</p>
        </div>
      </section>
    </div>
  )
}