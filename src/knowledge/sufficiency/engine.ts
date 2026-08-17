import type {
  AccountingResearchContext,
  KnowledgeSource,
  MissingInformationItem,
  SourceSufficiencyResult,
} from '../schemas.ts'
import type { KnowledgeSearchResult } from '../retrieval/retriever.ts'
import { inferAuditFramework } from '../auditResearch.ts'

const PRIMARY = new Set(['primary_authority', 'official_guidance', 'professional_standard'])

export function classifyResearchContext(question: string): AccountingResearchContext {
  const q = question.toLowerCase()
  const missing: MissingInformationItem[] = []

  let category: AccountingResearchContext['category'] = 'unknown'
  if (/(tax|irs|macrs|§|section 179|depreciat)/.test(q)) category = 'tax'
  else if (/(audit|pcaob|aicpa|as\s?\d|gaas|au-?c|inventory\s+count|scope\s+limitation|disclaimer|qualified\s+opinion)/.test(q))
    category = 'audit'
  else if (/(gaap|asc|ifrs|financial statement|ppe)/.test(q)) category = 'financial_accounting'
  else if (/(budget|managerial|cost accounting)/.test(q)) category = 'managerial_accounting'
  else if (/(sec|regulation|regulator)/.test(q)) category = 'regulatory'

  const yearMatch = q.match(/\b(20\d{2})\b/)
  const applicableYear = yearMatch ? Number(yearMatch[1]) : undefined

  let jurisdiction: string | undefined
  if (/us[- ]?federal|federal|irs|united\s+states|\bu\.?s\.?\b/.test(q)) jurisdiction = 'US-federal'
  else if (/state/.test(q) && !/statement/.test(q)) jurisdiction = undefined

  let bookOrTax: AccountingResearchContext['bookOrTax'] = 'unknown'
  if (/book and tax|book vs tax|book versus tax/.test(q)) bookOrTax = 'both'
  else if (/\btax\b/.test(q) && !/\bbook\b/.test(q)) bookOrTax = 'tax'
  else if (/\bbook\b/.test(q) && !/\btax\b/.test(q)) bookOrTax = 'book'

  const auditInf = inferAuditFramework(question)
  let auditFramework: string | undefined = auditInf.primary
  // Explicit AICPA/PCAOB tokens still win if inference missed
  if (/pcaob/.test(q) && !auditFramework) auditFramework = 'PCAOB'
  if (/aicpa|au-?c|u\.?s\.?\s*gaas|\bgaas\b/.test(q) && auditInf.primary !== 'PCAOB') {
    auditFramework = auditInf.primary ?? 'AICPA'
  }

  let accountingFramework: string | undefined
  if (/gaap|asc/.test(q)) accountingFramework = 'US_GAAP'
  if (/ifrs/.test(q)) accountingFramework = 'IFRS'
  if (category === 'tax') accountingFramework = accountingFramework ?? 'TAX'

  if (category === 'tax' && !applicableYear) {
    missing.push({ field: 'applicableYear', reason: 'Tax year is material for authoritative tax guidance.', material: true })
  }
  if (category === 'tax' && !jurisdiction) {
    missing.push({
      field: 'jurisdiction',
      reason: 'Federal vs state jurisdiction is material for tax research.',
      material: true,
    })
  }
  if (category === 'audit' && !auditFramework) {
    missing.push({
      field: 'auditFramework',
      reason: 'AICPA vs PCAOB standards differ; framework is material.',
      material: true,
    })
  }

  return {
    category,
    topic: /depreciat/.test(q)
      ? 'depreciation'
      : /inventory/.test(q)
        ? 'inventory observation'
        : category === 'audit'
          ? 'audit procedures'
          : undefined,
    applicableYear,
    jurisdiction,
    accountingFramework,
    auditFramework,
    entityType:
      auditInf.issuerStatus === 'nonissuer'
        ? 'nonissuer'
        : auditInf.issuerStatus === 'issuer'
          ? 'issuer'
          : undefined,
    publicPrivateApplicability: auditInf.publicPrivate,
    bookOrTax,
    missingInformation: missing,
  }
}

export function evaluateSourceSufficiency(input: {
  context: AccountingResearchContext
  results: KnowledgeSearchResult[]
  proposedConclusion?: string
}): SourceSufficiencyResult {
  const reasons: string[] = []
  const deficiencies: string[] = []
  const conflictingSourceIds: string[] = []
  const materialMissing = input.context.missingInformation.filter((m) => m.material)

  if (materialMissing.length) {
    deficiencies.push(...materialMissing.map((m) => `Missing ${m.field}: ${m.reason}`))
  }

  const usable = input.results.filter((r) => r.source.verificationStatus !== 'unverified' || r.source.sourceType === 'organization_policy')
  // Unverified authoritative sources should not drive final conclusions
  const verifiedOrPolicy = input.results.filter(
    (r) =>
      r.source.verificationStatus === 'verified' ||
      r.source.authorityLevel === 'internal_policy' ||
      r.source.licensingStatus === 'public',
  )

  const authoritative = verifiedOrPolicy.filter((r) => PRIMARY.has(r.source.authorityLevel))
  if (!authoritative.length && !verifiedOrPolicy.some((r) => r.source.authorityLevel === 'internal_policy')) {
    deficiencies.push('No verified authoritative or appropriate source found.')
  } else {
    reasons.push(`Found ${authoritative.length || verifiedOrPolicy.length} potentially usable source hit(s).`)
  }

  for (const r of input.results) {
    if (input.context.applicableYear && r.source.taxYear && r.source.taxYear !== input.context.applicableYear) {
      deficiencies.push(`Year mismatch for ${r.source.id}`)
    }
    if (
      input.context.auditFramework &&
      r.source.auditFramework &&
      r.source.auditFramework !== input.context.auditFramework
    ) {
      deficiencies.push(
        `Audit framework mismatch: source ${r.source.auditFramework} vs needed ${input.context.auditFramework}`,
      )
      conflictingSourceIds.push(r.source.id)
    }
    if (
      input.context.accountingFramework &&
      r.source.accountingFramework &&
      r.source.accountingFramework !== input.context.accountingFramework &&
      !(input.context.category === 'tax' && r.source.accountingFramework === 'TAX')
    ) {
      deficiencies.push(
        `Accounting framework mismatch: source ${r.source.accountingFramework} vs needed ${input.context.accountingFramework}`,
      )
      conflictingSourceIds.push(r.source.id)
    }
    if (r.source.status === 'superseded' && input.context.applicableYear && r.source.taxYear === input.context.applicableYear) {
      reasons.push(`Historical superseded source ${r.source.id} allowed for year ${input.context.applicableYear}`)
    }
    if (['unknown', 'permission_required'].includes(r.source.licensingStatus) && r.source.status === 'approved') {
      deficiencies.push(`Licensing status ${r.source.licensingStatus} limits reliance on ${r.source.id}`)
    }
    if (r.source.verificationStatus === 'unverified' && PRIMARY.has(r.source.authorityLevel)) {
      deficiencies.push(`Unverified authoritative source excluded from final support: ${r.source.id}`)
    }
  }

  // Conflict: primary sources disagree on framework or year messaging
  const frameworks = new Set(
    authoritative.map((r) => r.source.auditFramework || r.source.accountingFramework).filter(Boolean),
  )
  if (frameworks.size > 1) {
    deficiencies.push('Conflicting frameworks among retrieved authoritative sources.')
    conflictingSourceIds.push(...authoritative.map((r) => r.source.id))
  }

  const hasDirectSupport = authoritative.some((r) => r.score >= 0.25) || verifiedOrPolicy.some((r) => r.score >= 0.35)
  if (!hasDirectSupport) deficiencies.push('Retrieved text does not appear to directly support a conclusion.')

  const requiresHumanReview = conflictingSourceIds.length > 0 || deficiencies.some((d) => /conflict|mismatch/i.test(d))
  const sufficient =
    materialMissing.length === 0 &&
    hasDirectSupport &&
    (authoritative.length > 0 || verifiedOrPolicy.some((r) => r.source.authorityLevel === 'internal_policy')) &&
    !deficiencies.some((d) => /No verified authoritative|does not appear to directly support|Unverified authoritative/i.test(d))

  // Internal policy alone never "sufficient" for legal/professional authority questions
  const onlyInternal =
    verifiedOrPolicy.length > 0 &&
    verifiedOrPolicy.every((r) => r.source.authorityLevel === 'internal_policy' || r.source.sourceType === 'organization_policy')
  const topicNeedsAuthority = ['tax', 'audit', 'financial_accounting', 'regulatory'].includes(input.context.category)
  const hasFrameworkConflict = deficiencies.some((d) => /framework mismatch/i.test(d))
  const finalSufficient =
    sufficient &&
    !(onlyInternal && topicNeedsAuthority) &&
    !hasFrameworkConflict &&
    !deficiencies.some((d) => /Year mismatch/i.test(d))

  if (onlyInternal && topicNeedsAuthority) {
    deficiencies.push('Internal policy cannot serve as primary legal or professional authority.')
  }

  let score = finalSufficient ? 0.75 : Math.max(0.1, Math.min(0.6, (usable.length || 0) * 0.1))
  if (requiresHumanReview) score = Math.min(score, 0.45)
  if (materialMissing.length) score = Math.min(score, 0.3)

  return {
    sufficient: finalSufficient,
    score,
    reasons,
    deficiencies,
    conflictingSourceIds: [...new Set(conflictingSourceIds)],
    requiresExternalResearch: !finalSufficient && materialMissing.length === 0,
    requiresHumanReview: requiresHumanReview || !finalSufficient,
  }
}

export function labelSourceBadge(source: KnowledgeSource): string[] {
  const badges: string[] = []
  if (source.sourceType === 'authoritative' || source.sourceType === 'regulatory') badges.push('Authoritative')
  if (source.sourceType === 'secondary' || source.sourceType === 'educational') badges.push('Secondary')
  if (source.sourceType === 'organization_policy' || source.authorityLevel === 'internal_policy') {
    badges.push('Internal policy')
  }
  badges.push(source.status.replace('_', ' '))
  if (source.verificationStatus === 'verified') badges.push('Verified')
  if (source.verificationStatus === 'requires_reverification') badges.push('Reverification required')
  if (['restricted', 'permission_required', 'unknown'].includes(source.licensingStatus)) {
    badges.push('Licensing restricted')
  }
  if (source.status === 'superseded') badges.push('Superseded')
  return badges
}
