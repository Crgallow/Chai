import type { StructuredAnswer } from '../types.ts'
import { computeEvidenceConfidence } from './evidenceConfidence.ts'
import { computeSourceQuality } from './sourceQuality.ts'
import type {
  EvidenceScoringInput,
  ScoringCitationInput,
  ScoringContextInput,
  ScoringValidationInput,
} from './schemas.ts'

export * from './schemas.ts'
export * from './evidenceConfidence.ts'
export * from './sourceQuality.ts'

function mapCitations(structured: StructuredAnswer): ScoringCitationInput[] {
  const fromResearch =
    structured.research?.citations.map((c) => ({
      publisher: c.publisher,
      title: c.title,
      authorityLevel: c.authorityLevel,
      sourceType: c.sourceType,
      quotedText: c.quotedText,
      sourceUrl: c.sourceUrl,
      page: c.page,
      section: c.section,
      applicableYear: c.applicableYear,
      effectiveDate: undefined as string | undefined,
      superseded: false,
      internalOrExternal: c.internalOrExternal,
      verified: c.verified,
      demoData: c.demoData,
      supportsConclusion: structured.research?.unableToConclude ? false : true,
      jurisdiction: structured.research?.context.jurisdiction,
    })) ?? []

  const fromLegacy =
    structured.citations?.map((c) => ({
      publisher: c.source,
      title: c.title,
      authorityLevel: 'secondary_analysis',
      sourceType: 'secondary',
      quotedText: c.excerpt,
      sourceUrl: c.url,
      internalOrExternal: 'external' as const,
      verified: false,
      demoData: false,
      supportsConclusion: true as boolean | undefined,
    })) ?? []

  return [...fromResearch, ...fromLegacy]
}

function mapValidation(structured: StructuredAnswer): ScoringValidationInput {
  const hasSchedules = (structured.schedules?.length ?? 0) > 0
  const hasJournal = (structured.journalEntries?.length ?? 0) > 0
  const calcFailed = structured.schedules?.some((s) =>
    s.validations.some((v) => /fail|error|invalid/i.test(v)),
  )
  const calcPassed = hasSchedules
    ? structured.schedules!.every((s) => s.validations.length === 0 || !calcFailed)
    : null
  const journalBalanced = hasJournal
    ? structured.journalEntries!.every((j) => j.balanced)
    : null

  return {
    calculationRequired: hasSchedules || Boolean(structured.reconciliation),
    calculationPassed: hasSchedules || structured.reconciliation ? calcPassed !== false : null,
    journalRequired: hasJournal,
    journalBalanced,
    validationMessages: [
      ...(structured.schedules?.flatMap((s) => s.validations) ?? []),
      ...(structured.journalEntries?.flatMap((j) => j.validations) ?? []),
    ],
  }
}

function mapContext(structured: StructuredAnswer): ScoringContextInput {
  const research = structured.research
  const missing = [
    ...(structured.missingFacts ?? []),
    ...(research?.missingInformation.map((m) => m.field) ?? []),
  ]
  const category = research?.context.category
  const yearMatters = category === 'tax' || /\btax\b/i.test(research?.context.bookOrTax ?? '')
  const jurisdictionMatters = category === 'tax' || category === 'regulatory'
  const frameworkMatters =
    category === 'financial_accounting' || category === 'audit' || category === 'tax'

  const mockOnly =
    Boolean(research?.usedMockRetrieval) &&
    (research?.citations.length ?? 0) > 0 &&
    research!.citations.every((c) => c.demoData)

  return {
    applicableYear: research?.context.applicableYear,
    jurisdiction: research?.context.jurisdiction,
    accountingFramework: research?.context.accountingFramework,
    yearMatters: Boolean(yearMatters),
    jurisdictionMatters: Boolean(jurisdictionMatters),
    frameworkMatters: Boolean(frameworkMatters),
    materialFactsMissing: missing.length > 0,
    missingFactFields: missing,
    conflictingUnresolvedAuthority: (research?.sourceSufficiency.deficiencies ?? []).some((d) =>
      /conflict/i.test(d),
    ),
    conclusionSupportedByCitation: research
      ? research.unableToConclude
        ? false
        : research.citations.length > 0
          ? true
          : null
      : null,
    mockOrSyntheticOnly: Boolean(mockOnly || research?.usedMockRetrieval),
  }
}

export function buildScoringInput(structured: StructuredAnswer): EvidenceScoringInput {
  return {
    citations: mapCitations(structured),
    validation: mapValidation(structured),
    context: mapContext(structured),
  }
}

/**
 * Attach deterministic evidence confidence and source quality to a structured answer.
 * Ignores any model-proposed confidence percentage.
 */
export function attachDeterministicScores(structured: StructuredAnswer): StructuredAnswer {
  const input = buildScoringInput(structured)
  const evidenceConfidence = computeEvidenceConfidence(input)
  const sourceQuality = computeSourceQuality(input)

  return {
    ...structured,
    evidenceConfidence,
    sourceQuality,
    // Preserve historical research confidence level as advisory only; UI uses evidenceConfidence.
    research: structured.research
      ? {
          ...structured.research,
          requiresProfessionalReview:
            structured.research.requiresProfessionalReview ||
            evidenceConfidence.requiresProfessionalReview,
        }
      : structured.research,
  }
}
