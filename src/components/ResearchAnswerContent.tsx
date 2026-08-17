import type { ReactNode } from 'react'
import {
  isInternetFallbackText,
  isUnsupportedText,
  parseResearchAnswerSections,
  type ResearchAccent,
} from '../research/researchColors.ts'

interface ResearchAnswerContentProps {
  content: string
  unableToConclude?: boolean
}

function FrameworkBadge({ accent, label }: { accent: ResearchAccent; label: string }) {
  if (accent === 'pcaob') {
    return (
      <span className="research-badge research-badge-pcaob" title="Comparison framework only">
        Comparison framework · {label}
      </span>
    )
  }
  if (accent === 'aicpa') {
    return <span className="research-badge research-badge-aicpa">{label}</span>
  }
  return null
}

function Callout({
  tone,
  label,
  children,
}: {
  tone: 'verified' | 'warning' | 'error' | 'neutral'
  label: string
  children: ReactNode
}) {
  return (
    <div className={`research-callout research-callout-${tone}`} role="note" aria-label={label}>
      <span className="research-callout-label">{label}</span>
      <div className="research-callout-body">{children}</div>
    </div>
  )
}

export function ResearchAnswerContent({ content, unableToConclude }: ResearchAnswerContentProps) {
  const sections = parseResearchAnswerSections(content)

  if (!sections) {
    if (unableToConclude || isUnsupportedText(content)) {
      return (
        <Callout tone="error" label="Insufficient authority">
          {content}
        </Callout>
      )
    }
    return <div className="message-body research-body-neutral">{content}</div>
  }

  return (
    <article className="research-answer" aria-label="Research answer">
      {sections.map((section) => {
        const isConclusion = /direct conclusion/i.test(section.title)
        const isPcaob = section.accent === 'pcaob'
        const isFramework = /applicable framework/i.test(section.title)
        const isResearchPath = /research-path disclosure/i.test(section.title)
        const isMissing = /missing facts|assumptions/i.test(section.title)

        return (
          <section
            key={section.title}
            className={[
              'research-answer-section',
              `research-section-accent-${section.accent}`,
              isConclusion ? 'research-conclusion-block' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <h4 className="research-section-heading">{section.title}</h4>
            {isFramework && (
              <FrameworkBadge accent="aicpa" label="AICPA U.S. GAAS (primary framework)" />
            )}
            {isPcaob && (
              <FrameworkBadge accent="pcaob" label="PCAOB standards" />
            )}
            <div className="research-section-body">
              {section.lines.map((line, i) => {
                const trimmed = line.trim()
                if (!trimmed) return null

                if (isResearchPath && isInternetFallbackText(trimmed)) {
                  return (
                    <Callout key={i} tone="warning" label="Internet fallback">
                      {trimmed.replace(/^Research path:\s*/i, '')}
                    </Callout>
                  )
                }
                if (isResearchPath && /uploaded authoritative.*no internet/i.test(trimmed)) {
                  return (
                    <Callout key={i} tone="verified" label="Internal standards only">
                      {trimmed.replace(/^Research path:\s*/i, '')}
                    </Callout>
                  )
                }
                if (isResearchPath) {
                  return (
                    <Callout key={i} tone="neutral" label="Research path">
                      {trimmed.replace(/^Research path:\s*/i, '')}
                    </Callout>
                  )
                }
                if (isMissing) {
                  return (
                    <Callout key={i} tone="warning" label="Assumption or missing fact">
                      {trimmed.replace(/^[-*]\s*/, '')}
                    </Callout>
                  )
                }
                if (/^Documents used:|^Authoritative sections|^Supporting passages|^Standards\/frameworks|^Sections\/paragraphs/i.test(trimmed)) {
                  return (
                    <p key={i} className="research-meta-line">
                      {trimmed}
                    </p>
                  )
                }
                if (/^\(\d+\)\s/.test(trimmed)) {
                  const fw = /PCAOB|AS\s+\d/i.test(trimmed) ? 'pcaob' : 'aicpa'
                  return (
                    <p key={i} className={`research-standard-line research-accent-${fw}`}>
                      {trimmed}
                    </p>
                  )
                }

                return (
                  <p key={i} className="research-body-line">
                    {trimmed.replace(/^[-*]\s*/, '')}
                  </p>
                )
              })}
            </div>
          </section>
        )
      })}
    </article>
  )
}
