import { useState } from 'react'
import { Info } from 'lucide-react'
import type { EvidenceConfidenceResult, SourceQualityResult, StructuredAnswer } from '../types'
import { evidenceLabelText } from '../scoring/evidenceConfidence'
import { sourceQualityLabelText } from '../scoring/sourceQuality'

const TOOLTIP =
  'Evidence confidence measures how well this answer is supported by applicable sources, complete facts, consistent guidance, and successful validation. It is not a guarantee of accuracy.'

interface SourcesAndConfidenceProps {
  structured: StructuredAnswer
}

function ScoreMeter({
  score,
  label,
  title,
}: {
  score: number
  label: string
  title: string
}) {
  return (
    <div className="score-meter">
      <div className="score-meter-top">
        <strong>
          {score}% {title}
        </strong>
        <span className="score-label-text">{label}</span>
      </div>
      <div className="score-bar" role="img" aria-label={`${score} percent ${title}, ${label}`}>
        <span style={{ width: `${score}%` }} />
      </div>
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
    </div>
  )
}

export function SourcesAndConfidence({ structured }: SourcesAndConfidenceProps) {
  const evidence = structured.evidenceConfidence
  const sourceQuality = structured.sourceQuality
  const [showWhy, setShowWhy] = useState(false)
  const [showSources, setShowSources] = useState(false)

  if (!evidence && !sourceQuality && !structured.research) return null

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

  return (
    <section className="sources-confidence">
      <h3>Sources and Confidence</h3>
      {evidence && (
        <div className="score-row">
          <ScoreMeter
            score={evidence.score}
            label={evidenceLabelText(evidence.label)}
            title="evidence confidence"
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
        />
      )}
      <ul className="validation-list score-meta">
        <li>
          Sources used: {sourceQuality?.sourcesEvaluated ?? citations.length}
          {sourceQuality != null && (
            <>
              {' '}
              · Primary {sourceQuality.primarySources} · Secondary {sourceQuality.secondarySources}
            </>
          )}
        </li>
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
      <p className="field-hint">
        Evidence confidence is not a statistical probability that the answer is correct.
      </p>
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
          <button type="button" className="text-btn" onClick={() => setShowSources((v) => !v)}>
            {showSources ? 'Hide source cards' : 'Show source cards'}
          </button>
          {showSources && (
            <div className="citation-list">
              {citations.map((c, i) => (
                <article key={`${c.title}-${i}`} className="citation-chip source-card">
                  <header>
                    <code>{c.internalOrExternal}</code>
                    <span>
                      {c.authorityType}
                      {c.demoData ? ' · DEMO' : ''}
                      {c.verificationStatus ? ` · ${c.verificationStatus}` : ''}
                    </span>
                  </header>
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
                      {c.applicableYear ? `Year ${c.applicableYear}` : ''}
                      {c.jurisdiction ? ` · ${c.jurisdiction}` : ''}
                      {c.effectiveDate ? ` · effective ${c.effectiveDate}` : ''}
                    </p>
                  )}
                  {c.excerpt && <blockquote className="doc-quote">“{c.excerpt}”</blockquote>}
                  {c.location && (
                    <a href={c.location} target="_blank" rel="noreferrer">
                      Source location
                    </a>
                  )}
                </article>
              ))}
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
