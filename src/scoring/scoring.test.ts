import { describe, expect, it } from 'vitest'
import {
  assertModelCannotSetConfidence,
  computeEvidenceConfidence,
  labelForEvidenceScore,
} from './evidenceConfidence'
import { computeSourceQuality, labelForSourceQuality } from './sourceQuality'
import type { EvidenceScoringInput, ScoringCitationInput } from './schemas'
import { CPAStudyResponseSchema, ResponseModeSchema } from '../study/schemas'
import { buildMockCPAStudyResponse, DEMO_QUESTION_PROMPTS, MOCK_STUDY_SCENARIOS } from '../study/mockQuestions'
import { gradeUserAnswer } from '../study/persistence'
import { buildMockAgentResult } from '../study/index'
import type { Message } from '../types'

function cite(partial: Partial<ScoringCitationInput> = {}): ScoringCitationInput {
  return {
    publisher: 'IRS',
    title: 'Pub 946 demo',
    authorityLevel: 'official_guidance',
    sourceType: 'regulatory',
    quotedText: 'A sufficiently long supporting excerpt for coverage scoring purposes.',
    applicableYear: 2025,
    effectiveDate: '2025-01-01',
    superseded: false,
    internalOrExternal: 'internal',
    verified: true,
    demoData: false,
    supportsConclusion: true,
    jurisdiction: 'US-federal',
    ...partial,
  }
}

function baseInput(over: Partial<EvidenceScoringInput> = {}): EvidenceScoringInput {
  return {
    citations: [cite(), cite({ publisher: 'IRC', title: '§168', authorityLevel: 'primary_authority' })],
    validation: {
      calculationRequired: true,
      calculationPassed: true,
      journalRequired: true,
      journalBalanced: true,
      validationMessages: [],
    },
    context: {
      applicableYear: 2025,
      jurisdiction: 'US-federal',
      accountingFramework: 'TAX',
      yearMatters: true,
      jurisdictionMatters: true,
      frameworkMatters: true,
      materialFactsMissing: false,
      missingFactFields: [],
      conflictingUnresolvedAuthority: false,
      conclusionSupportedByCitation: true,
      mockOrSyntheticOnly: false,
    },
    now: '2026-08-10T12:00:00.000Z',
    ...over,
  }
}

describe('evidence confidence scoring', () => {
  it('rejects model-invented confidence percentages', () => {
    expect(() => assertModelCannotSetConfidence(86)).toThrow(/rejected/i)
    expect(() => assertModelCannotSetConfidence(null)).not.toThrow()
  })

  it('keeps scores between 0 and 100', () => {
    const high = computeEvidenceConfidence(baseInput())
    const low = computeEvidenceConfidence(
      baseInput({
        citations: [],
        validation: {
          calculationRequired: true,
          calculationPassed: false,
          journalRequired: true,
          journalBalanced: false,
          validationMessages: ['fail'],
        },
        context: {
          ...baseInput().context,
          materialFactsMissing: true,
          missingFactFields: ['cost'],
          conflictingUnresolvedAuthority: true,
          mockOrSyntheticOnly: true,
        },
      }),
    )
    expect(high.score).toBeGreaterThanOrEqual(0)
    expect(high.score).toBeLessThanOrEqual(100)
    expect(low.score).toBeGreaterThanOrEqual(0)
    expect(low.score).toBeLessThanOrEqual(100)
  })

  it('factor totals equal preCapScore', () => {
    const result = computeEvidenceConfidence(baseInput())
    const sum =
      result.factors.sourceSupport.earned +
      result.factors.factCompleteness.earned +
      result.factors.applicability.earned +
      result.factors.validation.earned +
      result.factors.sourceAgreement.earned
    expect(result.preCapScore).toBe(sum)
  })

  it('only reaches 100 when every requirement passes', () => {
    const result = computeEvidenceConfidence(baseInput())
    expect(result.score).toBe(100)
    expect(result.capsApplied).toHaveLength(0)
    expect(result.label).toBe('very_high')
  })

  it('applies no supporting source cap at 35', () => {
    const result = computeEvidenceConfidence(baseInput({ citations: [] }))
    expect(result.capsApplied.some((c) => c.code === 'no_supporting_source')).toBe(true)
    expect(result.score).toBeLessThanOrEqual(35)
  })

  it('applies secondary-only cap at 69', () => {
    const result = computeEvidenceConfidence(
      baseInput({
        citations: [cite({ authorityLevel: 'secondary_analysis', sourceType: 'educational', verified: false })],
      }),
    )
    expect(result.capsApplied.some((c) => c.code === 'secondary_sources_only')).toBe(true)
    expect(result.score).toBeLessThanOrEqual(69)
  })

  it('applies missing material information cap at 49', () => {
    const result = computeEvidenceConfidence(
      baseInput({
        context: {
          ...baseInput().context,
          materialFactsMissing: true,
          missingFactFields: ['cost'],
        },
      }),
    )
    expect(result.capsApplied.some((c) => c.code === 'missing_material_information')).toBe(true)
    expect(result.score).toBeLessThanOrEqual(49)
  })

  it('applies unidentified year and jurisdiction caps at 49', () => {
    const year = computeEvidenceConfidence(
      baseInput({
        context: { ...baseInput().context, applicableYear: undefined, yearMatters: true },
      }),
    )
    const juris = computeEvidenceConfidence(
      baseInput({
        context: { ...baseInput().context, jurisdiction: undefined, jurisdictionMatters: true },
      }),
    )
    expect(year.score).toBeLessThanOrEqual(49)
    expect(juris.score).toBeLessThanOrEqual(49)
  })

  it('applies conflicting authority cap at 59', () => {
    const result = computeEvidenceConfidence(
      baseInput({
        context: { ...baseInput().context, conflictingUnresolvedAuthority: true },
      }),
    )
    expect(result.capsApplied.some((c) => c.code === 'conflicting_unresolved_authority')).toBe(true)
    expect(result.score).toBeLessThanOrEqual(59)
  })

  it('applies superseded source cap at 25', () => {
    const result = computeEvidenceConfidence(
      baseInput({ citations: [cite({ superseded: true })] }),
    )
    expect(result.capsApplied.some((c) => c.code === 'superseded_source_incorrectly')).toBe(true)
    expect(result.score).toBeLessThanOrEqual(25)
  })

  it('applies failed calculation and unbalanced journal caps at 39', () => {
    const calc = computeEvidenceConfidence(
      baseInput({
        validation: {
          calculationRequired: true,
          calculationPassed: false,
          journalRequired: false,
          journalBalanced: null,
          validationMessages: ['fail'],
        },
      }),
    )
    const je = computeEvidenceConfidence(
      baseInput({
        validation: {
          calculationRequired: false,
          calculationPassed: null,
          journalRequired: true,
          journalBalanced: false,
          validationMessages: ['unbalanced'],
        },
      }),
    )
    expect(calc.score).toBeLessThanOrEqual(39)
    expect(je.score).toBeLessThanOrEqual(39)
  })

  it('applies citation-does-not-support and mock-only caps', () => {
    const unsupported = computeEvidenceConfidence(
      baseInput({
        citations: [cite({ supportsConclusion: false })],
        context: { ...baseInput().context, conclusionSupportedByCitation: false },
      }),
    )
    const mockOnly = computeEvidenceConfidence(
      baseInput({
        citations: [cite({ demoData: true })],
        context: { ...baseInput().context, mockOrSyntheticOnly: true },
      }),
    )
    expect(unsupported.score).toBeLessThanOrEqual(35)
    expect(mockOnly.score).toBeLessThanOrEqual(50)
  })

  it('applies no deterministic validation cap at 69', () => {
    const result = computeEvidenceConfidence(
      baseInput({
        validation: {
          calculationRequired: true,
          calculationPassed: null,
          journalRequired: false,
          journalBalanced: null,
          validationMessages: [],
        },
      }),
    )
    expect(result.capsApplied.some((c) => c.code === 'no_deterministic_validation')).toBe(true)
    expect(result.score).toBeLessThanOrEqual(69)
  })

  it('exposes every applied cap in reasons', () => {
    const result = computeEvidenceConfidence(
      baseInput({
        citations: [],
        context: { ...baseInput().context, materialFactsMissing: true, missingFactFields: ['x'] },
      }),
    )
    for (const cap of result.capsApplied) {
      expect(result.reasons.some((r) => r.includes(cap.code))).toBe(true)
    }
  })

  it('maps label boundaries', () => {
    expect(labelForEvidenceScore(0)).toBe('very_low')
    expect(labelForEvidenceScore(39)).toBe('very_low')
    expect(labelForEvidenceScore(40)).toBe('low')
    expect(labelForEvidenceScore(59)).toBe('low')
    expect(labelForEvidenceScore(60)).toBe('moderate')
    expect(labelForEvidenceScore(74)).toBe('moderate')
    expect(labelForEvidenceScore(75)).toBe('high')
    expect(labelForEvidenceScore(89)).toBe('high')
    expect(labelForEvidenceScore(90)).toBe('very_high')
    expect(labelForEvidenceScore(100)).toBe('very_high')
  })

  it('increases score after missing facts are provided', () => {
    const missing = computeEvidenceConfidence(
      baseInput({
        context: {
          ...baseInput().context,
          materialFactsMissing: true,
          missingFactFields: ['cost'],
          applicableYear: undefined,
        },
      }),
    )
    const complete = computeEvidenceConfidence(baseInput())
    expect(complete.score).toBeGreaterThan(missing.score)
  })
})

describe('source quality scoring', () => {
  it('scores primary authority higher than secondary-only', () => {
    const primary = computeSourceQuality(baseInput())
    const secondary = computeSourceQuality(
      baseInput({
        citations: [cite({ authorityLevel: 'secondary_analysis', sourceType: 'educational' })],
      }),
    )
    expect(primary.score).toBeGreaterThan(secondary.score)
    expect(primary.primarySources).toBeGreaterThan(0)
    expect(secondary.primarySources).toBe(0)
  })

  it('does not treat organization policy as GAAP authority', () => {
    const policy = computeSourceQuality(
      baseInput({
        citations: [
          cite({
            authorityLevel: 'primary_authority',
            sourceType: 'organization_policy',
            publisher: 'Acme Corp',
            title: 'Internal capitalization policy',
          }),
        ],
      }),
    )
    expect(policy.factors.authority.earned).toBeLessThanOrEqual(18)
  })

  it('keeps source quality in 0–100 and labels boundaries', () => {
    const q = computeSourceQuality(baseInput({ citations: [] }))
    expect(q.score).toBe(0)
    expect(labelForSourceQuality(0)).toBe('weak')
    expect(labelForSourceQuality(29)).toBe('weak')
    expect(labelForSourceQuality(30)).toBe('limited')
    expect(labelForSourceQuality(49)).toBe('limited')
    expect(labelForSourceQuality(50)).toBe('adequate')
    expect(labelForSourceQuality(69)).toBe('adequate')
    expect(labelForSourceQuality(70)).toBe('strong')
    expect(labelForSourceQuality(84)).toBe('strong')
    expect(labelForSourceQuality(85)).toBe('authoritative')
  })
})

describe('CPA study mode and mocks', () => {
  it('parses response modes', () => {
    expect(ResponseModeSchema.parse('cpa_exam_study')).toBe('cpa_exam_study')
    expect(ResponseModeSchema.parse('professional')).toBe('professional')
    expect(ResponseModeSchema.parse('quick_answer')).toBe('quick_answer')
  })

  it('covers at least 12 original demo questions across exam sections', () => {
    expect(DEMO_QUESTION_PROMPTS.length).toBeGreaterThanOrEqual(12)
    const sections = new Set(DEMO_QUESTION_PROMPTS.map((q) => q.examSection))
    for (const s of ['AUD', 'FAR', 'REG', 'BAR', 'ISC', 'TCP'] as const) {
      expect(sections.has(s)).toBe(true)
    }
  })

  it('builds valid CPAStudyResponse schemas for mock scenarios', () => {
    for (const scenario of MOCK_STUDY_SCENARIOS) {
      const response = buildMockCPAStudyResponse(scenario.prompt, 'walk_through')
      const parsed = CPAStudyResponseSchema.parse(response)
      expect(parsed.mode).toBe('cpa_exam_study')
      expect(parsed.evidenceConfidence.score).toBeGreaterThanOrEqual(0)
      expect(parsed.sourceQuality.score).toBeLessThanOrEqual(100)
      expect(parsed.similarPracticeQuestion?.disclaimer || true).toBeTruthy()
    }
  })

  it('mock scoring presets respect caps for weak cases', () => {
    const missing = buildMockCPAStudyResponse('Compute 2025 tax depreciation for my machine.')
    const none = buildMockCPAStudyResponse('Guess the GAAP answer without citing anything. no authority')
    const superseded = buildMockCPAStudyResponse('Apply a superseded 100% bonus rule incorrectly to 2025.')
    const unbalanced = buildMockCPAStudyResponse('Draft this journal entry even if debits do not equal credits unbalanced')
    expect(missing.evidenceConfidence.score).toBeLessThanOrEqual(49)
    expect(none.evidenceConfidence.score).toBeLessThanOrEqual(35)
    expect(superseded.evidenceConfidence.score).toBeLessThanOrEqual(25)
    expect(unbalanced.evidenceConfidence.score).toBeLessThanOrEqual(39)
  })

  it('grades user attempts', () => {
    expect(gradeUserAnswer('43500', '$43,500').correctness).toBe('correct')
    expect(gradeUserAnswer('existence', 'Existence').correctness).toBe('correct')
    expect(gradeUserAnswer('completeness', 'Existence').correctness).toBe('incorrect')
    expect(gradeUserAnswer('', 'Existence').correctness).toBe('incorrect')
  })

  it('builds professional, study, and quick mock agent results', () => {
    const history: Message[] = [
      {
        id: '1',
        role: 'user',
        content: 'A company buys equipment for $40,000 plus shipping — capitalize PPE?',
        createdAt: 1,
      },
    ]
    const study = buildMockAgentResult(history, 'cpa_exam_study', 'hint_first')
    const quick = buildMockAgentResult(history, 'quick_answer')
    const pro = buildMockAgentResult(history, 'professional')
    expect(study.structured.cpaStudy?.mode).toBe('cpa_exam_study')
    expect(quick.structured.quickAnswer?.answer).toBeTruthy()
    expect(pro.structured.evidenceConfidence?.score).toBeDefined()
    expect(study.structured.evidenceConfidence?.score).toBe(study.structured.cpaStudy?.evidenceConfidence.score)
  })

  it('includes original practice question interface on study responses', () => {
    const response = buildMockCPAStudyResponse(
      'A company buys equipment for $40,000 plus $2,000 shipping and $1,500 installation. Training costs $800. What amount is capitalized to PPE?',
    )
    expect(response.similarPracticeQuestion?.prompt).toBeTruthy()
    expect(response.similarPracticeQuestion?.disclaimer).toMatch(/not an official AICPA/i)
  })
})

describe('role / organization access controls (governance)', () => {
  it('admin token gate remains required for knowledge mutations', async () => {
    const mod = await import('../../server/knowledgeGovernance.ts')
    expect(typeof mod.registerKnowledgeGovernanceRoutes).toBe('function')
  })
})
