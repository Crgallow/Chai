import type {
  EvidenceScoringInput,
  ScoreFactor,
  ScoringCitationInput,
  SourceQualityLabel,
  SourceQualityResult,
} from './schemas.ts'
import { RESEARCH_VERSION } from './evidenceConfidence.ts'

const PRIMARY = new Set(['primary_authority', 'official_guidance', 'professional_standard'])

export function labelForSourceQuality(score: number): SourceQualityLabel {
  if (score <= 29) return 'weak'
  if (score <= 49) return 'limited'
  if (score <= 69) return 'adequate'
  if (score <= 84) return 'strong'
  return 'authoritative'
}

export function sourceQualityLabelText(label: SourceQualityLabel): string {
  switch (label) {
    case 'weak':
      return 'Weak'
    case 'limited':
      return 'Limited'
    case 'adequate':
      return 'Adequate'
    case 'strong':
      return 'Strong'
    case 'authoritative':
      return 'Authoritative'
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function factor(earned: number, possible: number, explanation: string): ScoreFactor {
  return {
    earned: clamp(earned, 0, possible),
    possible,
    explanation,
  }
}

function isPrimary(c: ScoringCitationInput): boolean {
  return PRIMARY.has(c.authorityLevel)
}

function scoreAuthority(citations: ScoringCitationInput[]): ScoreFactor {
  if (!citations.length) {
    return factor(0, 40, 'No sources to evaluate for authority.')
  }
  const primary = citations.filter(isPrimary)
  const secondary = citations.filter((c) => !isPrimary(c))
  // Authority is about role/applicability, not publisher brand alone.
  let earned = 0
  if (primary.length) {
    earned += 28
    if (citations.some((c) => c.verified && isPrimary(c))) earned += 8
    else earned += 4
    if (citations.some((c) => c.sourceType === 'organization_policy' && isPrimary(c))) {
      // Internal policy mislabeled as primary should not inflate authority.
      earned = Math.min(earned, 18)
    }
  } else if (secondary.length) {
    earned += 14
    if (secondary.every((c) => c.sourceType === 'organization_policy')) {
      earned = 12
    }
  }
  if (citations.every((c) => c.demoData)) {
    earned = Math.min(earned, 20)
  }
  return factor(
    earned,
    40,
    primary.length
      ? `${primary.length} primary/official source(s); authority scored by applicability role.`
      : 'Secondary or internal sources only — not primary legal/professional authority.',
  )
}

function scoreApplicability(
  citations: ScoringCitationInput[],
  input: EvidenceScoringInput,
): ScoreFactor {
  if (!citations.length) {
    return factor(0, 30, 'No sources to evaluate for applicability.')
  }
  let earned = 30
  const ctx = input.context
  if (ctx.yearMatters) {
    if (ctx.applicableYear == null) earned -= 12
    else {
      const mismatch = citations.filter(
        (c) => c.applicableYear != null && c.applicableYear !== ctx.applicableYear,
      )
      if (mismatch.length === citations.length) earned -= 15
      else if (mismatch.length) earned -= 6
    }
  }
  if (ctx.jurisdictionMatters) {
    if (!ctx.jurisdiction) earned -= 10
    else {
      const mismatch = citations.filter(
        (c) => c.jurisdiction && c.jurisdiction !== ctx.jurisdiction,
      )
      if (mismatch.length === citations.length) earned -= 12
    }
  }
  return factor(
    earned,
    30,
    earned >= 24
      ? 'Sources appear applicable to year, jurisdiction, entity, and framework.'
      : 'Applicability gaps reduce source quality (year, jurisdiction, or framework).',
  )
}

function scoreCurrency(citations: ScoringCitationInput[]): ScoreFactor {
  if (!citations.length) {
    return factor(0, 15, 'No sources to evaluate currency.')
  }
  if (citations.some((c) => c.superseded)) {
    return factor(2, 15, 'At least one superseded source was used.')
  }
  const withDates = citations.filter((c) => c.effectiveDate || c.applicableYear)
  if (!withDates.length) {
    return factor(9, 15, 'Currency partially unknown — effective dates not fully provided.')
  }
  return factor(15, 15, 'Sources appear current and not superseded.')
}

function scoreCoverage(citations: ScoringCitationInput[], input: EvidenceScoringInput): ScoreFactor {
  if (!citations.length) {
    return factor(0, 15, 'No source coverage of the material conclusion.')
  }
  if (input.context.conclusionSupportedByCitation === false) {
    return factor(2, 15, 'Citations do not cover the material conclusion.')
  }
  const withExcerpt = citations.filter((c) => (c.quotedText?.trim().length ?? 0) > 20)
  if (!withExcerpt.length) {
    return factor(6, 15, 'Sources listed but excerpts do not clearly cover the conclusion.')
  }
  if (input.context.materialFactsMissing) {
    return factor(8, 15, 'Partial coverage — material facts are still missing.')
  }
  return factor(15, 15, 'Sources cover the material conclusion with supporting excerpts.')
}

export function computeSourceQuality(input: EvidenceScoringInput): SourceQualityResult {
  const citations = input.citations
  const primarySources = citations.filter(isPrimary).length
  const secondarySources = citations.length - primarySources

  const factors = {
    authority: scoreAuthority(citations),
    applicability: scoreApplicability(citations, input),
    currency: scoreCurrency(citations),
    coverage: scoreCoverage(citations, input),
  }

  const raw =
    factors.authority.earned +
    factors.applicability.earned +
    factors.currency.earned +
    factors.coverage.earned
  const score = clamp(Math.round(raw), 0, 100)

  const deficiencies: string[] = []
  if (!citations.length) deficiencies.push('No sources evaluated.')
  if (!primarySources && citations.length) deficiencies.push('No primary sources.')
  if (citations.some((c) => c.superseded)) deficiencies.push('Superseded source present.')
  if (input.context.conclusionSupportedByCitation === false) {
    deficiencies.push('Conclusion not covered by citations.')
  }

  const reasons = [
    `Authority level: ${factors.authority.earned}/${factors.authority.possible}`,
    `Applicability: ${factors.applicability.earned}/${factors.applicability.possible}`,
    `Current and not superseded: ${factors.currency.earned}/${factors.currency.possible}`,
    `Coverage of conclusion: ${factors.coverage.earned}/${factors.coverage.possible}`,
    `Final source quality: ${score}/100`,
  ]

  return {
    score,
    label: labelForSourceQuality(score),
    sourcesEvaluated: citations.length,
    primarySources,
    secondarySources,
    factors,
    reasons,
    deficiencies,
    generatedAt: input.now ?? new Date().toISOString(),
    researchVersion: input.researchVersion ?? RESEARCH_VERSION,
  }
}
