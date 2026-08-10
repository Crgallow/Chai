import { z } from 'zod'

export const SourceTypeSchema = z.enum([
  'authoritative',
  'regulatory',
  'secondary',
  'educational',
  'organization_policy',
])

export const CategorySchema = z.enum([
  'tax',
  'audit',
  'financial_accounting',
  'managerial_accounting',
  'regulatory',
  'company_policy',
])

export const AuthorityLevelSchema = z.enum([
  'primary_authority',
  'official_guidance',
  'professional_standard',
  'secondary_analysis',
  'internal_policy',
])

export const LicensingStatusSchema = z.enum([
  'public',
  'licensed',
  'restricted',
  'permission_required',
  'unknown',
])

export const KnowledgeStatusSchema = z.enum([
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'disabled',
  'superseded',
])

export const IndexingStatusSchema = z.enum([
  'not_started',
  'processing',
  'indexed',
  'failed',
])

export const VerificationStatusSchema = z.enum([
  'unverified',
  'verified',
  'requires_reverification',
])

export const KnowledgeSourceSchema = z.object({
  id: z.string(),
  organizationId: z.string().optional(),
  publisher: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  sourceType: SourceTypeSchema,
  category: CategorySchema,
  topic: z.string().optional(),
  subtopic: z.string().optional(),
  accountingFramework: z.enum(['US_GAAP', 'IFRS', 'TAX', 'OTHER']).optional(),
  auditFramework: z.enum(['AICPA', 'PCAOB', 'GAGAS', 'OTHER']).optional(),
  jurisdiction: z.string().optional(),
  taxYear: z.number().int().optional(),
  entityTypes: z.array(z.string()).optional(),
  publicPrivateApplicability: z
    .enum(['public', 'private', 'both', 'not_applicable'])
    .optional(),
  effectiveDate: z.string().optional(),
  supersededDate: z.string().optional(),
  supersedesSourceId: z.string().optional(),
  authorityLevel: AuthorityLevelSchema,
  licensingStatus: LicensingStatusSchema,
  sourceUrl: z.string().optional(),
  storagePath: z.string().optional(),
  originalFileName: z.string().optional(),
  mimeType: z.string().optional(),
  fileSize: z.number().optional(),
  checksum: z.string().optional(),
  status: KnowledgeStatusSchema,
  indexingStatus: IndexingStatusSchema,
  indexingError: z.string().optional(),
  verificationStatus: VerificationStatusSchema,
  lastVerifiedAt: z.string().optional(),
  lastVerifiedBy: z.string().optional(),
  extractedTextPreview: z.string().optional(),
  version: z.number().int().default(1),
  previousVersionId: z.string().optional(),
  createdAt: z.string(),
  createdBy: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string(),
  reviewReason: z.string().optional(),
})

export const DocumentChunkSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  chunkIndex: z.number().int(),
  text: z.string(),
  page: z.number().int().optional(),
  section: z.string().optional(),
  paragraph: z.string().optional(),
  headingHierarchy: z.array(z.string()).optional(),
  applicableYear: z.number().int().optional(),
  jurisdiction: z.string().optional(),
  effectiveDate: z.string().optional(),
  authorityLevel: AuthorityLevelSchema.optional(),
  documentStatus: KnowledgeStatusSchema.optional(),
  startOffset: z.number().int().optional(),
  endOffset: z.number().int().optional(),
})

export const MissingInformationItemSchema = z.object({
  field: z.string(),
  reason: z.string(),
  material: z.boolean().default(true),
})

export const AccountingResearchContextSchema = z.object({
  category: z.enum([
    'tax',
    'audit',
    'financial_accounting',
    'managerial_accounting',
    'regulatory',
    'unknown',
  ]),
  topic: z.string().optional(),
  applicableYear: z.number().int().optional(),
  jurisdiction: z.string().optional(),
  accountingFramework: z.string().optional(),
  auditFramework: z.string().optional(),
  entityType: z.string().optional(),
  publicPrivateApplicability: z.string().optional(),
  bookOrTax: z.enum(['book', 'tax', 'both', 'unknown']).default('unknown'),
  missingInformation: z.array(MissingInformationItemSchema).default([]),
})

export const SourceSufficiencyResultSchema = z.object({
  sufficient: z.boolean(),
  score: z.number(),
  reasons: z.array(z.string()),
  deficiencies: z.array(z.string()),
  conflictingSourceIds: z.array(z.string()),
  requiresExternalResearch: z.boolean(),
  requiresHumanReview: z.boolean(),
})

export const AccountingCitationSchema = z.object({
  sourceId: z.string().optional(),
  publisher: z.string(),
  title: z.string(),
  sourceType: z.string(),
  authorityLevel: z.string(),
  section: z.string().optional(),
  paragraph: z.string().optional(),
  page: z.number().optional(),
  quotedText: z.string().optional(),
  sourceUrl: z.string().optional(),
  applicableYear: z.number().optional(),
  effectiveDate: z.string().optional(),
  retrievedAt: z.string().optional(),
  internalOrExternal: z.enum(['internal', 'external']),
  verified: z.boolean(),
  demoData: z.boolean().optional(),
})

export const AccountingResearchResponseSchema = z.object({
  conclusion: z.string().optional(),
  explanation: z.string().optional(),
  context: AccountingResearchContextSchema,
  factsReliedUpon: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  missingInformation: z.array(MissingInformationItemSchema).default([]),
  citations: z.array(AccountingCitationSchema).default([]),
  sourceSufficiency: SourceSufficiencyResultSchema,
  warnings: z.array(z.string()).default([]),
  confidence: z.object({
    level: z.enum(['low', 'medium', 'high']),
    reason: z.string(),
  }),
  requiresProfessionalReview: z.boolean(),
  unableToConclude: z.boolean(),
  usedMockRetrieval: z.boolean().default(true),
  usedOfficialResearch: z.boolean().default(false),
  officialResearchDisclosed: z.boolean().default(false),
})

export const AuditRecordSchema = z.object({
  id: z.string(),
  actor: z.string(),
  organizationId: z.string().optional(),
  action: z.string(),
  target: z.string(),
  timestamp: z.string(),
  beforeSummary: z.string().optional(),
  afterSummary: z.string().optional(),
  reason: z.string().optional(),
  result: z.enum(['success', 'failure', 'denied']),
  correlationId: z.string().optional(),
})

export const DomainAllowlistEntrySchema = z.object({
  domain: z.string(),
  publisher: z.string().optional(),
  addedAt: z.string(),
  addedBy: z.string(),
  enabled: z.boolean().default(true),
})

export const ExternalCandidateSchema = z.object({
  id: z.string(),
  title: z.string(),
  publisher: z.string(),
  url: z.string(),
  retrievedAt: z.string(),
  applicableYear: z.number().optional(),
  quotedSection: z.string().optional(),
  status: z.enum(['pending_review', 'promoted', 'rejected']).default('pending_review'),
  organizationId: z.string().optional(),
})

export const KnowledgeUploadMetaSchema = z.object({
  publisher: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  sourceType: SourceTypeSchema,
  category: CategorySchema,
  topic: z.string().optional(),
  subtopic: z.string().optional(),
  accountingFramework: z.enum(['US_GAAP', 'IFRS', 'TAX', 'OTHER']).optional(),
  auditFramework: z.enum(['AICPA', 'PCAOB', 'GAGAS', 'OTHER']).optional(),
  jurisdiction: z.string().optional(),
  taxYear: z.coerce.number().int().optional(),
  entityTypes: z.array(z.string()).optional(),
  publicPrivateApplicability: z
    .enum(['public', 'private', 'both', 'not_applicable'])
    .optional(),
  effectiveDate: z.string().optional(),
  authorityLevel: AuthorityLevelSchema,
  licensingStatus: LicensingStatusSchema,
  sourceUrl: z.string().optional(),
  organizationId: z.string().optional(),
})

export type KnowledgeSource = z.infer<typeof KnowledgeSourceSchema>
export type DocumentChunk = z.infer<typeof DocumentChunkSchema>
export type AccountingResearchContext = z.infer<typeof AccountingResearchContextSchema>
export type SourceSufficiencyResult = z.infer<typeof SourceSufficiencyResultSchema>
export type AccountingCitation = z.infer<typeof AccountingCitationSchema>
export type AccountingResearchResponse = z.infer<typeof AccountingResearchResponseSchema>
export type AuditRecord = z.infer<typeof AuditRecordSchema>
export type DomainAllowlistEntry = z.infer<typeof DomainAllowlistEntrySchema>
export type ExternalCandidate = z.infer<typeof ExternalCandidateSchema>
export type KnowledgeUploadMeta = z.infer<typeof KnowledgeUploadMetaSchema>
export type MissingInformationItem = z.infer<typeof MissingInformationItemSchema>
