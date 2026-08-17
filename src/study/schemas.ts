import { z } from 'zod'
import {
  EvidenceConfidenceResultSchema,
  SourceQualityResultSchema,
} from '../scoring/schemas.ts'

export const ResponseModeSchema = z.enum(['professional', 'cpa_exam_study', 'quick_answer'])
export type ResponseMode = z.infer<typeof ResponseModeSchema>

export const StudyPreferenceSchema = z.enum([
  'teach_from_beginning',
  'walk_through',
  'hint_first',
  'answer_first',
  'fastest_exam_method',
])
export type StudyPreference = z.infer<typeof StudyPreferenceSchema>

export const ExamSectionSchema = z.enum(['AUD', 'FAR', 'REG', 'BAR', 'ISC', 'TCP'])
export type ExamSection = z.infer<typeof ExamSectionSchema>

export const StudyStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  isCalculation: z.boolean().optional(),
  formula: z.string().optional(),
})

export const IncorrectChoiceExplanationSchema = z.object({
  choice: z.string(),
  whyWrong: z.string(),
})

export const OriginalPracticeQuestionSchema = z.object({
  prompt: z.string(),
  choices: z.array(z.string()).optional(),
  correctAnswer: z.string(),
  examSection: ExamSectionSchema.optional(),
  topic: z.string(),
  disclaimer: z.string().default(
    'Original practice question for study only — not an official AICPA exam question.',
  ),
})

export const AccountingCalculationResultSchema = z.object({
  formula: z.string(),
  steps: z.array(z.string()),
  result: z.string(),
  passedValidation: z.boolean(),
})

export const StudyJournalEntrySchema = z.object({
  memo: z.string(),
  lines: z.array(
    z.object({
      account: z.string(),
      debit: z.number(),
      credit: z.number(),
    }),
  ),
  balanced: z.boolean(),
  debitCreditExplanation: z.string().optional(),
})

export const AccountingCitationCardSchema = z.object({
  publisher: z.string(),
  title: z.string(),
  authorityType: z.string(),
  section: z.string().optional(),
  paragraph: z.string().optional(),
  page: z.number().optional(),
  applicableYear: z.number().optional(),
  jurisdiction: z.string().optional(),
  effectiveDate: z.string().optional(),
  verificationStatus: z.string(),
  internalOrExternal: z.enum(['internal', 'external']),
  excerpt: z.string().optional(),
  location: z.string().optional(),
  demoData: z.boolean().optional(),
})

export const MissingInformationItemSchema = z.object({
  field: z.string(),
  reason: z.string(),
  material: z.boolean().default(true),
})

export const CPAStudyResponseSchema = z.object({
  mode: z.literal('cpa_exam_study'),
  examSection: ExamSectionSchema.optional(),
  topic: z.string(),
  subtopic: z.string().optional(),
  difficulty: z.enum(['foundational', 'moderate', 'advanced']).optional(),
  correctAnswer: z.string().optional(),
  conceptTested: z.string(),
  relevantFacts: z.array(z.string()),
  distractorFacts: z.array(z.string()),
  ruleToRemember: z.string(),
  steps: z.array(StudyStepSchema),
  calculation: AccountingCalculationResultSchema.optional(),
  journalEntries: z.array(StudyJournalEntrySchema).optional(),
  incorrectChoiceExplanations: z.array(IncorrectChoiceExplanationSchema).optional(),
  commonExamTrap: z.string().optional(),
  memoryShortcut: z.string().optional(),
  similarPracticeQuestion: OriginalPracticeQuestionSchema.optional(),
  assumptions: z.array(z.string()),
  missingInformation: z.array(MissingInformationItemSchema),
  citations: z.array(AccountingCitationCardSchema),
  evidenceConfidence: EvidenceConfidenceResultSchema,
  sourceQuality: SourceQualityResultSchema,
  requiresProfessionalReview: z.boolean(),
  bookVsTaxNote: z.string().optional(),
  applicableTaxYear: z.number().optional(),
  mockLabeled: z.boolean().optional(),
  studyPreferenceApplied: StudyPreferenceSchema.optional(),
  generatedAt: z.string(),
  researchVersion: z.string(),
})

export type CPAStudyResponse = z.infer<typeof CPAStudyResponseSchema>
export type StudyStep = z.infer<typeof StudyStepSchema>
export type OriginalPracticeQuestion = z.infer<typeof OriginalPracticeQuestionSchema>

export const AttemptCorrectnessSchema = z.enum(['correct', 'partially_correct', 'incorrect'])
export type AttemptCorrectness = z.infer<typeof AttemptCorrectnessSchema>

export const StudyAttemptSchema = z.object({
  id: z.string(),
  questionId: z.string(),
  chatId: z.string().optional(),
  messageId: z.string().optional(),
  userAnswer: z.string(),
  correctness: AttemptCorrectnessSchema,
  mistakeCategory: z.string().optional(),
  mistakeExplanation: z.string().optional(),
  createdAt: z.string(),
})

export const SavedStudyQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  topic: z.string(),
  examSection: ExamSectionSchema.optional(),
  chatId: z.string().optional(),
  messageId: z.string().optional(),
  understood: z.boolean().default(false),
  savedAt: z.string(),
})

export const ReviewTopicSchema = z.object({
  id: z.string(),
  topic: z.string(),
  examSection: ExamSectionSchema.optional(),
  addedAt: z.string(),
})

export type StudyAttempt = z.infer<typeof StudyAttemptSchema>
export type SavedStudyQuestion = z.infer<typeof SavedStudyQuestionSchema>
export type ReviewTopic = z.infer<typeof ReviewTopicSchema>

export const RESPONSE_MODE_LABELS: Record<ResponseMode, string> = {
  professional: 'Professional',
  cpa_exam_study: 'CPA Exam Study',
  quick_answer: 'Quick Answer',
}

export const STUDY_PREFERENCE_LABELS: Record<StudyPreference, string> = {
  teach_from_beginning: 'Teach me from the beginning',
  walk_through: 'Walk me through it',
  hint_first: 'Give me a hint first',
  answer_first: 'Let me answer first',
  fastest_exam_method: 'Show me the fastest exam method',
}
