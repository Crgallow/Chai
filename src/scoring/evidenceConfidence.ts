import type {
  ConfidenceCap,
  EvidenceConfidenceLabel,
  EvidenceConfidenceResult,
  EvidenceScoringInput,
  ScoreFactor,
  ScoringCitationInput,
} from './schemas.ts'

export const RESEARCH_VERSION = 'evidence-scoring-v1'

const PRIMARY = new Set(['primary_authority', 'official_guidance', 'professional_standard'])
const SECONDARY = new Set(['secondary_analysis', 'internal_policy'])

export function labelForEvidenceScore(score: number): EvidenceConfidenceLabel {
  if (score <= 39) return 'very_low'
  if (score <= 59) return 'low'
  if (score <= 74) return 'moderate'
  if (score <= 89) return 'high'
  return 'very_high'
}

export function evidenceLabelText(label: EvidenceConfidenceLabel): string {
  switch (label) {
    case 'very_low':
      return 'Very low'
    case 'low':
      return 'Low'
    case 'moderate':
      return 'Moderate'
    case 'high':
      return 'High'
    case 'very_high':
      return 'Very high'
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function isPrimary(c: ScoringCitationInput): boolean {
  return PRIMARY.has(c.authorityLevel)
}

function isSecondary(c: ScoringCitationInput): boolean {
  return SECONDARY.has(c.authorityLevel) || (!isPrimary(c) && c.authorityLevel.length > 0)
}

function factor(earned: number, possible: number, explanation: string): ScoreFactor {
  return {
    earned: clamp(earned, 0, possible),
    possible,
    explanation,
  }
}

function scoreSourceSupport(citations: ScoringCitationInput[]): ScoreFactor {
  if (!citations.length) {
    return factor(0, 30, 'No supporting sources were attached to this answer.')
  }
  const primary = citations.filter(isPrimary)
  const withExcerpt = citations.filter((c) => (c.quotedText?.trim().length ?? 0) > 20)
  const verified = citations.filter((c) => c.verified)
  let earned = 0
  if (primary.length >= 2) earned += 20
  else if (primary.length) earned += 18
  else if (citations.some(isSecondary)) earned += 8
  if (withExcerpt.length) earned += 6
  if (verified.length) earned += 4
  else earned += 1
  if (citations.some((c) => c.supportsConclusion === false)) {
    earned = Math.min(earned, 8)
  }
  return factor(
    Math.min(earned, 30),
    30,
    primary.length
      ? `${primary.length} primary/official source(s) support this answer.`
      : 'Only secondary or internal sources support this answer.',
  )
}

function scoreFactCompleteness(input: EvidenceScoringInput): ScoreFactor {
  if (input.context.materialFactsMissing) {
    const fields = input.context.missingFactFields.join(', ') || 'material facts'
    return factor(4, 20, `Material information is missing (${fields}).`)
  }
  return factor(20, 20, 'Material facts appear complete for this question.')
}

function scoreApplicability(input: EvidenceScoringInput): ScoreFactor {
  let earned = 20
  const reasons: string[] = []
  if (input.context.yearMatters) {
    if (input.context.applicableYear == null) {
      earned -= 10
      reasons.push('Applicable year is unidentified where year matters.')
    } else {
      const yearMatch = input.citations.some(
        (c) => c.applicableYear == null || c.applicableYear === input.context.applicableYear,
      )
      if (!yearMatch && input.citations.length) {
        earned -= 6
        reasons.push('Source years may not match the applicable year.')
      }
    }
  }
  if (input.context.jurisdictionMatters) {
    if (!input.context.jurisdiction) {
      earned -= 10
      reasons.push('Jurisdiction is unidentified where jurisdiction matters.')
    }
  }
  if (input.context.frameworkMatters && !input.context.accountingFramework) {
    earned -= 4
    reasons.push('Accounting/audit framework is unidentified.')
  }
  return factor(
    earned,
    20,
    reasons.length ? reasons.join(' ') : 'Year, jurisdiction, and framework appear applicable.',
  )
}

function scoreValidation(input: EvidenceScoringInput): ScoreFactor {
  const { validation } = input
  if (!validation.calculationRequired && !validation.journalRequired) {
    return factor(20, 20, 'No calculation or journal validation was required for this answer.')
  }
  let earned = 0
  let possibleParts = 0
  if (validation.calculationRequired) {
    possibleParts += 1
    if (validation.calculationPassed === true) earned += 1
    else if (validation.calculationPassed === null) earned += 0.35
  }
  if (validation.journalRequired) {
    possibleParts += 1
    if (validation.journalBalanced === true) earned += 1
    else if (validation.journalBalanced === null) earned += 0.35
  }
  const ratio = possibleParts ? earned / possibleParts : 1
  const points = Math.round(ratio * 20)
  const msg =
    validation.calculationPassed === false
      ? 'Calculation validation failed.'
      : validation.journalBalanced === false
        ? 'Journal entry is unbalanced.'
        : validation.calculationPassed === null || validation.journalBalanced === null
          ? 'Deterministic validation was required but not fully performed.'
          : 'Calculation and journal validations passed.'
  return factor(points, 20, msg)
}

function scoreSourceAgreement(citations: ScoringCitationInput[], conflicting: boolean): ScoreFactor {
  if (conflicting) {
    return factor(2, 10, 'Relevant sources conflict and the conflict is unresolved.')
  }
  if (!citations.length) {
    return factor(0, 10, 'No sources available to evaluate agreement.')
  }
  if (citations.length === 1) {
    return factor(6, 10, 'Single source — agreement cannot be cross-checked.')
  }
  const unsupported = citations.filter((c) => c.supportsConclusion === false)
  if (unsupported.length) {
    return factor(3, 10, 'At least one citation does not support the stated conclusion.')
  }
  return factor(10, 10, 'Relevant sources agree on the material conclusion.')
}

function collectCaps(input: EvidenceScoringInput, factors: EvidenceConfidenceResult['factors']): ConfidenceCap[] {
  const caps: ConfidenceCap[] = []
  const citations = input.citations
  const hasPrimary = citations.some(isPrimary)
  const hasAny = citations.length > 0
  const secondaryOnly = hasAny && !hasPrimary
  const mockOnly =
    input.context.mockOrSyntheticOnly ||
    (hasAny && citations.every((c) => c.demoData))
  const superseded = citations.some((c) => c.superseded)
  const citationDoesNotSupport =
    citations.some((c) => c.supportsConclusion === false) ||
    input.context.conclusionSupportedByCitation === false

  if (!hasAny) {
    caps.push({
      code: 'no_supporting_source',
      maxScore: 35,
      reason: 'No supporting source attached.',
    })
  }
  if (secondaryOnly) {
    caps.push({
      code: 'secondary_sources_only',
      maxScore: 69,
      reason: 'Only secondary sources support this answer.',
    })
  }
  if (input.context.materialFactsMissing) {
    caps.push({
      code: 'missing_material_information',
      maxScore: 49,
      reason: 'Material information is missing.',
    })
  }
  if (input.context.yearMatters && input.context.applicableYear == null) {
    caps.push({
      code: 'wrong_or_unidentified_year',
      maxScore: 49,
      reason: 'Tax/accounting year is wrong or unidentified when year matters.',
    })
  }
  if (input.context.jurisdictionMatters && !input.context.jurisdiction) {
    caps.push({
      code: 'wrong_or_unidentified_jurisdiction',
      maxScore: 49,
      reason: 'Jurisdiction is wrong or unidentified when jurisdiction matters.',
    })
  }
  if (input.context.conflictingUnresolvedAuthority) {
    caps.push({
      code: 'conflicting_unresolved_authority',
      maxScore: 59,
      reason: 'Conflicting unresolved authority.',
    })
  }
  if (superseded) {
    caps.push({
      code: 'superseded_source_incorrectly',
      maxScore: 25,
      reason: 'A superseded source was applied incorrectly.',
    })
  }
  if (input.validation.calculationRequired && input.validation.calculationPassed === false) {
    caps.push({
      code: 'failed_calculation_validation',
      maxScore: 39,
      reason: 'Calculation validation failed.',
    })
  }
  if (input.validation.journalRequired && input.validation.journalBalanced === false) {
    caps.push({
      code: 'unbalanced_journal_entry',
      maxScore: 39,
      reason: 'Journal entry failed debit/credit validation.',
    })
  }
  if (citationDoesNotSupport) {
    caps.push({
      code: 'citation_does_not_support',
      maxScore: 35,
      reason: 'Citation does not support the conclusion.',
    })
  }
  if (mockOnly) {
    caps.push({
      code: 'mock_or_synthetic_only',
      maxScore: 50,
      reason: 'Only mock/synthetic sources were used.',
    })
  }
  const validationRequired =
    input.validation.calculationRequired || input.validation.journalRequired
  const validationIncomplete =
    (input.validation.calculationRequired && input.validation.calculationPassed === null) ||
    (input.validation.journalRequired && input.validation.journalBalanced === null)
  if (validationRequired && validationIncomplete) {
    caps.push({
      code: 'no_deterministic_validation',
      maxScore: 69,
      reason: 'Deterministic validation was required but not performed.',
    })
  }

  // Ensure factor explanations still drive review flags
  void factors
  return caps
}

export function computeEvidenceConfidence(input: EvidenceScoringInput): EvidenceConfidenceResult {
  const factors = {
    sourceSupport: scoreSourceSupport(input.citations),
    factCompleteness: scoreFactCompleteness(input),
    applicability: scoreApplicability(input),
    validation: scoreValidation(input),
    sourceAgreement: scoreSourceAgreement(
      input.citations,
      input.context.conflictingUnresolvedAuthority,
    ),
  }

  const preCapScore = clamp(
    factors.sourceSupport.earned +
      factors.factCompleteness.earned +
      factors.applicability.earned +
      factors.validation.earned +
      factors.sourceAgreement.earned,
    0,
    100,
  )

  const capsApplied = collectCaps(input, factors)
  const capped = capsApplied.reduce((score, cap) => Math.min(score, cap.maxScore), preCapScore)
  const score = clamp(Math.round(capped), 0, 100)

  const deficiencies: string[] = []
  if (!input.citations.length) deficiencies.push('No supporting sources.')
  if (input.context.materialFactsMissing) deficiencies.push('Missing material facts.')
  if (input.context.conflictingUnresolvedAuthority) deficiencies.push('Unresolved source conflict.')
  if (input.validation.calculationPassed === false) deficiencies.push('Failed calculation validation.')
  if (input.validation.journalBalanced === false) deficiencies.push('Unbalanced journal entry.')
  for (const cap of capsApplied) deficiencies.push(cap.reason)

  const reasons = [
    `Applicable source support: ${factors.sourceSupport.earned}/${factors.sourceSupport.possible}`,
    `Complete material facts: ${factors.factCompleteness.earned}/${factors.factCompleteness.possible}`,
    `Year and jurisdiction: ${factors.applicability.earned}/${factors.applicability.possible}`,
    `Calculation validation: ${factors.validation.earned}/${factors.validation.possible}`,
    `Source agreement: ${factors.sourceAgreement.earned}/${factors.sourceAgreement.possible}`,
    `Pre-cap total: ${preCapScore}/100`,
    `Final evidence confidence: ${score}/100`,
    ...capsApplied.map((c) => `Cap applied (${c.code}): max ${c.maxScore}% — ${c.reason}`),
  ]

  const requiresProfessionalReview =
    score < 75 ||
    input.context.materialFactsMissing ||
    input.context.conflictingUnresolvedAuthority ||
    capsApplied.some((c) =>
      [
        'superseded_source_incorrectly',
        'failed_calculation_validation',
        'unbalanced_journal_entry',
        'citation_does_not_support',
        'no_supporting_source',
      ].includes(c.code),
    )

  return {
    score,
    label: labelForEvidenceScore(score),
    factors,
    capsApplied,
    reasons,
    deficiencies: [...new Set(deficiencies)],
    requiresProfessionalReview,
    preCapScore,
    generatedAt: input.now ?? new Date().toISOString(),
    researchVersion: input.researchVersion ?? RESEARCH_VERSION,
  }
}

/** Reject any attempt by a model to set confidence — scoring is always recomputed. */
export function assertModelCannotSetConfidence(modelProposed?: number | null): void {
  if (modelProposed != null) {
    throw new Error(
      'Model-proposed confidence percentages are rejected. Evidence confidence is calculated deterministically.',
    )
  }
}
