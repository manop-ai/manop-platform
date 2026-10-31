// app/page.tsx — MANOP home page.
// Redesigned 30 Oct: editorial layout, an interactive tour of what a dossier contains, and real reviewed developments up front. Server
// component: the data fetch is plain and public (published developments only, the same filter the /developments page uses); the interactive
// parts are small client islands in components/home. Copy refined 30 Oct to company-level positioning: intelligence and trust infrastructure for African real estate and the built
// environment, current focus Nigeria; Reviewed Developments is one available entry point, not the whole company. The previous home page is kept in git history.
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import '../components/home/home.css'
import { HeroSlides, HeroSearch } from '../components/home/HeroClient'
import DossierTour from '../components/home/DossierTour'
import StoryScene from '../components/home/StoryScene'
import { sbServerRead as sb } from '../lib/supabase/server-read'
import { ngnShort } from '../lib/dossier-format'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const HERO = ['third_mainland_bridge_hsrqwb', 'island_view_jb7cfx', 'lagos-ikoyi_image_dtgde3', 'lagos_ajah_image_maz1sc']
  .map(id => `https://res.cloudinary.com/dkmb8uazj/image/upload/f_auto,q_auto,w_2000,c_fill/${id}`)

const cld = (u: string, w: number) => {
  const m = u.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/)
  return m ? `${m[1]}f_auto,q_auto,w_${w},c_fill,ar_4:3/${m[2]}` : u
}

async function loadFeatured() {
  try {
    const { data: projects } = await sb
      .from('developer_projects')
      .select('id,name,neighborhood,city,stage,images,reviewed_at')
      .eq('publish_status', 'published')
      .order('reviewed_at', { ascending: false })
      .limit(6)
    if (!projects?.length) return []
    const { data: units } = await sb.from('developer_unit_types').select('project_id,price_ngn').in('project_id', projects.map(p => p.id))
    return projects.map(p => {
      const prices = (units ?? []).filter(u => u.project_id === p.id).map(u => Number(u.price_ngn)).filter(n => n > 0)
      return { ...p, from: prices.length ? ngnShort(Math.min(...prices)) : null }
    })
  } catch { return [] }
}

const FAQ: [string, string][] = [
  ['What is MANOP?', 'MANOP is building intelligence and trust infrastructure for African real estate and the built environment. It brings together information about sites, developments, markets and finance, with the evidence and context behind it, so people can understand an opportunity before making an important decision. Some of this is available today and some is still being built.'],
  ['Is MANOP a property listing marketplace?', 'No. MANOP is not built to list properties for sale. It is building an intelligence layer that helps people understand opportunities, their surroundings, the supporting evidence and the financial implications. Selected developments appear on MANOP as structured, reviewed records rather than advertisements.'],
  ['What does MANOP mean by real estate intelligence?', 'Bringing together what is known about a site, a development or a market, such as location, planning context, developer claims, evidence, pricing, supply and demand signals and finance, and showing clearly what is supported, what is only claimed and what is still unknown. The longer-term direction is to support the journey from site, to understanding, exploration, appraisal, development and market. Not every part of that is operational yet.'],
  ['What does MANOP actually review?', 'For a selected development, MANOP examines the information supplied, such as the brochure, unit schedule, prices, stated stage and handover and any supporting documents. It records, claim by claim, what is backed by a document or by MANOP’s own check, what is only the developer’s statement and what is still open. A review is not a certification, and its depth depends on the information available.'],
  ['Does MANOP recommend developments or guarantee investments?', 'No. MANOP provides information and analytical context, not professional, legal, financial or investment advice, and it does not guarantee outcomes. It does not replace qualified professionals. Independent due diligence is always required before a decision.'],
  ['How does MANOP work with developers and agencies?', 'Developers and agencies can bring opportunities and information to MANOP for review. Submitting an opportunity does not publish it: MANOP reviews it first, and a written agreement with MANOP is completed before a partner-submitted opportunity can be published. Buyer and investor enquiries come to MANOP first, which routes them to the right party.'],
  ['Where does MANOP currently operate?', 'MANOP’s vision is African. Its current operating focus is Nigeria, where it is in private beta, starting with selected new and off-plan developments. It is not yet operating across Africa.'],
  ['How does MANOP earn revenue?', 'Buyers are not charged. MANOP’s fee is agreed in writing with the developer or agency partner and is payable only if a transaction closes.'],
]

export default async function Home() {
  const featured = await loadFeatured()
  return (
    <div className="hm">
      {/* HERO */}
      <section className="hm-hero">
        <HeroSlides images={HERO} />
        <div className="hm-wrap">
          <div>
            <span className="hm-badge"><i /> Private beta · Lagos, Nigeria</span>
            <h1 className="hm-h1">Understand the opportunity <em>before you decide.</em></h1>
            <p className="s">MANOP brings together site, development, market and financial intelligence, so you can understand an opportunity and the context behind it. Evidence and analysis for your own decision, not a recommendation.</p>
            <p className="w">Currently focused on Nigeria, with developers, agencies, investors and buyers, starting with selected new and off-plan developments.</p>
            <div className="hm-cta">
              <Link href="/site-intelligence" className="hm-btn p">Explore Site Intelligence <ArrowRight size={16} /></Link>
              <Link href="/developments" className="hm-btn g">Explore reviewed developments</Link>
            </div>
            <HeroSearch />
          </div>
          <div className="hm-sample" aria-hidden="true">
            <div className="hm-sample-card">
              <div className="hm-sample-top"><span>MANOP dossier</span><span>Illustrative</span></div>
              <h4>Sample Residence</h4>
              <div className="l">Lagos · Foundation stage</div>
              <div className="hm-sample-top" style={{ margin: 0 }}><span>Evidence</span><span>6 claims</span></div>
              <div className="hm-meter"><i style={{ flex: 2, background: '#3B82F6' }} /><i style={{ flex: 2, background: '#2DD4BF' }} /><i style={{ flex: 2, background: '#F5B544' }} /></div>
              <div className="row"><span>Documented or checked by MANOP</span><b>4</b></div>
              <div className="row"><span>Developer’s own statement</span><b>2</b></div>
              <div className="row"><span>Still open</span><b>0</b></div>
              <div className="hm-sample-foot">Every claim carries its source.</div>
            </div>
          </div>
        </div>
      </section>

      {/* PRINCIPLES */}
      <div className="hm-strip">
        <div><b>Traceable evidence</b><span>Each statement shows where it came from, so you can judge it yourself.</span></div>
        <div><b>Claims are not facts</b><span>A developer’s statement is never shown as independently verified. Unverified stays marked.</span></div>
        <div><b>Access by permission</b><span>Private documents are only available through approved permissions.</span></div>
        <div><b>Information, not advice</b><span>MANOP provides information and analytical context, not professional or investment advice.</span></div>
      </div>

      {/* FROM THE GROUND UP — scroll-linked architectural story of the connected capabilities */}
      <StoryScene />

      {/* TOUR */}
      <section className="hm-sec">
        <div className="hm-wrap">
          <span className="hm-eyebrow">What MANOP brings together</span>
          <h2 className="hm-h2">Four kinds of intelligence, one connected view.</h2>
          <p className="hm-lead"><strong>Site Intelligence</strong> looks at land, location, infrastructure and planning context. <strong>Development Intelligence</strong> looks at what a developer claims, the evidence behind it and progress. <strong>Market Intelligence</strong> looks at pricing, supply, demand and activity. <strong>Decision Intelligence</strong> brings the evidence and financial analysis together. They are connected capabilities, at different stages of depth today. The development dossier below shows, as a practical example, how MANOP structures information. Review depth varies by opportunity.</p>
          <DossierTour />
        </div>
      </section>

      {/* FEATURED */}
      <section className="hm-sec hm-alt">
        <div className="hm-wrap">
          <span className="hm-eyebrow">Reviewed developments</span>
          <h2 className="hm-h2">One way to experience MANOP today.</h2>
          <p className="hm-lead">Selected developments are structured and reviewed so you can see the available information, evidence, pricing and relevant considerations in one place.</p>
          {featured.length === 0 ? (
            <div className="hm-empty">Reviewed developments appear here as they are published. <Link href="/developments" style={{ color: 'var(--hm-teal)', fontWeight: 700 }}>Browse all reviewed developments →</Link></div>
          ) : (
            <>
              <div className="hm-feat">
                {featured.map((p: any) => (
                  <Link key={p.id} href={`/development/${p.id}`} className="hm-dev">
                    <div className="im">
                      {p.images?.[0] && /* eslint-disable-next-line @next/next/no-img-element */ <img src={cld(p.images[0], 800)} alt={p.name} loading="lazy" />}
                      <span className="rv">MANOP reviewed</span>
                    </div>
                    <div className="bd">
                      <h3>{p.name}</h3>
                      <div className="l">{[p.neighborhood, p.city].filter(Boolean).join(', ')}</div>
                      <div className="f"><span>{p.stage || 'Stage not stated'}</span>{p.from && <span style={{ textAlign: 'right' }}>Units from<b>{p.from}</b></span>}</div>
                    </div>
                  </Link>
                ))}
              </div>
              <div style={{ marginTop: 28 }}><Link href="/developments" className="hm-btn g">See all reviewed developments <ArrowRight size={16} /></Link></div>
            </>
          )}
        </div>
      </section>

      {/* AUDIENCES */}
      <section className="hm-sec">
        <div className="hm-wrap">
          <span className="hm-eyebrow">Who it is for</span>
          <h2 className="hm-h2">One evidence base. Three ways in.</h2>
          <p className="hm-lead">MANOP is being built with professional market participants and serious users: developers, agencies, investors and buyers, with other built-environment professionals to follow.</p>
          <div className="hm-aud">
            <div className="hm-card">
              <h3>Buyers &amp; the diaspora</h3>
              <p>Understand an opportunity, the evidence behind it, its context, pricing and financial considerations before you commit, from wherever you are.</p>
              <ul><li>Evidence tagged by source</li><li>Pricing context, with a dated currency reference for buyers abroad</li><li>Financing and affordability tools</li></ul>
              <Link className="go" href="/developments">Explore developments →</Link>
            </div>
            <div className="hm-card">
              <h3>Developers</h3>
              <p>Structure your development information, present it with greater clarity and engage serious market participants through a more transparent information record.</p>
              <ul><li>A structured record of your development, with MANOP review</li><li>Enquiries routed through MANOP</li><li>Progress updates that buyers can follow</li></ul>
              <Link className="go" href="/developer/onboard">Join as a developer →</Link>
            </div>
            <div className="hm-card">
              <h3>Agents &amp; landowners</h3>
              <p>Bring relevant opportunities and market information into a structured environment, with review, written agreements and managed introductions where they apply.</p>
              <ul><li>Opportunities are reviewed before any are published</li><li>Written agreements with MANOP</li><li>Introductions managed in a Deal Room</li></ul>
              <Link className="go" href="/agency/onboard">Join as an agency →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="hm-sec hm-alt">
        <div className="hm-wrap">
          <span className="hm-eyebrow">Questions</span>
          <h2 className="hm-h2">Plain answers.</h2>
          <div className="hm-faq">
            {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
          </div>
        </div>
      </section>

      {/* CLOSE */}
      <section className="hm-close">
        <div className="hm-wrap">
          <h2 className="hm-h2">Understand the opportunity behind the decision.</h2>
          <p className="hm-lead">Explore the intelligence MANOP has available today, and see what the evidence says. Start with a site, a reviewed development or a market.</p>
          <div className="hm-cta"><Link href="/register" className="hm-btn p">Create an account <ArrowRight size={16} /></Link><Link href="/site-intelligence" className="hm-btn g">Explore Site Intelligence</Link><Link href="/developments" className="hm-btn g">Explore reviewed developments</Link></div>
        </div>
      </section>
    </div>
  )
}