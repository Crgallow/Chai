import { useState } from 'react'
import { Info } from 'lucide-react'
import type { EvidenceConfidenceResult, SourceQualityResult, StructuredAnswer } from '../types'
import { evidenceLabelText } from '../scoring/evidenceConfidence'
import { sourceQualityLabelText } from '../scoring/sourceQuality'
import { ResearchColorLegend } from './ResearchColorLegend.tsx'
import {
  classifySourceAccent,
  confidenceTone,
  confidenceToneLabel,
  originLabel,
  sourceAccentLabel,
} from '../research/researchColors.ts'

const TOOLTIP =
  'Evidence confidence measures how well this answer is supported by applicable sources, complete facts, consistent guidance, and successful validation. It is not a guarantee of accuracy.'

interface SourcesAndConfidenceProps {
  structured: StructuredAnswer
}

function ScoreMeter({
  score,
  label,
  title,
  toneClass,
  toneLabel,
}: {
  score: number
  label: string
  title: string
  toneClass?: string
  toneLabel?: string
}) {
  return (
    <div className={`score-meter ${toneClass ?? ''}`} aria-label={`${toneLabel ?? label}: ${score} percent`}>
      <div className="score-meter-top">
        <strong>
          {score}% {title}
        </strong>
        <span className="score-label-text">{label}</span>
      </div>
      <div className="score-bar" role="img" aria-label={`${score} percent ${title}, ${label}`}>
        <span style={{ width: `${score}%` }} />
      </div>
      {toneLabel && <p className="field-hint">{toneLabel}</p>}
    </div>
  )
}

function Breakdown({ evidence }: { evidence: EvidenceConfidenceResult }) {
  const f = evidence.factors
  return (
    <div className="score-breakdown">
      <p>
        Applicable source support: {f.sourceSupport.earned}/{f.sourceSupport.possible}
      </p>
      <p>
        Complete material facts: {f.factCompleteness.earned}/{f.factCompleteness.possible}
      </p>
      <p>
        Year and jurisdiction: {f.applicability.earned}/{f.applicability.possible}
      </p>
      <p>
        Calculation validation: {f.validation.earned}/{f.validation.possible}
      </p>
      <p>
        Source agreement: {f.sourceAgreement.earned}/{f.sourceAgreement.possible}
      </p>
      <p>Pre-cap total: {evidence.preCapScore}/100</p>
      <p>
        <strong>Final evidence confidence: {evidence.score}/100</strong>
      </p>
      {evidence.capsApplied.length > 0 && (
        <ul className="validation-list">
          {evidence.capsApplied.map((c) => (
            <li key={c.code}>
              Cap ({c.code}): max {c.maxScore}% — {c.reason}
            </li>
          ))}
        </ul>
      )}
      {evidence.reasons && evidence.reasons.length > 0 && (
        <>
          <h4>Why this confidence score?</h4>
          <ul className="validation-list">
            {evidence.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export function SourcesAndConfidence({ structured }: SourcesAndConfidenceProps) {
  const isStudy = structured.responseMode === 'cpa_exam_study'
  const evidence = isStudy ? undefined : structured.evidenceConfidence
  const sourceQuality = isStudy ? undefined : structured.sourceQuality
  const [showWhy, setShowWhy] = useState(false)
  const [showSources, setShowSources] = useState(true)

  if (!evidence && !sourceQuality && !structured.research && !structured.cpaStudy?.citations?.length) {
    return null
  }

  const citations = structured.cpaStudy?.citations ??
    structured.research?.citations.map((c) => ({
      publisher: c.publisher,
      title: c.title,
      authorityType: c.authorityLevel,
      section: c.section,
      page: c.page,
      applicableYear: c.applicableYear,
      jurisdiction: structured.research?.context.jurisdiction,
      effectiveDate: undefined as string | undefined,
      verificationStatus: c.verified ? 'verified' : 'unverified',
      internalOrExternal: c.internalOrExternal,
      excerpt: c.quotedText,
      location: c.sourceUrl,
      demoData: c.demoData,
    })) ?? []

  const calcPassed =
    structured.cpaStudy?.calculation?.passedValidation ??
    (structured.schedules
      ? structured.schedules.every((s) => !s.validations.some((v) => /fail|error/i.test(v)))
      : undefined)
  const missingFacts =
    (structured.missingFacts?.length ?? 0) > 0 ||
    (structured.research?.missingInformation.length ?? 0) > 0 ||
    (structured.cpaStudy?.missingInformation.length ?? 0) > 0

  const confTone = evidence ? confidenceTone(evidence.label, evidence.score) : 'neutral'
  const confToneClass = `score-meter-confidence-${confTone}`

  const showLegend =
    !isStudy &&
    citations.some((c) => /aicpa|pcaob|au-?c|auditing/i.test(`${c.publisher} ${c.title} ${c.section || ''}`))

  return (
    <section className="sources-confidence">
      <h3 className="research-section-heading">{isStudy ? 'Citations' : 'Sources and Authority'}</h3>
      {evidence && (
        <div className="score-row">
          <ScoreMeter
            score={evidence.score}
            label={evidenceLabelText(evidence.label)}
            title="evidence confidence"
            toneClass={confToneClass}
            toneLabel={confidenceToneLabel(confTone)}
          />
          <button
            type="button"
            className="info-tip"
            title={TOOLTIP}
            aria-label={TOOLTIP}
          >
            <Info size={14} />
          </button>
        </div>
      )}
      {sourceQuality && (
        <ScoreMeter
          score={sourceQuality.score}
          label={sourceQualityLabelText(sourceQuality.label)}
          title="source quality"
          toneClass={
            sourceQuality.score >= 70
              ? 'score-meter-confidence-verified'
              : sourceQuality.score >= 50
                ? 'score-meter-confidence-warning'
                : 'score-meter-confidence-error'
          }
        />
      )}
      {showLegend && <ResearchColorLegend />}
      {!isStudy && (
        <ul className="validation-list score-meta">
          {(() => {
            const titles = new Set(citations.map((c) => `${c.publisher}|${c.title}`.toLowerCase()))
            const sections = new Set(
              citations
                .map((c) => c.section)
                .filter((s): s is string => Boolean(s && String(s).trim())),
            )
            const isAuditCitations = citations.some((c) =>
              /aicpa|pcaob|au-?c|auditing/i.test(`${c.publisher} ${c.title} ${c.section || ''}`),
            )
            if (isAuditCitations && citations.length) {
              return (
                <>
                  <li>Documents used: {titles.size}</li>
                  <li>Authoritative sections used: {sections.size || '—'}</li>
                  <li>Supporting passages used: {citations.length}</li>
                  {sourceQuality != null && (
                    <li>
                      Primary {sourceQuality.primarySources} · Secondary{' '}
                      {sourceQuality.secondarySources}
                    </li>
                  )}
                </>
              )
            }
            return (
              <li>
                Sources used: {sourceQuality?.sourcesEvaluated ?? citations.length}
                {sourceQuality != null && (
                  <>
                    {' '}
                    · Primary {sourceQuality.primarySources} · Secondary{' '}
                    {sourceQuality.secondarySources}
                  </>
                )}
              </li>
            )
          })()}
          {calcPassed != null && (
            <li>Calculations validation: {calcPassed ? 'passed' : 'failed / incomplete'}</li>
          )}
          <li>Material facts missing: {missingFacts ? 'yes' : 'no'}</li>
          <li>
            Professional review recommended:{' '}
            {evidence?.requiresProfessionalReview || structured.research?.requiresProfessionalReview
              ? 'yes'
              : 'no'}
          </li>
        </ul>
      )}
      {isStudy && (
        <p className="field-hint">
          Study these citations with the tutor explanation above. Chai does not show a probability that
          the answer is correct.
        </p>
      )}
      {!isStudy && (
        <p className="field-hint">
          Evidence confidence is not a statistical probability that the answer is correct.
        </p>
      )}
      {evidence && (
        <button type="button" className="text-btn" onClick={() => setShowWhy((v) => !v)}>
          {showWhy ? 'Hide' : 'Why is the score'} {evidence.score}%?
        </button>
      )}
      {showWhy && evidence && <Breakdown evidence={evidence} />}
      {sourceQuality && (
        <details className="tool-trace">
          <summary>Source quality factors</summary>
          <SourceQualityBreakdown sourceQuality={sourceQuality} />
        </details>
      )}
      {citations.length > 0 && (
        <>
          {!isStudy && (
            <button type="button" className="text-btn" onClick={() => setShowSources((v) => !v)}>
              {showSources ? 'Hide source cards' : 'Show source cards'}
            </button>
          )}
          {showSources && (
            <div className="citation-list">
              {citations.map((c, i) => {
                const accent = classifySourceAccent({
                  publisher: c.publisher,
                  title: c.title,
                  section: c.section,
                  authorityType: c.authorityType,
                  internalOrExternal: c.internalOrExternal,
                  verificationStatus: c.verificationStatus,
                  demoData: c.demoData,
                })
                const badgeClass =
                  accent === 'official-web'
                    ? 'research-source-badge-official-web'
                    : `research-source-badge-${accent}`
                const cardClass =
                  accent === 'official-web'
                    ? 'source-card-accent-official-web'
                    : `source-card-accent-${accent}`
                const citeTip = [
                  c.publisher,
                  c.title,
                  c.section ? `§ ${c.section}` : '',
                  c.page != null ? `p.${c.page}` : '',
                  c.excerpt ? c.excerpt.slice(0, 200) : '',
                ]
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <article
                    key={`${c.title}-${i}`}
                    className={`citation-chip source-card source-card-accent ${cardClass}`}
                  >
                    <header>
                      <span
                        className={`research-cite-chip research-cite-chip-${accent === 'official-web' ? 'verified' : accent === 'error' ? 'warning' : accent}`}
                        title={citeTip}
                        aria-label={`Citation ${i + 1}: ${citeTip}`}
                      >
                        [{i + 1}]
                      </span>
                      <span className="research-source-badge research-source-badge-neutral">
                        {sourceAccentLabel(accent)}
                      </span>
                    </header>
                    <div className="source-card-badges">
                      <span className={`research-source-badge ${badgeClass}`}>
                        {originLabel(c.internalOrExternal, c.verificationStatus === 'verified')}
                      </span>
                      {c.verificationStatus === 'verified' && (
                        <span className="research-source-badge research-source-badge-verified">
                          Citation verified
                        </span>
                      )}
                      {c.verificationStatus === 'unverified' && (
                        <span className="research-source-badge research-source-badge-warning">
                          Citation not verified
                        </span>
                      )}
                      {c.demoData && (
                        <span className="research-source-badge research-source-badge-warning">Demo</span>
                      )}
                    </div>
                    <strong>
                      {c.publisher}: {c.title}
                    </strong>
                    {(c.section || c.page != null) && (
                      <p className="field-hint">
                        {c.section ? `Section: ${c.section}` : ''}
                        {c.page != null ? ` · page ${c.page}` : ''}
                      </p>
                    )}
                    {(c.applicableYear || c.jurisdiction || c.effectiveDate) && (
                      <p className="field-hint">
                        {[
                          c.applicableYear ? `Year ${c.applicableYear}` : null,
                          c.jurisdiction,
                          c.effectiveDate ? `eff. ${c.effectiveDate}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                    {c.excerpt && <p>{c.excerpt}</p>}
                    {c.location && (
                      <p className="field-hint">
                        <a href={c.location} target="_blank" rel="noreferrer">
                          {c.location}
                        </a>
                      </p>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function SourceQualityBreakdown({ sourceQuality }: { sourceQuality: SourceQualityResult }) {
  const f = sourceQuality.factors
  return (
    <div className="score-breakdown">
      <p>
        Authority: {f.authority.earned}/{f.authority.possible} — {f.authority.explanation}
      </p>
      <p>
        Applicability: {f.applicability.earned}/{f.applicability.possible}
      </p>
      <p>
        Currency: {f.currency.earned}/{f.currency.possible}
      </p>
      <p>
        Coverage: {f.coverage.earned}/{f.coverage.possible}
      </p>
    </div>
  )
}
