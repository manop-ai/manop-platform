// lib/investigation-report.ts
//
// Turns a scenario's own UNKNOWN readings into "what to ask which
// professional" — the actual capstone the Site Studio evidence model
// (FACT/DERIVED/ESTIMATE/ASSUMPTION/UNKNOWN) has been building toward
// since the very first pass. Pure functions only — no fetching, no
// React — so the report page and any future export path (the public
// share report, say) can both call the same assembly logic.
//
// Deliberately grounded in the REAL reading keys the engine can
// actually produce (confirmed against lib/scenario-engine.ts's own
// `unknown(...)` calls) rather than an invented, more impressive-
// looking list. If the engine never produces a given UNKNOWN key, no
// investigation question for it is ever fabricated here either.

import type { ScenarioReading } from './scenario-engine'
import type { InvestigationItem } from './site-intelligence'

export type ProfessionalType =
  | 'Planning Consultant' | 'Licensed Surveyor' | 'Architect'
  | 'Quantity Surveyor' | 'Valuer' | 'Legal / Title'

export interface InvestigationQuestion {
  question: string
  professional: ProfessionalType
  source: 'scenario_reading' | 'site_intelligence'
  relatedReadingKey: string | null
}

// The only reading keys the engine can actually mark UNKNOWN today —
// see computeScenarioReadings in lib/scenario-engine.ts. Each maps to
// one concrete question and the professional best placed to resolve
// it. Deliberately NOT a generic "confirm this number" for every key —
// the question is specific enough to actually hand to someone.
const UNKNOWN_READING_QUESTIONS: Record<string, { question: string; professional: ProfessionalType }> = {
  site_area_sqm: {
    question: 'Confirm the legal site area from a registered survey — no boundary or area figure is currently available for this site.',
    professional: 'Licensed Surveyor',
  },
  indicative_footprint_sqm: {
    question: 'Confirm an achievable building footprint for this site given its actual shape, access, and any easements — the current figure could not be calculated from available inputs.',
    professional: 'Architect',
  },
  indicative_gfa_sqm: {
    question: 'Confirm achievable gross floor area once footprint, coverage, and storey assumptions are verified.',
    professional: 'Architect',
  },
  indicative_unit_count: {
    question: 'Confirm a realistic unit count and mix for this site and market.',
    professional: 'Architect',
  },
  indicative_parking_count: {
    question: 'Confirm the applicable parking requirement and whether it can genuinely be met on this site.',
    professional: 'Planning Consultant',
  },
  indicative_open_space_sqm: {
    question: 'Confirm any minimum open space or landscaping requirement that applies to this site.',
    professional: 'Planning Consultant',
  },
}

export function buildInvestigationQuestionsFromReadings(readings: ScenarioReading[]): InvestigationQuestion[] {
  return readings
    .filter(r => r.value_status === 'unknown')
    .map(r => {
      const mapped = UNKNOWN_READING_QUESTIONS[r.reading_key]
      return {
        question: mapped?.question || `Confirm ${r.label.toLowerCase()} — not currently calculable from available inputs.`,
        professional: mapped?.professional || ('Planning Consultant' as ProfessionalType),
        source: 'scenario_reading' as const,
        relatedReadingKey: r.reading_key,
      }
    })
}

/** Real, open Site Intelligence investigation items for the site —
 * these already exist as actual data (the `investigation_items`
 * table), not generated here. Mapped to 'Planning Consultant' as a
 * reasonable default professional only because the table itself
 * carries no professional-type field yet — stated plainly as an
 * assumption, not presented as if the item specified it. */
export function investigationItemsToQuestions(items: InvestigationItem[]): InvestigationQuestion[] {
  return items
    .filter(i => i.status === 'open')
    .map(i => ({
      question: i.label,
      professional: 'Planning Consultant' as ProfessionalType,
      source: 'site_intelligence' as const,
      relatedReadingKey: null,
    }))
}

export interface ProfessionalHandoffReport {
  generatedAt: string
  site: {
    reference: string | null
    city: string | null
    neighborhood: string | null
    areaSqm: number | null
    boundaryStatus: string
  }
  scenario: {
    name: string
    reference: string | null
    developmentCategoryLabel: string
    status: string
  }
  readings: ScenarioReading[]
  investigationQuestions: InvestigationQuestion[]
  appraisalSummary: {
    scenarioName: string
    grossDevelopmentValueNgn: number | null
    totalCostsExclLandNgn: number | null
    residualLandValueNgn: number | null
    residualMarginPct: number | null
    viabilityLabel: string | null
  } | null
}

export function buildProfessionalHandoffReport(input: {
  site: ProfessionalHandoffReport['site']
  scenario: ProfessionalHandoffReport['scenario']
  readings: ScenarioReading[]
  investigationItems: InvestigationItem[]
  appraisal: ProfessionalHandoffReport['appraisalSummary'] | null
}): ProfessionalHandoffReport {
  return {
    generatedAt: new Date().toISOString(),
    site: input.site,
    scenario: input.scenario,
    readings: input.readings,
    investigationQuestions: [
      ...buildInvestigationQuestionsFromReadings(input.readings),
      ...investigationItemsToQuestions(input.investigationItems),
    ],
    appraisalSummary: input.appraisal,
  }
}