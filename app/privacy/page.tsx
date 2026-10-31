// app/privacy/page.tsx — a plain description of what MANOP records and who sees it, written from how the platform actually works.
// DRAFT: it has not been through legal review (MANOP arranges that separately). It describes behaviour; it does not add promises the code does not keep.
export const metadata = { title: 'How MANOP handles your details' }

const h2: React.CSSProperties = { fontSize: 18, fontWeight: 800, margin: '26px 0 6px' }
const p: React.CSSProperties = { fontSize: 15, lineHeight: 1.7, margin: '0 0 10px' }

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(1.2rem,5vw,3rem) 16px' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 6px' }}>How MANOP handles your details</h1>
      <p style={{ ...p, opacity: 0.7 }}>Draft, pending legal review. This page describes what the platform does today.</p>

      <h2 style={h2}>When you send an enquiry about a development or opportunity</h2>
      <p style={p}>MANOP records what you enter (your name, phone or email, country, any budget or note, and the unit you asked about). You must tick a consent box before it is sent.</p>
      <p style={p}>MANOP reviews every enquiry first. Only after MANOP routes it do the developer, agency or landowner in charge of that opportunity see your details, so they can contact you. Nobody else on the platform sees them. Sending an enquiry does not commit you to buy anything, and you are never charged by MANOP.</p>
      <p style={p}>MANOP keeps a record of the introduction. This is how MANOP can show who was introduced to whom if a transaction follows.</p>

      <h2 style={h2}>When you use the website</h2>
      <p style={p}>MANOP counts visits so it knows how many people use the platform each month. A random identifier is kept in your own browser, with the page you opened and, if you are signed in, your account. No IP address is stored with a visit. Visits from automated programs and from browsers that send a Do Not Track signal are not counted. Admin pages are not counted.</p>

      <h2 style={h2}>If you register</h2>
      <p style={p}>Your account details and the preferences you set are stored so the platform can work for you. Your own analyses (for example a finance scenario) are shown only to you unless you share them.</p>

      <h2 style={h2}>What MANOP does not do</h2>
      <p style={p}>MANOP does not sell your details. MANOP does not give legal, financial or investment advice; information on the platform is based on the evidence available and may change.</p>
    </main>
  )
}
