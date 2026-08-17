import type {
  ResearchRun,
  ResearchStage,
  ResearchStageRecord,
  ResearchStageStatus,
} from './schemas.ts'
import { STAGE_DISPLAY_LABELS, STAGE_ORDER } from './schemas.ts'

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
}

export function createEmptyStages(researchRunId: string): ResearchStageRecord[] {
  return STAGE_ORDER.filter((s) => s !== 'completed').map((stage) => ({
    id: uid('stage'),
    researchRunId,
    stage,
    status: 'pending' as ResearchStageStatus,
    sourceIds: [],
    toolCalls: [],
    warnings: [],
    errors: [],
    requiresUserInput: false,
    displayLabel: STAGE_DISPLAY_LABELS[stage],
  }))
}

export function getStage(run: ResearchRun, stage: ResearchStage): ResearchStageRecord | undefined {
  return run.stages.find((s) => s.stage === stage)
}

export function canBeginStage(run: ResearchRun, stage: ResearchStage): { ok: boolean; reason?: string } {
  if (run.status === 'blocked' || run.status === 'failed') {
    return { ok: false, reason: `Run is ${run.status}` }
  }
  const idx = STAGE_ORDER.indexOf(stage)
  if (idx <= 0) return { ok: true }

  for (let i = 0; i < idx; i++) {
    const prior = STAGE_ORDER[i]
    if (prior === 'completed') continue
    const rec = getStage(run, prior)
    if (!rec) return { ok: false, reason: `Missing prior stage ${prior}` }
    if (rec.status === 'blocked') {
      return { ok: false, reason: `Prior stage ${prior} is blocked` }
    }
    if (rec.status === 'failed') {
      return { ok: false, reason: `Prior stage ${prior} failed` }
    }
    if (rec.status === 'pending' || rec.status === 'in_progress') {
      return { ok: false, reason: `Prior stage ${prior} is not finished` }
    }
    // completed | completed_with_warnings | not_required are OK
  }
  return { ok: true }
}

export function markStage(
  run: ResearchRun,
  stage: ResearchStage,
  patch: Partial<ResearchStageRecord>,
): ResearchRun {
  const now = new Date().toISOString()
  const stages = run.stages.map((s) => {
    if (s.stage !== stage) return s
    return {
      ...s,
      ...patch,
      toolCalls: patch.toolCalls ?? s.toolCalls,
      warnings: patch.warnings ?? s.warnings,
      errors: patch.errors ?? s.errors,
      sourceIds: patch.sourceIds ?? s.sourceIds,
    }
  })
  return {
    ...run,
    stages,
    currentStage: stage,
    updatedAt: now,
  }
}

export function startStage(run: ResearchRun, stage: ResearchStage): ResearchRun {
  const gate = canBeginStage(run, stage)
  if (!gate.ok) {
    throw new Error(gate.reason || 'Cannot begin stage')
  }
  const now = new Date().toISOString()
  return markStage(run, stage, {
    status: 'in_progress',
    startedAt: now,
    errors: [],
  })
}

export function completeStage(
  run: ResearchRun,
  stage: ResearchStage,
  opts: {
    status?: Extract<
      ResearchStageStatus,
      'completed' | 'completed_with_warnings' | 'not_required' | 'blocked' | 'failed'
    >
    summary?: string
    warnings?: string[]
    errors?: string[]
    sourceIds?: string[]
    toolCalls?: ResearchStageRecord['toolCalls']
    requiresUserInput?: boolean
  },
): ResearchRun {
  const now = new Date().toISOString()
  let next = markStage(run, stage, {
    status: opts.status ?? 'completed',
    completedAt: now,
    summary: opts.summary,
    warnings: opts.warnings ?? [],
    errors: opts.errors ?? [],
    sourceIds: opts.sourceIds,
    toolCalls: opts.toolCalls,
    requiresUserInput: opts.requiresUserInput ?? false,
  })
  if (opts.status === 'blocked') {
    next = { ...next, status: 'blocked', currentStage: 'blocked' }
  } else if (opts.status === 'failed') {
    next = { ...next, status: 'failed', currentStage: 'failed' }
  }
  return next
}
