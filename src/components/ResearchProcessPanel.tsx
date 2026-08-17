import { useEffect, useState } from 'react'
import type { ResearchRun, ResearchStageStatus } from '../research/schemas'
import { STAGE_DISPLAY_LABELS } from '../research/schemas'

interface ResearchProcessPanelProps {
  run: ResearchRun
}

const ORDER = [
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
] as const

function glyph(status: ResearchStageStatus): string {
  if (status === 'completed' || status === 'completed_with_warnings' || status === 'not_required') {
    return '✓'
  }
  if (status === 'in_progress') return '●'
  if (status === 'blocked' || status === 'failed') return '!'
  return '○'
}

function statusLabel(status: ResearchStageStatus): string {
  return status.replace(/_/g, ' ')
}

export function ResearchProcessPanel({ run }: ResearchProcessPanelProps) {
  const active =
    run.stages.find((s) => s.status === 'in_progress')?.stage ||
    run.stages.find((s) => s.status === 'blocked')?.stage ||
    run.currentStage
  const [openId, setOpenId] = useState<string | null>(active)

  useEffect(() => {
    setOpenId(active)
  }, [active, run.updatedAt])

  const byName = new Map(run.stages.map((s) => [s.stage, s]))

  return (
    <section className="research-process">
      <h3>Accounting research process</h3>
      <p className="field-hint">
        Application-enforced workflow — public stage summaries only (not model chain-of-thought).
        {run.usedResponsesApi ? ' · Responses API' : ''}
        {run.usedMockProvider ? ' · mock research' : ''}
        {' · store: false'}
        {run.mockLabeled === true || run.usedMockProvider ? ' · labeled mock when no live key' : ''}
      </p>
      <p className="field-hint">
        Current: <strong>{STAGE_DISPLAY_LABELS[run.currentStage] ?? run.currentStage}</strong> · {run.status} ·{' '}
        {run.researchVersion}
      </p>

      <ol className="research-timeline" aria-label="Research stages">
        {ORDER.map((name) => {
          const stage = byName.get(name)
          const status = stage?.status ?? 'pending'
          const label = STAGE_DISPLAY_LABELS[name] ?? name
          const open = openId === name
          return (
            <li key={name} className={`research-stage is-${status}`}>
              <button
                type="button"
                className="research-stage-head"
                onClick={() => setOpenId(open ? null : name)}
                aria-expanded={open}
              >
                <span className="research-glyph" aria-hidden>
                  {glyph(status)}
                </span>
                <span className="research-stage-title">{label}</span>
                <span className="research-stage-status">{statusLabel(status)}</span>
              </button>
              {open && stage && (
                <div className="research-stage-body">
                  {stage.summary && <p>{stage.summary}</p>}
                  {stage.completedAt && (
                    <p className="field-hint">Completed: {new Date(stage.completedAt).toLocaleString()}</p>
                  )}
                  {stage.toolCalls.length > 0 && (
                    <>
                      <h4>Tools</h4>
                      <ul>
                        {stage.toolCalls.map((t) => (
                          <li key={t.id}>
                            <code>{t.name}</code> — {t.resultSummary}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {stage.sourceIds.length > 0 && (
                    <p className="field-hint">Sources: {stage.sourceIds.join(', ')}</p>
                  )}
                  {stage.warnings.map((w) => (
                    <p key={w} className="field-hint">
                      Warning: {w}
                    </p>
                  ))}
                  {stage.errors.map((e) => (
                    <p key={e} className="field-hint">
                      Error: {e}
                    </p>
                  ))}
                  {stage.requiresUserInput && (
                    <p className="online-banner">Waiting for user input before continuing.</p>
                  )}

                  {name === 'question' && run.facts && (
                    <>
                      <h4>Question</h4>
                      <p>{run.facts.originalQuestion}</p>
                      <h4>Structured facts</h4>
                      <ul>
                        {run.facts.userProvidedFacts.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {name === 'identify_issue' && run.issues.length > 0 && (
                    <ul>
                      {run.issues.map((i) => (
                        <li key={i.issueId}>
                          <strong>
                            {i.priority}: {i.title}
                          </strong>{' '}
                          ({i.category}) — {i.whyItMatters || i.description}
                        </li>
                      ))}
                    </ul>
                  )}
                  {name === 'determine_jurisdiction_year' && run.context && (
                    <ul className="validation-list">
                      <li>Country: {run.context.country ?? '—'}</li>
                      <li>Jurisdiction: {run.context.jurisdiction ?? '—'}</li>
                      <li>Year: {run.context.taxYear ?? '—'}</li>
                      <li>
                        Framework:{' '}
                        {run.context.accountingFramework ?? run.context.auditFramework ?? '—'}
                      </li>
                    </ul>
                  )}
                  {name === 'search_primary_authority' &&
                    run.primarySources.slice(0, 5).map((s) => (
                      <article key={s.sourceId} className="citation-chip">
                        <strong>
                          {s.publisher}: {s.title}
                        </strong>
                        <span className="kind-pill kind-tax">primary</span>
                        {s.exactPassage && (
                          <blockquote className="doc-quote">“{s.exactPassage.slice(0, 220)}”</blockquote>
                        )}
                      </article>
                    ))}
                  {name === 'search_secondary_authority' &&
                    run.secondarySources.slice(0, 5).map((s) => (
                      <article key={s.sourceId} className="citation-chip">
                        <strong>
                          {s.publisher}: {s.title}
                        </strong>
                        <span className="kind-pill kind-book">secondary</span>
                      </article>
                    ))}
                  {name === 'extract_relevant_passages' &&
                    run.passages.map((p) => (
                      <article key={p.passageId} className="citation-chip">
                        <code>{p.passageId}</code> · {p.primaryOrSecondary}
                        <p>{p.relevanceSummary}</p>
                        <blockquote className="doc-quote">“{p.exactText.slice(0, 220)}”</blockquote>
                      </article>
                    ))}
                  {name === 'perform_calculation' && run.calculation && (
                    <>
                      <p>{run.calculation.primaryResultSummary || '—'}</p>
                      <p className="field-hint">
                        Validation: {run.calculation.passed ? 'passed' : 'failed'}
                      </p>
                    </>
                  )}
                  {name === 'cross_check_calculation' && (
                    <p>
                      {run.calculation?.crossCheckSummary ||
                        (run.calculation?.passed
                          ? 'Calculation cross-check passed'
                          : 'Cross-check not completed')}
                    </p>
                  )}
                  {name === 'validate_citations' && run.citationCoverage && (
                    <>
                      <p>{run.citationCoverage.summary}</p>
                      <p className="field-hint">
                        Cited {run.citationCoverage.citedConclusions}/
                        {run.citationCoverage.totalConclusions}
                      </p>
                    </>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
