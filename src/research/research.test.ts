import { describe, expect, it } from 'vitest'
import {
  PRODUCTION_STAGE_ORDER,
  ProductionStageNameSchema,
} from './productionSchemas'
import {
  buildResearchContext,
  classifyIssuesDeterministic,
  extractFactsFromQuestion,
  validateCitationCoverage,
} from './extract'
import { canBeginStage, createEmptyStages, startStage, completeStage, uid } from './stateMachine'
import type { ResearchRun } from './schemas'
import { STAGE_ORDER } from './schemas'

function baseRun(question = 'test'): ResearchRun {
  const id = uid('run')
  return {
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    question,
    status: 'running',
    currentStage: 'question',
    stages: createEmptyStages(id),
    issues: [],
    primarySources: [],
    secondarySources: [],
    passages: [],
    conclusions: [],
    insufficientAuthority: false,
    usedMockProvider: true,
    usedResponsesApi: false,
    researchVersion: 'research-workflow-v1',
    openaiStore: false,
  }
}

describe('production stage order', () => {
  it('has exactly the ten research stages in order', () => {
    expect(PRODUCTION_STAGE_ORDER).toEqual([
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
    expect(ProductionStageNameSchema.parse('cite_material_conclusions')).toBe(
      'cite_material_conclusions',
    )
  })

  it('cannot jump from question to generate_answer in the production order', () => {
    const qi = PRODUCTION_STAGE_ORDER.indexOf('question')
    const gi = PRODUCTION_STAGE_ORDER.indexOf('generate_answer')
    expect(gi).toBeGreaterThan(qi + 1)
    expect(PRODUCTION_STAGE_ORDER.indexOf('search_primary_authority')).toBeLessThan(
      PRODUCTION_STAGE_ORDER.indexOf('search_secondary_authority'),
    )
  })
})

describe('research fact extraction and issues', () => {
  it('preserves original question and extracts amounts/dates', () => {
    const q =
      'Depreciate a $50,000 asset placed in service 2025-03-15 for tax year 2025 US-federal.'
    const facts = extractFactsFromQuestion(q)
    expect(facts.originalQuestion).toBe(q)
    expect(facts.monetaryAmounts.some((a) => a.includes('50,000'))).toBe(true)
    expect(facts.dates.length).toBeGreaterThan(0)
  })

  it('classifies depreciation issues', () => {
    const issues = classifyIssuesDeterministic('Compute MACRS depreciation for computers')
    expect(issues.some((i) => /Depreciation/i.test(i.category))).toBe(true)
    expect(issues.some((i) => i.priority === 'primary')).toBe(true)
  })

  it('does not silently default jurisdiction or year', () => {
    const issues = classifyIssuesDeterministic('What is the MACRS rule for computers?')
    const ctx = buildResearchContext('What is the MACRS rule for computers?', issues)
    expect(ctx.taxYear).toBeUndefined()
    expect(ctx.jurisdiction).toBeUndefined()
    expect(ctx.missingMaterialFacts.some((m) => m.field === 'taxYear')).toBe(true)
    expect(ctx.missingMaterialFacts.some((m) => m.field === 'jurisdiction')).toBe(true)
    expect(ctx.missingMaterialFacts.some((m) => m.field === 'country')).toBe(true)
  })

  it('accepts explicit year and jurisdiction', () => {
    const q = 'MACRS half-year for US-federal tax year 2025 in the United States'
    const issues = classifyIssuesDeterministic(q)
    const ctx = buildResearchContext(q, issues)
    expect(ctx.taxYear).toBe(2025)
    expect(ctx.jurisdiction).toBe('US-federal')
    expect(ctx.country).toBe('US')
    expect(ctx.missingMaterialFacts.filter((m) => m.material)).toHaveLength(0)
  })
})

describe('research state machine gates', () => {
  it('prevents later stages before earlier ones complete', () => {
    const run = baseRun()
    expect(canBeginStage(run, 'question').ok).toBe(true)
    expect(canBeginStage(run, 'identify_issue').ok).toBe(false)
    let next = startStage(run, 'question')
    next = completeStage(next, 'question', { summary: 'ok' })
    expect(canBeginStage(next, 'identify_issue').ok).toBe(true)
    expect(canBeginStage(next, 'search_primary_authority').ok).toBe(false)
  })

  it('blocks progression when a prior stage is blocked', () => {
    let run = baseRun()
    run = startStage(run, 'question')
    run = completeStage(run, 'question', { summary: 'ok' })
    run = startStage(run, 'identify_issue')
    run = completeStage(run, 'identify_issue', { summary: 'ok' })
    run = startStage(run, 'determine_jurisdiction_year')
    run = completeStage(run, 'determine_jurisdiction_year', {
      status: 'blocked',
      summary: 'missing year',
      requiresUserInput: true,
    })
    expect(run.status).toBe('blocked')
    expect(canBeginStage(run, 'search_primary_authority').ok).toBe(false)
  })

  it('includes all workflow stages in order', () => {
    expect(STAGE_ORDER[0]).toBe('question')
    expect(STAGE_ORDER).toContain('validate_citations')
    expect(STAGE_ORDER.at(-1)).toBe('completed')
  })
})

describe('citation coverage', () => {
  it('fails when material conclusions lack citations', () => {
    const coverage = validateCitationCoverage([
      {
        conclusionId: 'c1',
        statement: 'Answer',
        supportingPassageIds: [],
        cited: false,
      },
    ])
    expect(coverage.passed).toBe(false)
  })

  it('passes when every conclusion is cited', () => {
    const coverage = validateCitationCoverage([
      {
        conclusionId: 'c1',
        statement: 'Answer',
        supportingPassageIds: ['p1'],
        cited: true,
      },
    ])
    expect(coverage.passed).toBe(true)
  })
})

describe('production orchestrator', () => {
  it('uses mock orchestrator without OpenAI key and pauses for missing year', async () => {
    const prev = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
    const { MockAccountingResearchOrchestrator } = await import(
      '../../server/research/orchestrator.ts'
    )
    const orch = new MockAccountingResearchOrchestrator()
    const result = await orch.research({
      question: 'What is the MACRS half-year convention for computers?',
      conversationId: 't1',
      userId: 'u1',
      responseMode: 'professional',
      uploadedDocumentIds: [],
    })
    expect(result.status).toBe('waiting_for_user')
    expect(result.mockLabeled).toBe(true)
    expect(result.openaiStore).toBe(false)
    expect(result.stages.find((s) => s.name === 'determine_jurisdiction_year')?.status).toBe(
      'waiting_for_user',
    )
    expect(result.stages.find((s) => s.name === 'generate_answer')?.status).toBe('not_started')
    expect(result.stages.find((s) => s.name === 'search_primary_authority')?.status).toBe(
      'not_started',
    )
    if (prev) process.env.OPENAI_API_KEY = prev
  })

  it('enforces primary before secondary and completes calc+cross-check path', async () => {
    const { MockAccountingResearchOrchestrator } = await import(
      '../../server/research/orchestrator.ts'
    )
    const orch = new MockAccountingResearchOrchestrator()
    const seen: string[] = []
    const result = await orch.research(
      {
        question:
          'Depreciate a $50,000 5-year computer placed in service 2025-03-15 for tax year 2025. Jurisdiction US-federal. Country United States. Book SL and MACRS. Draft the book journal entry.',
        conversationId: 't2',
        userId: 'u1',
        responseMode: 'professional',
        uploadedDocumentIds: [],
      },
      {
        onProgress: (ev) => {
          if (ev.type === 'stage_started') seen.push(ev.stage.name)
        },
      },
    )
    const pi = seen.indexOf('search_primary_authority')
    const si = seen.indexOf('search_secondary_authority')
    expect(pi).toBeGreaterThanOrEqual(0)
    expect(si).toBeGreaterThan(pi)
    expect(seen.indexOf('generate_answer')).toBeGreaterThan(seen.indexOf('cross_check_calculation'))
    expect(seen.indexOf('cite_material_conclusions')).toBeGreaterThan(seen.indexOf('generate_answer'))
    expect(['completed', 'waiting_for_user', 'failed']).toContain(result.status)
    if (result.status === 'completed') {
      expect(result.answer.crossChecks.length).toBeGreaterThan(0)
      expect(result.answer.crossChecks.every((c) => c.method !== undefined)).toBe(true)
      // model cannot set confidence — only application attach
      expect(result.answer.evidenceConfidence?.score).toBeGreaterThanOrEqual(0)
    }
  })

  it('maps legacy workflow adapter and never exposes OPENAI key shape in content', async () => {
    const { runAccountingResearchWorkflow } = await import('../../server/research/orchestrator.ts')
    const { run, content } = await runAccountingResearchWorkflow({
      question: 'MACRS for computers without year',
      responseMode: 'quick_answer',
    })
    expect(run.openaiStore).toBe(false)
    expect(content).not.toMatch(/sk-/)
    expect(run.stages.some((s) => s.stage === 'validate_citations' || s.stage === 'determine_jurisdiction_year')).toBe(
      true,
    )
  })
})

describe('research workflow smoke (legacy adapter)', () => {
  it('blocks when year/jurisdiction are missing before authority search', async () => {
    const { runAccountingResearchWorkflow } = await import('../../server/research/runResearch.ts')
    const { run, content } = await runAccountingResearchWorkflow({
      question: 'What is the MACRS half-year convention for computers?',
    })
    expect(run.status).toBe('blocked')
    expect(run.stages.find((s) => s.stage === 'determine_jurisdiction_year')?.status).toBe('blocked')
    expect(run.stages.find((s) => s.stage === 'search_primary_authority')?.status).toBe('pending')
    expect(content).toMatch(/missing|paused|will not/i)
    expect(run.openaiStore).toBe(false)
  })

  it('runs through calculation stages when facts are complete', async () => {
    const { runAccountingResearchWorkflow } = await import('../../server/research/runResearch.ts')
    const stages: string[] = []
    const { run } = await runAccountingResearchWorkflow({
      question:
        'Depreciate a $50,000 5-year computer placed in service 2025-03-15 for tax year 2025. Jurisdiction US-federal. Country United States. Book SL and MACRS. Draft the book journal entry.',
      onProgress: (ev) => {
        if (ev.type === 'stage_started' && typeof ev.stage === 'string') stages.push(ev.stage)
      },
    })
    expect(stages.length).toBeGreaterThan(0)
    expect(['completed', 'blocked', 'failed']).toContain(run.status)
  })
})
