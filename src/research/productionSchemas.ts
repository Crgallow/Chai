/**
 * Production accounting research contracts.
 * Application-enforced stage order; OpenAI Responses API is a provider, not the orchestrator.
 */
import { z } from 'zod'
import type { EvidenceConfidenceResult, SourceQualityResult } from '../scoring/schemas.ts'
import type { ResponseMode } from '../study/schemas.ts'

export const RESEARCH_SYSTEM_PROMPT_VERSION = 'chai-research-system-v2'
export const RESEARCH_WORKFLOW_VERSION = 'research-workflow-v2'

export const RESEARCH_SYSTEM_PROMPT = `You are Chai, an accounting research assistant. You must follow the application-controlled research sequence and use the provided tools. Do not provide a material accounting, tax, or audit conclusion based solely on model memory. Identify issues before researching. Determine the applicable jurisdiction, year, entity, and framework before selecting authority. Search primary authority before secondary authority. Extract the exact relevant passages. Use deterministic tools for material calculations. Require an independent cross-check. Cite every material conclusion next to the claim it supports. If material facts or adequate authority are unavailable, state that a reliable conclusion cannot be reached. Never fabricate sources, quotations, paragraph references, calculations, or confidence scores. Do not expose hidden chain-of-thought. Return only the structured research artifacts and concise user-facing explanations requested by the application.`

export const ProductionStageNameSchema = z.enum([
  'question',
  'identify_issue',
  'determine_jurisdiction_year',
  'search_primary_authority',
  'search_secondary_authority',
  'extract_relevant_passages',
  'perform_calculation',
  'cross_check_calculation',
  'generate_answer',
  'cite_material_conclusions',
])
export type ProductionStageName = z.infer<typeof ProductionStageNameSchema>

export const ProductionStageStatusSchema = z.enum([
  'not_started',
  'waiting_for_user',
  'in_progress',
  'completed',
  'completed_with_warnings',
  'failed',
  'not_required',
])
export type ProductionStageStatus = z.infer<typeof ProductionStageStatusSchema>

export const MissingInformationItemSchema = z.object({
  field: z.string(),
  reason: z.string(),
  material: z.boolean().default(true),
  questionForUser: z.string().optional(),
})
export type MissingInformationItem = z.infer<typeof MissingInformationItemSchema>

export const ResearchToolRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  argumentsSummary: z.string(),
  resultSummary: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  ok: z.boolean(),
})
export type ResearchToolRecord = z.infer<typeof ResearchToolRecordSchema>

export const ProductionResearchStageSchema = z.object({
  id: z.string(),
  name: ProductionStageNameSchema,
  status: ProductionStageStatusSchema,
  publicSummary: z.string().default(''),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  toolCalls: z.array(ResearchToolRecordSchema).default([]),
  sourceIds: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  errors: z.array(z.string()).default([]),
})
export type ProductionResearchStage = z.infer<typeof ProductionResearchStageSchema>

export const AccountingResearchRequestSchema = z.object({
  question: z.string().min(1),
  conversationId: z.string().default('local'),
  userId: z.string().default('local-user'),
  organizationId: z.string().optional(),
  responseMode: z.enum(['professional', 'cpa_exam_study', 'quick_answer']).default('professional'),
  uploadedDocumentIds: z.array(z.string()).default([]),
  knownContext: z.record(z.string(), z.unknown()).optional(),
  model: z.string().optional(),
})
export type AccountingResearchRequest = z.infer<typeof AccountingResearchRequestSchema> & {
  responseMode: ResponseMode
}

export const IdentifiedAccountingIssueSchema = z.object({
  id: z.string(),
  category: z.enum([
    'tax',
    'audit',
    'financial_accounting',
    'managerial_accounting',
    'regulatory',
    'other',
  ]),
  topic: z.string(),
  subtopic: z.string().optional(),
  issueStatement: z.string(),
  bookOrTax: z.enum(['book', 'tax', 'both', 'not_applicable']).optional(),
  potentiallyMaterial: z.boolean(),
  requiredFacts: z.array(z.string()).default([]),
  knownFacts: z.array(z.string()).default([]),
  missingFacts: z.array(z.string()).default([]),
  researchTerms: z.array(z.string()).default([]),
  requiresAuthorityResearch: z.boolean().default(true),
  requiresCalculation: z.boolean().default(false),
  requiresJournalEntry: z.boolean().default(false),
  priority: z.enum(['primary', 'secondary']).default('primary'),
})
export type IdentifiedAccountingIssue = z.infer<typeof IdentifiedAccountingIssueSchema>

export const AccountingResearchContextSchema = z.object({
  applicableYear: z.number().int().optional(),
  transactionDate: z.string().optional(),
  jurisdiction: z.string().optional(),
  federalOrState: z.enum(['federal', 'state', 'both', 'not_applicable']).optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  accountingFramework: z.enum(['US_GAAP', 'IFRS', 'TAX', 'OTHER']).optional(),
  auditFramework: z.enum(['AICPA', 'PCAOB', 'GAGAS', 'OTHER']).optional(),
  entityType: z.string().optional(),
  publicPrivateApplicability: z.enum(['public', 'private', 'both']).optional(),
  bookOrTax: z.enum(['book', 'tax', 'both']).optional(),
  reportingPeriod: z.string().optional(),
  confirmedFacts: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  missingMaterialInformation: z.array(MissingInformationItemSchema).default([]),
})
export type AccountingResearchContext = z.infer<typeof AccountingResearchContextSchema>

export const AuthoritySearchResultSchema = z.object({
  sourceId: z.string().optional(),
  publisher: z.string(),
  title: z.string(),
  authorityType: z.string(),
  authorityLevel: z.enum(['primary', 'official_guidance', 'secondary']),
  url: z.string().optional(),
  documentId: z.string().optional(),
  section: z.string().optional(),
  paragraph: z.string().optional(),
  page: z.number().optional(),
  applicableYear: z.number().optional(),
  effectiveDate: z.string().optional(),
  supersededDate: z.string().optional(),
  jurisdiction: z.string().optional(),
  verified: z.boolean(),
  relevanceReason: z.string(),
  retrievalDate: z.string(),
  exactPassage: z.string().optional(),
  demoData: z.boolean().optional(),
  licensingRestricted: z.boolean().optional(),
})
export type AuthoritySearchResult = z.infer<typeof AuthoritySearchResultSchema>

export const RelevantPassageProdSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  publisher: z.string(),
  sourceTitle: z.string(),
  authorityLevel: z.string(),
  section: z.string().optional(),
  paragraph: z.string().optional(),
  page: z.number().optional(),
  exactExcerpt: z.string().optional(),
  paraphrase: z.string(),
  supportedIssueIds: z.array(z.string()).default([]),
  supportedConclusionTypes: z.array(z.string()).default([]),
  applicableYear: z.number().optional(),
  jurisdiction: z.string().optional(),
  effectiveDate: z.string().optional(),
  verified: z.boolean(),
  relevanceExplanation: z.string(),
  primaryOrSecondary: z.enum(['primary', 'secondary']),
})
export type RelevantPassageProd = z.infer<typeof RelevantPassageProdSchema>

export const CalculationStepSchema = z.object({
  id: z.string(),
  description: z.string(),
  formula: z.string().optional(),
  intermediateResult: z.union([z.string(), z.number()]).optional(),
})

export const AccountingCalculationResultSchema = z.object({
  calculatorId: z.string(),
  calculatorVersion: z.string(),
  inputs: z.record(z.string(), z.unknown()),
  formulas: z.array(z.string()).default([]),
  steps: z.array(CalculationStepSchema).default([]),
  result: z.record(z.string(), z.union([z.number(), z.string()])),
  roundingPolicy: z.string(),
  validationStatus: z.enum(['passed', 'warning', 'failed']),
  validationMessages: z.array(z.string()).default([]),
})
export type AccountingCalculationResult = z.infer<typeof AccountingCalculationResultSchema>

export const CalculationCrossCheckSchema = z.object({
  originalCalculationId: z.string(),
  method: z.enum([
    'independent_formula',
    'reverse_calculation',
    'reconciliation',
    'rollforward',
    'alternate_calculator',
    'reasonableness_test',
  ]),
  originalResult: z.union([z.number(), z.string()]),
  crossCheckResult: z.union([z.number(), z.string()]),
  difference: z.number().optional(),
  tolerance: z.number().optional(),
  passed: z.boolean(),
  explanation: z.string(),
})
export type CalculationCrossCheck = z.infer<typeof CalculationCrossCheckSchema>

export const MaterialConclusionProdSchema = z.object({
  id: z.string(),
  statement: z.string(),
  conclusionType: z.enum([
    'accounting_rule',
    'tax_rule',
    'audit_rule',
    'calculation',
    'journal_entry',
    'recommendation',
    'limitation',
  ]),
  material: z.boolean(),
  issueIds: z.array(z.string()).default([]),
  citationIds: z.array(z.string()).default([]),
  calculationIds: z.array(z.string()).default([]),
  supportStatus: z.enum([
    'fully_supported',
    'partially_supported',
    'unsupported',
    'conflicted',
  ]),
  inlineMarker: z.string().optional(),
})
export type MaterialConclusionProd = z.infer<typeof MaterialConclusionProdSchema>

export const ConclusionCitationCoverageSchema = z.object({
  conclusionId: z.string(),
  supported: z.boolean(),
  citationIds: z.array(z.string()).default([]),
  calculationIds: z.array(z.string()).default([]),
  deficiencies: z.array(z.string()).default([]),
})

export const CitationCoverageProdSchema = z.object({
  passed: z.boolean(),
  totalMaterialConclusions: z.number().int(),
  fullySupportedConclusions: z.number().int(),
  partiallySupportedConclusions: z.number().int(),
  unsupportedConclusions: z.number().int(),
  coveragePercentage: z.number(),
  results: z.array(ConclusionCitationCoverageSchema).default([]),
  summary: z.string(),
})
export type CitationCoverageProd = z.infer<typeof CitationCoverageProdSchema>

export const SourceConflictSchema = z.object({
  id: z.string(),
  description: z.string(),
  sourceIds: z.array(z.string()).default([]),
  unresolved: z.boolean(),
})

export const AccountingResearchAnswerSchema = z.object({
  directAnswer: z.string(),
  issues: z.array(IdentifiedAccountingIssueSchema).default([]),
  researchContext: AccountingResearchContextSchema,
  factsReliedUpon: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  missingInformation: z.array(MissingInformationItemSchema).default([]),
  materialConclusions: z.array(MaterialConclusionProdSchema).default([]),
  analysis: z.string().default(''),
  calculations: z.array(AccountingCalculationResultSchema).default([]),
  crossChecks: z.array(CalculationCrossCheckSchema).default([]),
  journalEntries: z.array(z.unknown()).default([]),
  citations: z.array(z.unknown()).default([]),
  sourceConflicts: z.array(SourceConflictSchema).default([]),
  warnings: z.array(z.string()).default([]),
  requiresProfessionalReview: z.boolean(),
  unableToConclude: z.boolean(),
  researchVersion: z.string(),
  systemPromptVersion: z.string(),
  mockLabeled: z.boolean().optional(),
})
export type AccountingResearchAnswer = z.infer<typeof AccountingResearchAnswerSchema> & {
  evidenceConfidence?: EvidenceConfidenceResult
  sourceQuality?: SourceQualityResult
}

export const PRODUCTION_STAGE_ORDER: ProductionStageName[] = [
  'question',
  'identify_issue',
  'determine_jurisdiction_year',
  'search_primary_authority',
  'search_secondary_authority',
  'extract_relevant_passages',
  'perform_calculation',
  'cross_check_calculation',
  'generate_answer',
  'cite_material_conclusions',
]

export const PRODUCTION_STAGE_LABELS: Record<ProductionStageName, string> = {
  question: 'Question',
  identify_issue: 'Identify Issue',
  determine_jurisdiction_year: 'Determine Jurisdiction and Year',
  search_primary_authority: 'Search Primary Authority',
  search_secondary_authority: 'Search Secondary Authority',
  extract_relevant_passages: 'Extract Relevant Passages',
  perform_calculation: 'Perform Calculation',
  cross_check_calculation: 'Cross-Check Calculation',
  generate_answer: 'Generate Answer',
  cite_material_conclusions: 'Cite Every Material Conclusion',
}

export type ResearchProgressEventProd =
  | { type: 'stage_started'; stage: ProductionResearchStage }
  | { type: 'stage_updated'; stage: ProductionResearchStage }
  | { type: 'source_found'; source: AuthoritySearchResult }
  | { type: 'passage_extracted'; passage: RelevantPassageProd }
  | { type: 'calculation_completed'; calculation: AccountingCalculationResult }
  | { type: 'cross_check_completed'; crossCheck: CalculationCrossCheck }
  | { type: 'user_input_required'; questions: MissingInformationItem[]; runId: string }
  | { type: 'research_completed'; result: AccountingResearchAnswer; runId: string }
  | { type: 'research_failed'; error: { code: string; message: string }; runId?: string }

export interface AccountingResearchResult {
  runId: string
  answer: AccountingResearchAnswer
  stages: ProductionResearchStage[]
  primarySources: AuthoritySearchResult[]
  secondarySources: AuthoritySearchResult[]
  passages: RelevantPassageProd[]
  status: 'completed' | 'waiting_for_user' | 'failed'
  content: string
  mockLabeled: boolean
  usedResponsesApi: boolean
  openaiStore: false
}

export interface AccountingResearchOrchestrator {
  research(
    request: AccountingResearchRequest,
    options?: {
      signal?: AbortSignal
      onProgress?: (event: ResearchProgressEventProd) => void | Promise<void>
      resumeRunId?: string
    },
  ): Promise<AccountingResearchResult>
}
