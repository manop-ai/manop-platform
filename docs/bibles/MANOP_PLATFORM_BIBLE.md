# MANOP Platform Bible: who uses MANOP, and what each can do today

Written 2026-10-23 from the code in the repository. It describes what the screens and routes are built to do. It was NOT checked in a live browser or against the live database, so anything marked "needs DB step" works only after the named SQL file is applied. Per-user versions are in this folder.

## 1. What MANOP is, in one paragraph
MANOP reviews and publishes information about real-estate developments and sites, lets buyers ask questions and ask for finance, and gives developers, agencies and landowners a controlled way to be introduced to those buyers. MANOP's team sits in the middle: it reviews what is submitted, holds or refers introductions, verifies parties, and records the milestones its commercial agreement depends on. MANOP does not give financial, legal or investment advice and does not approve loans.

## 2. The people and what they get
| User | Signs in at | Lands on | One-line capacity today |
|---|---|---|---|
| Buyer / diaspora buyer | /login | /developments | Browse reviewed developments, download a Buyer Pack, enquire, request finance, message about an introduction |
| Investor | /login | /investor/dashboard | Everything a buyer has, plus Investment Intelligence and Site Intelligence links |
| Developer | /login | /developer/dashboard | Submit projects, post updates, see introductions, take part in the Deal Room, request an agreement |
| Agency | /login | /agency/dashboard | Submit developments with a mandate, see leads, subscription/success-fee route, verification, agreement |
| Landowner / site submitter | /site-intelligence/submit | Site Intelligence | Submit a site for review and appraisal. No dedicated dashboard in the code |
| Association staff | /login | /association/dashboard | Members, verification, chapters, team access (separate product area) |
| MANOP admin | /login | /admin | Reviews, introductions, finance, commercial terms, verification |

Login redirects use the account's role; association and admin rights are checked from the database, never from editable profile data.

## 3. The main journeys
**A. Reviewed development to buyer.** Developer or agency submits a project, MANOP reviews it (/admin/developments/review: requests information, flags, approves), it is published to /developments and /development/[id]. Buyers see only published projects.

**B. Buyer Pack.** On a development page any visitor can press "Download Buyer Pack" (a PDF built live from the current public record; private documents are never included). Today it is free: no approved commercial terms require payment, so access is open. A signed-in buyer's download is recorded and appears under "Buyer Packs" on their dashboard. Setting a price later is a terms change (admin/commercial), not a code change.

**C. Enquiry to introduction.** A buyer enquires on a development, site or general page. It becomes an introduction (a developer_leads row) with its own Deal Room. MANOP can hold it (the developer cannot see it) until MANOP refers it.

**D. Finance.** "Get Financed" on a development or the calculator creates a finance analysis and, if requested, a financing request. The buyer sees analyses under "My Finance" with a side-by-side comparison of lender products on the buyer's own figures. Admin sees requests under Financing and Finance Intelligence and hands them over.

**E. Deal Room.** One room per introduction: conversation, milestones (acknowledged, viewing, offer, reservation, payment reported, agreement executed and so on), stage. Each milestone is a statement by the party who made it. MANOP does not verify milestones or track the buyer's payment schedule.

**F. Commercial layer.** MANOP's terms are versioned data approved by the founder. Agencies pick one of two routes (a transaction success fee with an initial commitment, or a custom subscription assessed and proposed by MANOP; there is no standard subscription price); developers sign an agreement. All figures are PROPOSED until approved, no fee is automatic, and the Deal Room's fee readiness is an indicator for admin review only.

**G. Site Intelligence.** Anyone can submit a site; MANOP reviews it, appraisals and the Site Studio are available from the site page.

## 4. What admin does in each journey
- Reviews submissions (developments, sites) before anything is public.
- Verifies agencies and developers (Verify Queue, /admin/verification). Verification is separate from paying a subscription.
- Holds, refers and follows introductions (/admin/leads); is a party in every Deal Room and can leave internal notes buyers and sellers never see.
- Handles financing requests and lender products (Financing, Finance Intelligence, Lender Products tabs).
- Controls commercial terms, subscriptions, agency routes and agreement requests (/admin/commercial, /admin/agreements).
- Answers buyers and sellers in the Deal Room conversation.

## 5. Not available yet (so nobody is promised it)
- No payment gateway: subscriptions and any fee are confirmed by an admin recording a bank reference.
- No dedicated landowner dashboard; landowner Deal Room is permitted by the rules but has no screen.
- Entitlements per agency route are undefined until the founder decides them, so agencies cannot yet accept a route.
- Email deliverability (the "dangerous" warning) is undiagnosed: needs raw headers and the link target.
- Nothing in this document was exercised in a browser by the author.

## 6. Database steps needed (UNAPPLIED, apply to DEV first, in this order)
phase16 policy half, phase17, phase18, phase19, phase20 (agency routes), phase21 (Deal Room conversation), phase22 (custom subscription proposals and success-fee commitment). The conversation panel shows "not switched on yet" until phase21 is applied.
