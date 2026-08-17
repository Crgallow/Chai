import { describe, expect, it } from 'vitest'
import {
  inferAuditFramework,
  isIrrelevantStatuteForAudit,
  parseAuditQuestion,
  buildAuditSearchQueries,
  computeAuditAnswerConfidence,
} from './auditResearch.ts'
import { classifyResearchContext } from './sufficiency/engine.ts'

describe('audit research framework inference', () => {
  const failedQuestion = `You are auditing a privately held manufacturing company under U.S. GAAS for the year ended December 31, 2025. Inventory represents 38% of total assets. The auditor did not attend the year-end physical inventory count because the client failed to notify the audit team of the count date. The client has perpetual inventory records, count sheets, purchase invoices and subsequent sales records. Management refuses to perform another physical count. What procedures should the auditor perform? If sufficient appropriate audit evidence cannot be obtained, what effect should this have on the auditor’s opinion? Identify and cite the applicable AU-C standards, and explain whether the answer would change if the company were a public company audited under PCAOB standards.`

  it('selects AICPA as primary and PCAOB as comparison for the failed test question', () => {
    const fw = inferAuditFramework(failedQuestion)
    expect(fw.primary).toBe('AICPA')
    expect(fw.comparison).toBe('PCAOB')
    expect(fw.issuerStatus).toBe('nonissuer')

    const ctx = classifyResearchContext(failedQuestion)
    expect(ctx.category).toBe('audit')
    expect(ctx.auditFramework).toBe('AICPA')
  })

  it('parses inventory / scope / opinion issues', () => {
    const parsed = parseAuditQuestion(failedQuestion)
    expect(parsed?.primaryFramework).toBe('AICPA')
    expect(parsed?.primaryCodification).toBe('AU-C')
    expect(parsed?.comparisonFramework).toBe('PCAOB')
    expect(parsed?.issues.some((i) => /inventory observation/i.test(i))).toBe(true)
    expect(parsed?.issues.some((i) => /scope limitation/i.test(i))).toBe(true)
    expect(parsed?.issues.some((i) => /qualified/i.test(i))).toBe(true)
  })

  it('builds AU-C targeted queries, not USC bag queries', () => {
    const parsed = parseAuditQuestion(failedQuestion)!
    const qs = buildAuditSearchQueries(parsed, 'primary')
    expect(qs.some((q) => /AU-C/i.test(q))).toBe(true)
    expect(qs.every((q) => !/united states code/i.test(q))).toBe(true)
  })

  it('blocks unrelated USC titles for audit procedure questions', () => {
    expect(
      isIrrelevantStatuteForAudit({
        question: failedQuestion,
        sourceTitle: 'United States Code Title 15 — Commerce and Trade',
        publisher: 'United States Code (Office of the Law Revision Counsel)',
        category: 'regulatory',
      }),
    ).toBe(true)
  })

  it('caps confidence when wrong framework / irrelevant sources', () => {
    const bad = computeAuditAnswerConfidence({
      correctPrimaryFramework: false,
      wrongPrimaryFramework: true,
      controllingAuthorityFound: false,
      checklistSupported: 1,
      checklistTotal: 10,
      verifiedCitations: 16,
      unverifiedCitations: 0,
      irrelevantSources: 8,
      unansweredMaterialIssues: 5,
      usedOnlySecondary: false,
      materialMissingFacts: 0,
    })
    expect(bad.score).toBeLessThanOrEqual(25)
  })
})
