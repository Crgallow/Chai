import { z } from 'zod'

export const ScoreFactorSchema = z.object({
  earned: z.number().min(0),
  possible: z.number().positive(),
  explanation: z.string(),
})

export const ConfidenceCapSchema = z.object({
  code: z.string(),
  maxScore: z.number().min(0).max(100),
  reason: z.string(),
})

export const EvidenceConfidenceLabelSchema = z.enum([
  'very_low',
  'low',
  'moderate',
  'high',
  'very_high',
])

export const EvidenceConfidenceResultSchema = z.object({
  score: z.number().min(0).max(100),
  label: EvidenceConfidenceLabelSchema,
  factors: z.object({
    sourceSupport: ScoreFactorSchema,
    factCompleteness: ScoreFactorSchema,
    applicability: ScoreFactorSchema,
    validation: ScoreFactorSchema,
    sourceAgreement: ScoreFactorSchema,
  }),
  capsApplied: z.array(ConfidenceCapSchema),
  reasons: z.array(z.string()),
  deficiencies: z.array(z.string()),
  requiresProfessionalReview: z.boolean(),
  /** Sum of factor earned points before caps. */
  preCapScore: z.number().min(0).max(100),
  generatedAt: z.string(),
  researchVersion: z.string(),
})

export const SourceQualityLabelSchema = z.enum([
  'weak',
  'limited',
  'adequate',
  'strong',
  'authoritative',
])

export const SourceQualityResultSchema = z.object({
  score: z.number().min(0).max(100),
  label: SourceQualityLabelSchema,
  sourcesEvaluated: z.number().int().min(0),
  primarySources: z.number().int().min(0),
  secondarySources: z.number().int().min(0),
  factors: z.object({
    authority: ScoreFactorSchema,
    applicability: ScoreFactorSchema,
    currency: ScoreFactorSchema,
    coverage: ScoreFactorSchema,
  }),
  reasons: z.array(z.string()),
  deficiencies: z.array(z.string()),
  generatedAt: z.string(),
  researchVersion: z.string(),
})

export type ScoreFactor = z.infer<typeof ScoreFactorSchema>
export type ConfidenceCap = z.infer<typeof ConfidenceCapSchema>
export type EvidenceConfidenceResult = z.infer<typeof EvidenceConfidenceResultSchema>
export type SourceQualityResult = z.infer<typeof SourceQualityResultSchema>
export type EvidenceConfidenceLabel = z.infer<typeof EvidenceConfidenceLabelSchema>
export type SourceQualityLabel = z.infer<typeof SourceQualityLabelSchema>

/** Inputs for deterministic scoring — never include a model-invented confidence %. */
export interface ScoringCitationInput {
  publisher: string
  title: string
  authorityLevel: string
  sourceType: string
  quotedText?: string
  sourceUrl?: string
  page?: number
  section?: string
  paragraph?: string
  applicableYear?: number
  effectiveDate?: string
  superseded?: boolean
  internalOrExternal: 'internal' | 'external'
  verified: boolean
  demoData?: boolean
  supportsConclusion?: boolean
  jurisdiction?: string
}

export interface ScoringValidationInput {
  calculationRequired: boolean
  calculationPassed: boolean | null
  journalRequired: boolean
  journalBalanced: boolean | null
  validationMessages: string[]
}

export interface ScoringContextInput {
  applicableYear?: number
  jurisdiction?: string
  accountingFramework?: string
  yearMatters: boolean
  jurisdictionMatters: boolean
  frameworkMatters: boolean
  materialFactsMissing: boolean
  missingFactFields: string[]
  conflictingUnresolvedAuthority: boolean
  conclusionSupportedByCitation: boolean | null
  mockOrSyntheticOnly: boolean
}

export interface EvidenceScoringInput {
  citations: ScoringCitationInput[]
  validation: ScoringValidationInput
  context: ScoringContextInput
  researchVersion?: string
  now?: string
}
