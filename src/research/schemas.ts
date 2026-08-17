import { z } from 'zod'

export const ResearchStageSchema = z.enum([
  'question',
  'identify_issue',
  'determine_jurisdiction_year',
  'search_primary_authority',
  'search_secondary_authority',
  'extract_relevant_passages',
  'perform_calculation',
  'cross_check_calculation',
  'generate_answer',
  'validate_citations',
  'completed',
  'blocked',
  'failed',
])
export type ResearchStage = z.infer<typeof ResearchStageSchema>

export const ResearchStageStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'completed_with_warnings',
  'blocked',
  'failed',
  'not_required',
])
export type ResearchStageStatus = z.infer<typeof ResearchStageStatusSchema>

export const MissingInformationItemSchema = z.object({
  field: z.string(),
  reason: z.string(),
  material: z.boolean().default(true),
})
export type MissingInformationItem = z.infer<typeof MissingInformationItemSchema>

export const ResearchAssumptionSchema = z.object({
  statement: z.string(),
  immaterial: z.boolean(),
  disclosed: z.boolean(),
  changesApplicableAuthority: z.boolean(),
})
export type ResearchAssumption = z.infer<typeof ResearchAssumptionSchema>

export const ResearchToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  argumentsSummary: z.string(),
  resultSummary: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  ok: z.boolean(),
})
export type ResearchToolCall = z.infer<typeof ResearchToolCallSchema>

export const ResearchStageRecordSchema = z.object({
  id: z.string(),
  researchRunId: z.string(),
  stage: ResearchStageSchema,
  status: ResearchStageStatusSchema,
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  summary: z.string().optional(),
  sourceIds: z.array(z.string()).default([]),
  toolCalls: z.array(ResearchToolCallSchema).default([]),
  warnings: z.array(z.string()).default([]),
  errors: z.array(z.string()).default([]),
  requiresUserInput: z.boolean().default(false),
  displayLabel: z.string(),
})
export type ResearchStageRecord = z.infer<typeof ResearchStageRecordSchema>

export const FactExtractionResultSchema = z.object({
  originalQuestion: z.string(),
  userProvidedFacts: z.array(z.string()).default([]),
  monetaryAmounts: z.array(z.string()).default([]),
  dates: z.array(z.string()).default([]),
  entities: z.array(z.string()).default([]),
  transactions: z.array(z.string()).default([]),
  documentsProvided: z.array(z.string()).default([]),
  requestedOutput: z.array(z.string()).default([]),
  potentialAmbiguities: z.array(z.string()).default([]),
  potentiallyMissingFacts: z.array(MissingInformationItemSchema).default([]),
})
export type FactExtractionResult = z.infer<typeof FactExtractionResultSchema>

export const AccountingIssueSchema = z.object({
  issueId: z.string(),
  title: z.string(),
  category: z.string(),
  description: z.string(),
  priority: z.enum(['primary', 'secondary']),
  requiresAuthorityResearch: z.boolean(),
  requiresCalculation: z.boolean(),
  requiresJournalEntry: z.boolean(),
  missingFacts: z.array(MissingInformationItemSchema).default([]),
  whyItMatters: z.string().optional(),
})
export type AccountingIssue = z.infer<typeof AccountingIssueSchema>

export const ResearchContextSchema = z.object({
  country: z.string().optional(),
  jurisdiction: z.string().optional(),
  state: z.string().optional(),
  taxYear: z.number().int().optional(),
  reportingPeriod: z.string().optional(),
  transactionDate: z.string().optional(),
  accountingFramework: z.enum(['US_GAAP', 'IFRS', 'TAX', 'OTHER']).optional(),
  auditFramework: z.enum(['AICPA', 'PCAOB', 'GAGAS', 'OTHER']).optional(),
  entityType: z.string().optional(),
  publicPrivateApplicability: z.enum(['public', 'private', 'both']).optional(),
  bookOrTax: z.enum(['book', 'tax', 'both']).optional(),
  missingMaterialFacts: z.array(MissingInformationItemSchema).default([]),
  assumptions: z.array(ResearchAssumptionSchema).default([]),
})
export type ResearchContext = z.infer<typeof ResearchContextSchema>

export const RetrievedSourceSchema = z.object({
  sourceId: z.string(),
  publisher: z.string(),
  title: z.string(),
  authorityType: z.string(),
  citationIdentifier: z.string().optional(),
  section: z.string().optional(),
  paragraph: z.string().optional(),
  page: z.number().optional(),
  sourceUrl: z.string().optional(),
  internalDocumentId: z.string().optional(),
  effectiveDate: z.string().optional(),
  supersededDate: z.string().optional(),
  applicableYear: z.number().optional(),
  jurisdiction: z.string().optional(),
  framework: z.string().optional(),
  exactPassage: z.string(),
  verificationStatus: z.string(),
  primaryOrSecondary: z.enum(['primary', 'secondary']),
  demoData: z.boolean().optional(),
})
export type RetrievedSource = z.infer<typeof RetrievedSourceSchema>

export const RelevantPassageSchema = z.object({
  passageId: z.string(),
  sourceId: z.string(),
  issueIds: z.array(z.string()).default([]),
  exactText: z.string(),
  page: z.number().optional(),
  section: z.string().optional(),
  paragraph: z.string().optional(),
  startOffset: z.number().optional(),
  endOffset: z.number().optional(),
  relevanceSummary: z.string(),
  supportsConclusionIds: z.array(z.string()).default([]),
  contradictsConclusionIds: z.array(z.string()).default([]),
  primaryOrSecondary: z.enum(['primary', 'secondary']),
})
export type RelevantPassage = z.infer<typeof RelevantPassageSchema>

export const MaterialConclusionSchema = z.object({
  conclusionId: z.string(),
  statement: z.string(),
  supportingPassageIds: z.array(z.string()).default([]),
  cited: z.boolean(),
})
export type MaterialConclusion = z.infer<typeof MaterialConclusionSchema>

export const CitationCoverageResultSchema = z.object({
  totalConclusions: z.number().int(),
  citedConclusions: z.number().int(),
  uncitedConclusions: z.array(z.string()).default([]),
  passed: z.boolean(),
  summary: z.string(),
})
export type CitationCoverageResult = z.infer<typeof CitationCoverageResultSchema>

export const CalculationValidationResultSchema = z.object({
  performed: z.boolean(),
  primaryResultSummary: z.string().optional(),
  crossCheckSummary: z.string().optional(),
  passed: z.boolean(),
  messages: z.array(z.string()).default([]),
})
export type CalculationValidationResult = z.infer<typeof CalculationValidationResultSchema>

export const STAGE_ORDER: ResearchStage[] = [
  'question',
  'identify_issue',
  'determine_jurisdiction_year',
  'search_primary_authority',
  'search_secondary_authority',
  'extract_relevant_passages',
  'perform_calculation',
  'cross_check_calculation',
  'generate_answer',
  'validate_citations',
  'completed',
]

export const STAGE_DISPLAY_LABELS: Record<ResearchStage, string> = {
  question: 'Question received',
  identify_issue: 'Identify issue',
  determine_jurisdiction_year: 'Determine jurisdiction and year',
  search_primary_authority: 'Search primary authority',
  search_secondary_authority: 'Search secondary authority',
  extract_relevant_passages: 'Extract relevant passages',
  perform_calculation: 'Perform calculation',
  cross_check_calculation: 'Cross-check calculation',
  generate_answer: 'Generate answer',
  validate_citations: 'Cite every material conclusion',
  completed: 'Research complete',
  blocked: 'Blocked — need more information',
  failed: 'Research failed',
}

export const ResearchRunSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  question: z.string(),
  status: z.enum(['running', 'completed', 'blocked', 'failed']),
  currentStage: ResearchStageSchema,
  stages: z.array(ResearchStageRecordSchema),
  facts: FactExtractionResultSchema.optional(),
  issues: z.array(AccountingIssueSchema).default([]),
  context: ResearchContextSchema.optional(),
  primarySources: z.array(RetrievedSourceSchema).default([]),
  secondarySources: z.array(RetrievedSourceSchema).default([]),
  passages: z.array(RelevantPassageSchema).default([]),
  conclusions: z.array(MaterialConclusionSchema).default([]),
  citationCoverage: CitationCoverageResultSchema.optional(),
  calculation: CalculationValidationResultSchema.optional(),
  finalAnswer: z.string().optional(),
  insufficientAuthority: z.boolean().default(false),
  usedMockProvider: z.boolean().default(false),
  usedResponsesApi: z.boolean().default(false),
  researchVersion: z.string().default('research-workflow-v1'),
  openaiStore: z.boolean().default(false),
  mockLabeled: z.boolean().optional(),
})
export type ResearchRun = z.infer<typeof ResearchRunSchema>

export type ResearchProgressEvent =
  | { type: 'run_started'; runId: string; question: string }
  | { type: 'stage_started'; runId: string; stage: ResearchStage; label: string }
  | {
      type: 'stage_updated'
      runId: string
      stage: ResearchStageRecord
      run: ResearchRun
    }
  | { type: 'stage_completed'; runId: string; stage: ResearchStageRecord }
  | { type: 'run_blocked'; runId: string; run: ResearchRun; message: string }
  | { type: 'run_failed'; runId: string; error: string }
  | {
      type: 'run_completed'
      runId: string
      run: ResearchRun
      content: string
      structuredHint?: Record<string, unknown>
    }
